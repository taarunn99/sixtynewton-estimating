// Follow-up reminder engine (UPDATE_FINAL_RATEBOOK_MAIL.md part 2). Pure
// cadence maths plus the email composer. Reminders at 3, 6, 9 and 12 days
// since issue or since the last follow-up, whichever is later; a validity
// warning at day 14 of the 15 day window; automatic expiry after day 15.
// Won and Lost stop everything. One email per day at most: a single digest.
// The email may show the quote total, never internal build-up figures.

export interface ReminderQuote {
  id: string;
  number: string;
  revision: number;
  client: string;
  site: string;
  status: "issued" | "followed_up";
  issuedAt: string;
  validDays: number;
  lastFollowUpAt: string | null;
  lastFollowUpNote: string | null;
  totalQuoted: number | null;
}

export interface SentMark {
  quoteId: string;
  dayMark: number;
  anchorDate: string;
}

export type DueKind = "reminder" | "validity" | "expiry";

export interface DueItem {
  quote: ReminderQuote;
  kind: DueKind;
  dayMark: number;
  anchorDate: string;
  daysOpen: number;
}

const DAY = 86400000;
const REMINDER_MARKS = [3, 6, 9, 12];
const VALIDITY_MARK = 14;
const EXPIRY_MARK = 15;

const dateOnly = (iso: string) => iso.slice(0, 10);
const daysBetween = (fromIso: string, now: Date) =>
  Math.floor((now.getTime() - Date.parse(fromIso)) / DAY);

// Returns the digest items due today (one per quote at most, oldest first)
// and the ids of quotes that must flip to expired.
export function computeDue(
  quotes: ReminderQuote[],
  sent: SentMark[],
  now: Date
): { due: DueItem[]; expire: string[] } {
  const sentKeys = new Set(sent.map((s) => `${s.quoteId}|${s.dayMark}|${s.anchorDate}`));
  const due: DueItem[] = [];
  const expire: string[] = [];

  for (const q of quotes) {
    const daysOpen = daysBetween(q.issuedAt, now);
    const issueAnchor = dateOnly(q.issuedAt);
    const validity = q.validDays || 15;
    const already = (mark: number, anchor: string) => sentKeys.has(`${q.id}|${mark}|${anchor}`);

    if (daysOpen > validity) {
      expire.push(q.id);
      if (!already(EXPIRY_MARK, issueAnchor)) {
        due.push({ quote: q, kind: "expiry", dayMark: EXPIRY_MARK, anchorDate: issueAnchor, daysOpen });
      }
      continue;
    }
    if (daysOpen >= VALIDITY_MARK) {
      if (!already(VALIDITY_MARK, issueAnchor)) {
        due.push({ quote: q, kind: "validity", dayMark: VALIDITY_MARK, anchorDate: issueAnchor, daysOpen });
      }
      continue;
    }

    const anchorIso =
      q.lastFollowUpAt && Date.parse(q.lastFollowUpAt) > Date.parse(q.issuedAt)
        ? q.lastFollowUpAt
        : q.issuedAt;
    const anchorDate = dateOnly(anchorIso);
    const sinceAnchor = daysBetween(anchorIso, now);
    // The highest reached mark only: a missed cron day never causes a burst,
    // and once a mark is logged nothing lower ever fires after it.
    const mark = [...REMINDER_MARKS].reverse().find((m) => sinceAnchor >= m);
    if (mark !== undefined && !already(mark, anchorDate)) {
      due.push({ quote: q, kind: "reminder", dayMark: mark, anchorDate, daysOpen });
    }
  }

  due.sort((a, b) => Date.parse(a.quote.issuedAt) - Date.parse(b.quote.issuedAt));
  return { due, expire };
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function renderFollowUps(
  items: DueItem[],
  appUrl: string
): { subject: string; html: string; text: string } {
  const first = items[0];
  const subject =
    items.length === 1
      ? `Follow up: ${first.quote.number} R${first.quote.revision} ${first.quote.client}, day ${first.daysOpen}${first.quote.totalQuoted !== null ? `, ${fmt(first.quote.totalQuoted)} AED` : ""}`
      : `Follow up: ${items.length} quotations need attention`;

  const line = (i: DueItem) => {
    const q = i.quote;
    const head =
      i.kind === "expiry"
        ? "Expired: the 15 day validity has passed. Reissue if the client is still live."
        : i.kind === "validity"
          ? "Expires tomorrow: the quotation is valid 15 days."
          : `Day ${i.daysOpen} open, reminder ${i.dayMark} days since last touch.`;
    const url = `${appUrl}/quotes/${q.id}`;
    return `
    <div style="border:1px solid #DDD6C7;border-radius:8px;padding:12px 14px;margin:0 0 10px">
      <div style="font-size:15px;font-weight:bold">${q.number} R${q.revision} ${q.client}${q.site && q.site !== q.client ? ", " + q.site : ""}</div>
      <div style="font-size:13px;color:#5B636E;margin-top:2px">${head}</div>
      <div style="font-size:13px;margin-top:4px;font-variant-numeric:tabular-nums">
        Issued ${dateOnly(q.issuedAt)} (${i.daysOpen} days ago)${q.totalQuoted !== null ? ` and worth AED ${fmt(q.totalQuoted)}` : ""}. Status: ${q.status === "followed_up" ? "followed up" : "issued"}${q.lastFollowUpAt ? `, last touch ${dateOnly(q.lastFollowUpAt)}${q.lastFollowUpNote ? " (" + q.lastFollowUpNote + ")" : ""}` : ""}.
      </div>
      <div style="font-size:13px;margin-top:6px">
        <a href="${url}" style="color:#96772B">Open quote</a> &nbsp;
        <a href="${url}#follow-up" style="color:#96772B">Mark followed up</a> &nbsp;
        <a href="${url}#follow-up" style="color:#96772B">Mark won / lost</a>
      </div>
    </div>`;
  };

  const html = `
  <div style="font-family:Georgia,serif;color:#1C1713;max-width:640px;margin:0 auto;padding:24px">
    <div style="border-bottom:2px solid #C2A05C;padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:20px;font-weight:bold">Sixty Newton</div>
      <div style="font-size:12px;color:#96772B">Quotation follow-ups</div>
    </div>
    ${items.map(line).join("")}
    <p style="margin:14px 0 0;font-size:12px;color:#8A7E68">
      Internal mail. Open the quote and sign in to change its status; nothing changes from this email itself.
    </p>
  </div>`;

  const text = items
    .map((i) => {
      const q = i.quote;
      return `${q.number} R${q.revision} ${q.client}: ${
        i.kind === "expiry"
          ? "expired, 15 day validity passed"
          : i.kind === "validity"
            ? "expires tomorrow"
            : `day ${i.daysOpen}, reminder`
      }${q.totalQuoted !== null ? `, AED ${fmt(q.totalQuoted)}` : ""}. ${appUrl}/quotes/${q.id}`;
    })
    .join("\n");

  return { subject, html, text };
}
