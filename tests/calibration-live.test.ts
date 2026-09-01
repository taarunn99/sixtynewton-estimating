// Live calibration against the database, not fixtures (Tarun, 1 Sep 2026):
// with every line ticked and default factors, QT-000299 R1 must price within
// 15% of its issued 286,125 (VAT inclusive) and show at most 2 lines below
// floor. Also verifies R2 quantities multiply through to about 249,000 quoted.
// Skips when .env.local is absent.
import { describe, it, expect } from "vitest";
import { computeQuote } from "../src/lib/engine";
import { hasLiveEnv, loadLiveQuote } from "./live-helpers";

describe.skipIf(!hasLiveEnv)("QT-000299 live calibration", () => {
  it("R1: calculated total within 15% of issued 286,125 and at most 2 lines below floor", async () => {
    const { quoteInput, ref, lines } = await loadLiveQuote("QT-000299", 1, { includeAll: true });
    const totals = computeQuote(quoteInput, ref);

    const rows = totals.lines.map((b, i) => ({
      line: lines[i].description.slice(0, 42),
      qty: lines[i].qty,
      material: Math.round(b.materialPerUnit * 10) / 10,
      labour: Math.round(b.labourPerUnit * 10) / 10,
      floor: b.floorPerUnit,
      calc: b.calculatedPerUnit,
      quoted: b.quotedPerUnit,
      below: b.quotedPerUnit !== null && b.quotedPerUnit < b.floorPerUnit ? "YES" : "",
    }));
    // eslint-disable-next-line no-console
    console.table(rows);
    // eslint-disable-next-line no-console
    console.log("totalCalculated (inc VAT):", Math.round(totals.totalCalculated), "target 286,125 +/-15%");

    const belowFloor = totals.lines.filter(
      (b) => b.quotedPerUnit !== null && b.quotedPerUnit < b.floorPerUnit
    );
    expect(belowFloor.length).toBeLessThanOrEqual(2);
    expect(totals.totalCalculated).toBeGreaterThan(286125 * 0.85);
    expect(totals.totalCalculated).toBeLessThan(286125 * 1.15);
  });

  it("R2: all lines ticked, quoted subtotal multiplies through to about 249,000", async () => {
    const { quoteInput, ref, lines } = await loadLiveQuote("QT-000299", 2, { includeAll: true });
    const totals = computeQuote(quoteInput, ref);

    const manual = lines.reduce(
      (s, l) => s + (l.isRateOnly ? 0 : (l.quotedRate ?? 0) * l.qty),
      0
    );
    // eslint-disable-next-line no-console
    console.log("R2 quoted subtotal:", Math.round(totals.quotedSubtotal), "manual sum:", Math.round(manual));
    expect(totals.quotedSubtotal).toBeCloseTo(manual, 4);
    expect(totals.quotedSubtotal).toBeGreaterThan(240000);
    expect(totals.quotedSubtotal).toBeLessThan(258000);
  });
});
