// One-off test of the follow-up digest: renders a realistic due list and
// sends it to the seeded reminder recipients, subject marked Test. The real
// cron sends only for genuinely issued quotes.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { computeDue, renderFollowUps, type ReminderQuote } from "../src/lib/mail/followups";
import { sendMail } from "../src/lib/mail/resend";

config({ path: ".env.local" });

const DAY = 86400000;
const at = (d: number) => new Date(Date.now() - d * DAY).toISOString();

async function main() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: settings } = await supabase.from("settings").select("reminder_recipients").single();
  const to = Array.isArray(settings?.reminder_recipients)
    ? (settings!.reminder_recipients as string[])
    : [];
  if (!to.length) {
    console.log("no recipients configured");
    return;
  }

  const sample: ReminderQuote[] = [
    {
      id: "0476300e-e7eb-482e-84d6-d61deb3db98c",
      number: "QT-000299",
      revision: 2,
      client: "Jumeirah Bay",
      site: "Jumeirah Bay Island",
      status: "followed_up",
      issuedAt: at(9),
      validDays: 15,
      lastFollowUpAt: at(3),
      lastFollowUpNote: "spoke to the PM, awaiting LPO",
      totalQuoted: 216147,
    },
    {
      id: "0476300e-e7eb-482e-84d6-d61deb3db98c",
      number: "QT-000304",
      revision: 1,
      client: "China Stone Construction",
      site: "The Ring, Palm Jumeirah",
      status: "issued",
      issuedAt: at(14),
      validDays: 15,
      lastFollowUpAt: null,
      lastFollowUpNote: null,
      totalQuoted: 1119715,
    },
  ];
  const { due } = computeDue(sample, [], new Date());
  const mail = renderFollowUps(due, "https://sixtynewton-estimating.vercel.app");
  const result = await sendMail({
    to,
    subject: `Test: ${mail.subject}`,
    html: mail.html,
    text: mail.text,
  });
  console.log("recipients:", to.join(", "));
  console.log("subject: Test:", mail.subject);
  console.log("---");
  console.log(mail.text);
  console.log("---");
  console.log(result.error ? "FAILED: " + result.error : "sent, message id " + result.id);
}
main();
