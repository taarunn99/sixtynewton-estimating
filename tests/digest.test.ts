// Digest mail composer: correct shape, internal-safe content, no dashes.
import { describe, it, expect } from "vitest";
import { renderDigest, type DigestData } from "../src/lib/mail/digest";

const data: DigestData = {
  windowDays: 7,
  issued: [{ number: "QT-000305", revision: 1, client: "Azizi Developments", totalQuoted: 339150 }],
  draftsTouched: [
    { number: "QT-000299", revision: 2, client: "Jumeirah Bay", belowCostLines: 2 },
    { number: "QT-000306", revision: 1, client: "White Pearl Interiors", belowCostLines: 0 },
  ],
  staleDrafts: [{ number: "QT-000290", revision: 1, client: "Old Client", ageDays: 21 }],
  newProducts: 12,
  reviewQueue: 4500,
  stagesWithHistory: 21,
  stagesTotal: 93,
};

describe("weekly digest mail", () => {
  it("renders issued totals, draft flags and coverage", () => {
    const mail = renderDigest(data);
    expect(mail.subject).toContain("1 issued");
    expect(mail.html).toContain("AED 339,150");
    expect(mail.html).toContain("2 lines below our cost");
    expect(mail.html).toContain("21 days old");
    expect(mail.html).toContain("21 of 93 stages");
    expect(mail.text).toContain("QT-000299 R2");
  });

  it("contains no em or en dashes and no confidential labour data", () => {
    const mail = renderDigest(data);
    const all = mail.subject + mail.html + mail.text;
    expect(all).not.toMatch(/[–—]/);
    expect(all).not.toMatch(/piece|Al Wathba rate|crew day cost|labour_reference/i);
  });

  it("handles an empty week without falling over", () => {
    const mail = renderDigest({
      ...data,
      issued: [],
      draftsTouched: [],
      staleDrafts: [],
    });
    expect(mail.html).toContain("Nothing issued this week");
    expect(mail.html).toContain("No drafts touched this week");
    expect(mail.html).not.toContain("Going stale");
  });
});
