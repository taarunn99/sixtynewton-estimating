// Manual digest send: npx tsx scripts/send-digest.ts [email ...]
// With no arguments it sends to every app user. Runs the same collector and
// renderer as the weekly cron, against the live database, with real
// below-cost counts computed through the pure engine.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { computeQuote } from "../src/lib/engine";
import { loadLiveQuote } from "../tests/live-helpers";
import { collectDigestData, renderDigest } from "../src/lib/mail/digest";
import { sendMail } from "../src/lib/mail/resend";

config({ path: ".env.local" });

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const belowCost = async (quoteId: string) => {
    const { data: q } = await supabase
      .from("quotes")
      .select("number, revision")
      .eq("id", quoteId)
      .single();
    if (!q) return 0;
    const { quoteInput, ref, lines, history } = await loadLiveQuote(q.number, q.revision);
    const totals = computeQuote(quoteInput, ref, history);
    return totals.lines.filter((b, i) => {
      const line = lines[i];
      return line.included && b.nudges.some((n) => n.rule === "below_cost_floor");
    }).length;
  };

  const data = await collectDigestData(supabase, belowCost);
  const mail = renderDigest(data);

  let to = process.argv.slice(2);
  if (!to.length) {
    const { data: users } = await supabase.auth.admin.listUsers({ perPage: 100 });
    to = (users?.users ?? []).map((u) => u.email).filter((e): e is string => !!e);
  }
  console.log("subject:", mail.subject);
  console.log("sending to:", to.join(", "));
  const result = await sendMail({ to, subject: mail.subject, html: mail.html, text: mail.text });
  console.log(result.error ? "FAILED: " + result.error : "sent, message id " + result.id);
}
main();
