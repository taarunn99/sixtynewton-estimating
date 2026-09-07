// Daily follow-up reminders, 08:00 Asia/Dubai (04:00 UTC). CRON_SECRET
// protected, same pattern as the other crons. One digest email at most per
// run; every send logged so no day mark ever fires twice; a Resend failure
// logs nothing and retries tomorrow.
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { computeDue, renderFollowUps, type ReminderQuote } from "@/lib/mail/followups";
import { sendMail } from "@/lib/mail/resend";

export const maxDuration = 60;

const APP_URL = "https://sixtynewton-estimating.vercel.app";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();
  const [{ data: quotes }, { data: log }, { data: settings }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, revision, status, issued_at, valid_days, totals, clients(name), sites(name)")
      .in("status", ["issued", "followed_up"])
      .not("issued_at", "is", null),
    supabase.from("reminder_log").select("quote_id, day_mark, anchor_date"),
    supabase.from("settings").select("reminder_recipients").single(),
  ]);

  const ids = (quotes ?? []).map((q) => q.id);
  const { data: followups } = ids.length
    ? await supabase
        .from("quote_followups")
        .select("quote_id, at, note")
        .in("quote_id", ids)
        .order("at", { ascending: false })
    : { data: [] };
  const lastByQuote = new Map<string, { at: string; note: string | null }>();
  for (const f of followups ?? []) {
    if (!lastByQuote.has(f.quote_id)) lastByQuote.set(f.quote_id, { at: f.at, note: f.note });
  }

  const reminderQuotes: ReminderQuote[] = (quotes ?? []).map((q) => ({
    id: q.id,
    number: q.number,
    revision: q.revision,
    client: (q.clients as { name?: string } | null)?.name ?? "No client",
    site: (q.sites as { name?: string } | null)?.name ?? "",
    status: q.status as "issued" | "followed_up",
    issuedAt: q.issued_at,
    validDays: q.valid_days ?? 15,
    lastFollowUpAt: lastByQuote.get(q.id)?.at ?? null,
    lastFollowUpNote: lastByQuote.get(q.id)?.note ?? null,
    totalQuoted: (q.totals as { totalQuoted?: number } | null)?.totalQuoted ?? null,
  }));

  const { due, expire } = computeDue(
    reminderQuotes,
    (log ?? []).map((l) => ({ quoteId: l.quote_id, dayMark: l.day_mark, anchorDate: l.anchor_date })),
    new Date()
  );

  if (expire.length) {
    await supabase.from("quotes").update({ status: "expired" }).in("id", expire);
  }

  if (!due.length) return Response.json({ sent: 0, expired: expire.length });

  const recipients = Array.isArray(settings?.reminder_recipients)
    ? (settings!.reminder_recipients as string[])
    : [];
  if (!recipients.length) return Response.json({ error: "No reminder recipients configured" }, { status: 500 });

  const mail = renderFollowUps(due, APP_URL);
  const result = await sendMail({ to: recipients, subject: mail.subject, html: mail.html, text: mail.text });
  if (result.error) {
    // Log nothing so tomorrow retries the same marks; never crash the cron
    return Response.json({ error: result.error, retried: "tomorrow" }, { status: 200 });
  }

  await supabase.from("reminder_log").insert(
    due.map((d) => ({
      quote_id: d.quote.id,
      day_mark: d.dayMark,
      anchor_date: d.anchorDate,
      resend_id: result.id ?? null,
    }))
  );

  return Response.json({ sent: due.length, expired: expire.length, id: result.id });
}
