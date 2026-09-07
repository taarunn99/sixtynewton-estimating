// Thin Resend sender over fetch, no SDK dependency. Server side only; the
// API key never leaves the environment.

export interface SendResult {
  id?: string;
  error?: string;
}

export async function sendMail(args: {
  to: string[];
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { error: "RESEND_API_KEY is not set" };
  const from = process.env.MAIL_FROM ?? "quotes@60newton.com";
  const replyTo = process.env.MAIL_REPLY_TO ?? "tarun.s@lapizblue.com";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `Sixty Newton estimating <${from}>`,
      reply_to: replyTo,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok) return { error: body.message ?? `Resend returned ${res.status}` };
  return { id: body.id };
}
