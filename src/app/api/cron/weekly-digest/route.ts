// Weekly digest mail, Mondays 04:00 UTC (08:00 Dubai). Protected by
// CRON_SECRET. Sends to every app user from MAIL_FROM via Resend.
import { NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { computeLedger } from "@/lib/engine-server";
import { collectDigestData, renderDigest } from "@/lib/mail/digest";
import { sendMail } from "@/lib/mail/resend";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();
  const belowCost = async (quoteId: string) => {
    const ledger = await computeLedger(quoteId);
    if (!ledger) return 0;
    return ledger.lines.filter(
      (l) => l.included && l.nudges.some((n) => n.rule === "below_cost_floor")
    ).length;
  };

  const data = await collectDigestData(supabase, belowCost);
  const mail = renderDigest(data);

  const { data: users } = await supabase.auth.admin.listUsers({ perPage: 100 });
  const to = (users?.users ?? []).map((u) => u.email).filter((e): e is string => !!e);
  if (!to.length) return Response.json({ error: "No recipients" }, { status: 500 });

  const result = await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
  if (result.error) return Response.json({ error: result.error }, { status: 502 });
  return Response.json({ sent: to.length, id: result.id, issued: data.issued.length, drafts: data.draftsTouched.length });
}
