// Follow-up reminder engine: cadence, reset on follow-up, dedupe, digest
// grouping, stop on won or lost, and the email render containing no internal
// build-up figures.
import { describe, it, expect } from "vitest";
import {
  computeDue,
  renderFollowUps,
  type ReminderQuote,
  type SentMark,
} from "../src/lib/mail/followups";

const DAY = 86400000;
const iso = (d: Date) => d.toISOString();

function quote(over: Partial<ReminderQuote> = {}): ReminderQuote {
  return {
    id: "q1",
    number: "QT-000299",
    revision: 2,
    client: "Jumeirah Bay",
    site: "Jumeirah Bay Island",
    status: "issued",
    issuedAt: iso(new Date(Date.now() - 6 * DAY)),
    validDays: 15,
    lastFollowUpAt: null,
    lastFollowUpNote: null,
    totalQuoted: 249000,
    ...over,
  };
}

const at = (daysAgo: number) => iso(new Date(Date.now() - daysAgo * DAY));

describe("cadence maths", () => {
  it.each([
    [2, undefined],
    [3, 3],
    [5, 3],
    [6, 6],
    [9, 9],
    [12, 12],
  ])("day %s since issue fires mark %s", (days, mark) => {
    const { due } = computeDue([quote({ issuedAt: at(days as number) })], [], new Date());
    if (mark === undefined) expect(due).toHaveLength(0);
    else {
      expect(due).toHaveLength(1);
      expect(due[0].dayMark).toBe(mark);
      expect(due[0].kind).toBe("reminder");
    }
  });

  it("day 14 sends the validity warning, day 16 expires with one final note", () => {
    const v = computeDue([quote({ issuedAt: at(14) })], [], new Date());
    expect(v.due[0].kind).toBe("validity");
    expect(v.expire).toHaveLength(0);
    const e = computeDue([quote({ issuedAt: at(16) })], [], new Date());
    expect(e.due[0].kind).toBe("expiry");
    expect(e.expire).toEqual(["q1"]);
  });

  it("a follow-up resets the reminder clock", () => {
    const q = quote({ issuedAt: at(10), lastFollowUpAt: at(2), status: "followed_up" });
    expect(computeDue([q], [], new Date()).due).toHaveLength(0);
    const q3 = quote({ issuedAt: at(10), lastFollowUpAt: at(3), status: "followed_up" });
    const { due } = computeDue([q3], [], new Date());
    expect(due).toHaveLength(1);
    expect(due[0].dayMark).toBe(3);
  });

  it("never sends the same day mark twice", () => {
    const q = quote({ issuedAt: at(6) });
    const sent: SentMark[] = [{ quoteId: "q1", dayMark: 6, anchorDate: q.issuedAt.slice(0, 10) }];
    expect(computeDue([q], sent, new Date()).due).toHaveLength(0);
  });

  it("a missed cron day sends only the highest eligible mark, no burst", () => {
    const { due } = computeDue([quote({ issuedAt: at(7) })], [], new Date());
    expect(due).toHaveLength(1);
    expect(due[0].dayMark).toBe(6);
  });

  it("won and lost never enter (filtered upstream); digest orders oldest first", () => {
    const a = quote({ id: "a", number: "QT-000100", issuedAt: at(12) });
    const b = quote({ id: "b", number: "QT-000200", issuedAt: at(3) });
    const { due } = computeDue([b, a], [], new Date());
    expect(due.map((d) => d.quote.number)).toEqual(["QT-000100", "QT-000200"]);
  });
});

describe("email render", () => {
  it("single quote subject carries number, day and total", () => {
    const { due } = computeDue([quote({ issuedAt: at(6) })], [], new Date());
    const mail = renderFollowUps(due, "https://app.example");
    expect(mail.subject).toContain("QT-000299 R2");
    expect(mail.subject).toContain("day 6");
    expect(mail.subject).toContain("249,000 AED");
    expect(mail.html).toContain("/quotes/q1");
  });

  it("several quotes collapse into one digest", () => {
    const a = quote({ id: "a", number: "QT-000100", issuedAt: at(9) });
    const b = quote({ id: "b", number: "QT-000200", issuedAt: at(3) });
    const mail = renderFollowUps(computeDue([a, b], [], new Date()).due, "https://app.example");
    expect(mail.subject).toContain("2 quotations");
    expect(mail.html).toContain("QT-000100");
    expect(mail.html).toContain("QT-000200");
  });

  it("shows the total but never internal build-up figures", () => {
    const mail = renderFollowUps(computeDue([quote({ issuedAt: at(6) })], [], new Date()).due, "https://app.example");
    // Strip CSS style attributes; the assertion is about visible content
    const visible = mail.subject + mail.html.replace(/style="[^"]*"/g, "") + mail.text;
    expect(visible).toContain("249,000");
    expect(visible).not.toMatch(/cost|floor|labour|margin/i);
    expect(visible).not.toMatch(/[–—]/);
  });
});
