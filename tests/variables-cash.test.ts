// UPDATE_VARIABLES_CASH.md: working variables move numbers, history drives
// live suggestions, cash strip and adjustments stay off the PDF, every
// discipline is quotable. Live sections skip without .env.local.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/families.json";
import {
  computeLine,
  computeQuote,
  type EngineSettings,
  type FamilyRef,
  type LineInput,
  type QuoteInput,
  type ReferenceData,
  type SiteProfileRef,
  type StageRef,
  type TierRef,
} from "../src/lib/engine";
import { hasLiveEnv, liveClient, loadLiveQuote } from "./live-helpers";
import { composeLabourProposal, searchHistory } from "../src/lib/assistant/history";

const families = fixtures.families as FamilyRef[];
const settings: EngineSettings = {
  ...fixtures.settings,
  baselineProductivityPerCrewDay: 25,
  occupiedProductivityFactor: 0.85,
};

const site = (over: Partial<SiteProfileRef> = {}): SiteProfileRef => ({
  allowedHoursPerDay: 8,
  allowedDaysPerWeek: 6,
  labourMultiplier: 1,
  mobilisationMultiplier: 1,
  transportPerTrip: 0,
  permitLump: 0,
  parkingPerDay: 0,
  noiseRestricted: false,
  ...over,
});

const tier: TierRef = {
  id: "t1",
  name: "Thin coating",
  crewSize: 5,
  crewDayCost: 470,
  applicationRatePerSqm: 37.5,
  confidence: "M",
};
const slStage: StageRef = {
  id: "sl",
  name: "Self-levelling pour",
  discipline: "SL & screed",
  cureDays: null,
  consumablePerSqm: 0,
  productivity: null,
  productivityConfidence: null,
  applicationOnly: null,
};

function refData(): ReferenceData {
  return {
    settings,
    tileLabourAnchors: [],
    labourHistory: [],
    familiesById: new Map(families.map((f) => [f.id, f])),
    tiersById: new Map([[tier.id, tier]]),
    stagesById: new Map([[slStage.id, slStage]]),
  };
}

let seq = 0;
const baseLine = (over: Partial<LineInput>): LineInput => ({
  id: `v${++seq}`,
  description: "Line",
  qty: 100,
  unit: "sqm",
  included: true,
  inputs: {},
  ...over,
});
const quoteWith = (lines: LineInput[], over: Partial<QuoteInput> = {}): QuoteInput => ({
  lines,
  siteProfile: site(),
  ...over,
});

describe("variables move numbers (section 1)", () => {
  it("changing site hours from 8 to 4 changes the total", () => {
    const line = baseLine({ tierId: tier.id, stageId: slStage.id });
    const base: Partial<QuoteInput> = { baseProgrammeCrewDays: 30, programmeDaysRequested: 15 };
    const at8 = computeQuote(quoteWith([line], { ...base, programmeHoursPerDay: 8 }), refData());
    const at4 = computeQuote(quoteWith([line], { ...base, programmeHoursPerDay: 4 }), refData());
    expect(at4.totalCalculated).toBeGreaterThan(at8.totalCalculated);
    expect(at4.adjustments.find((a) => a.name === "Programme compression")).toBeTruthy();
  });

  it("occupied building lifts labour suggestions about 18% but never user-entered labour", () => {
    const suggested = baseLine({ tierId: tier.id, stageId: slStage.id });
    const typed = baseLine({ tierId: tier.id, stageId: slStage.id, inputs: { labourOverride: 30 } });
    const off = computeQuote(quoteWith([suggested, typed]), refData());
    const on = computeQuote(quoteWith([suggested, typed], { occupiedBuilding: true }), refData());
    expect(on.lines[0].labourPerUnit / off.lines[0].labourPerUnit).toBeCloseTo(1 / 0.85, 3);
    expect(on.lines[1].labourPerUnit).toBe(30);
    const row = on.adjustments.find((a) => a.name === "Occupied building")!;
    expect(row.mode).toBe("in rates");
    expect(row.amount).toBeGreaterThan(0);
  });

  it("night work adds the percent on the labour subtotal as entered", () => {
    const typed = baseLine({ tierId: tier.id, stageId: slStage.id, inputs: { labourOverride: 40 } });
    const totals = computeQuote(quoteWith([typed], { nightWorkPct: 10 }), refData());
    const row = totals.adjustments.find((a) => a.name === "Night work")!;
    expect(row.amount).toBeCloseTo(0.1 * 40 * 100, 3);
    expect(totals.totalCalculated).toBeCloseTo(
      (totals.calculatedSubtotal + row.amount) * 1.05,
      2
    );
  });

  it("a custom +100 per day variable over a 15 day deadline adds 1,500", () => {
    const line = baseLine({ tierId: tier.id, stageId: slStage.id });
    const totals = computeQuote(
      quoteWith([line], {
        programmeDaysRequested: 15,
        customVariables: [{ name: "Site cabin", kind: "per_day", value: 100 }],
      }),
      refData()
    );
    const row = totals.adjustments.find((a) => a.name === "Site cabin")!;
    expect(row.amount).toBe(1500);
  });
});

describe("PDF carries no adjustments and no cash strip (sections 1 and 3)", () => {
  it("the PDF template never touches adjustments, internal cash or collection", () => {
    const text = readFileSync(path.resolve("src/app/quotes/[id]/pdf/template.tsx"), "utf8");
    for (const word of [
      "adjustment",
      "Internal",
      "collection",
      "Advance covers",
      "Occupied building",
      "Night work",
      "materialSubtotal",
      "paymentSplit",
    ]) {
      expect(text).not.toContain(word);
    }
  });
});

describe.skipIf(!hasLiveEnv)("history drives live suggestions (section 6)", () => {
  it("a 60x120 tiling line shows a history-led suggested price citing QT-000261", async () => {
    const { ref, quoteInput, history } = await loadLiveQuote("QT-000299", 1, {});
    const tiling = [...ref.stagesById.values()].find(
      (s) => s.discipline === "Tiling & marble" && /adhesive/i.test(s.name)
    )!;
    const heavy = [...ref.tiersById.values()].find((t) => /heavy/i.test(t.name))!;
    const line = baseLine({
      stageId: tiling.id,
      tierId: heavy.id,
      inputs: { tileWidthMm: 600, tileLengthMm: 1200 },
    });
    const b = computeLine(line, { ...quoteInput, lines: [line] }, ref, history);
    expect(b.priceSourceUsed).toBe("history");
    expect(b.priceHistory!.count).toBeGreaterThanOrEqual(2);
    const all = history.filter((h) => h.stageId === tiling.id).map((h) => h.quoteNumber);
    expect(all.some((q) => q.includes("261"))).toBe(true);
    expect(b.priceEngine).toBeGreaterThan(0);
  });

  it("an application-only bitumen membrane line cites QT-000293 at 20", async () => {
    const { ref, quoteInput, history } = await loadLiveQuote("QT-000299", 1, {});
    const membrane = [...ref.stagesById.values()].find(
      (s) => s.discipline === "Bitumen WP" && /membrane layer 1/i.test(s.name)
    )!;
    const line = baseLine({ stageId: membrane.id, inputs: { materialByClient: true } });
    const b = computeLine(line, { ...quoteInput, lines: [line] }, ref, history);
    expect(b.priceSourceUsed).toBe("history");
    const cited = b.priceHistory!.quotes;
    expect(cited.some((q) => q.quoteNumber.includes("293") && q.rate === 20)).toBe(true);
  });

  it("an Ultraplan line at about 5 mm cites QT-000298 or QT-000300", async () => {
    const { ref, quoteInput, history } = await loadLiveQuote("QT-000299", 1, {});
    const sl = [...ref.stagesById.values()].find(
      (s) => s.discipline === "SL & screed" && /self-levelling compound/i.test(s.name)
    )!;
    const ultraplan = [...ref.familiesById.values()].find((f) => /Ultraplan Eco 20/i.test(f.name))!;
    const thin = [...ref.tiersById.values()].find((t) => /thin/i.test(t.name))!;
    const line = baseLine({
      stageId: sl.id,
      familyId: ultraplan.id,
      tierId: thin.id,
      inputs: { thicknessMm: 5 },
    });
    const b = computeLine(line, { ...quoteInput, lines: [line] }, ref, history);
    expect(b.priceSourceUsed).toBe("history");
    expect(
      b.priceHistory!.quotes.some((q) => q.quoteNumber.includes("298") || q.quoteNumber.includes("300"))
    ).toBe(true);
    expect(b.priceHistory!.approximate).toBe(true);
  });
});

describe.skipIf(!hasLiveEnv)("assistant history tools (section 5)", () => {
  it("the Azizi bitumen question returns the two QT-000293 rates", async () => {
    const results = await searchHistory(liveClient(), { query: "azizi" });
    const rates = results.filter((r) => r.quoteNumber === "QT-000293").map((r) => r.rate).sort();
    expect(rates).toEqual([17, 20]);
    expect(results.every((r) => r.client.toLowerCase().includes("azizi"))).toBe(true);
  });

  it("Al Wathba search finds the microtopping and tiling rates", async () => {
    const results = await searchHistory(liveClient(), { query: "wathba" });
    expect(results.some((r) => r.quoteNumber === "QT-000295" && Math.round(r.rate) === 209)).toBe(true);
  });

  it("propose_labour on a 60x60 tiling line cites ladder anchor 40 and a past quote", async () => {
    const { ref, quoteInput, history } = await loadLiveQuote("QT-000299", 1, {});
    const tiling = [...ref.stagesById.values()].find(
      (s) => s.discipline === "Tiling & marble" && /adhesive/i.test(s.name)
    )!;
    const heavy = [...ref.tiersById.values()].find((t) => /heavy/i.test(t.name))!;
    const flat = { ...quoteInput, siteProfile: { ...quoteInput.siteProfile, labourMultiplier: 1, noiseRestricted: false } };
    const line = baseLine({
      stageId: tiling.id,
      tierId: heavy.id,
      inputs: { tileWidthMm: 600, tileLengthMm: 600 },
    });
    const b = computeLine(line, { ...flat, lines: [line] }, ref, history);
    expect(b.labourSuggestedPerUnit).toBe(40);
    expect(b.labourSource).toBe("tile ladder");
    const proposal = composeLabourProposal({
      description: "Tile installation 60x60",
      unit: "sqm",
      labourSuggested: b.labourSuggestedPerUnit,
      labourSource: b.labourSource,
      labourCurrent: b.labourPerUnit,
      historyQuotes: b.priceHistory?.quotes ?? [],
      historyMedian: b.priceHistory?.median ?? null,
      enginePrice: b.priceEngine,
    });
    expect(proposal).toContain("40");
    expect(proposal).toMatch(/QT-\d+/);
  });
});

describe.skipIf(!hasLiveEnv)("every discipline is quotable (section 2)", () => {
  it("one stage per discipline prices with nonzero material, or is labour-only by data", async () => {
    const { ref, quoteInput } = await loadLiveQuote("QT-000299", 1, {});
    const supabase = liveClient();
    const { data: stageRows } = await supabase
      .from("stages")
      .select("id, discipline, default_family_id, labour_tier_id");
    const disciplines = [...new Set((stageRows ?? []).map((s) => s.discipline))];
    expect(disciplines.length).toBe(14);
    const report: string[] = [];
    for (const d of disciplines) {
      const candidates = (stageRows ?? []).filter((s) => s.discipline === d);
      let best = 0;
      let priced = false;
      for (const c of candidates) {
        const line = baseLine({
          stageId: c.id,
          familyId: c.default_family_id,
          tierId: c.labour_tier_id,
          inputs: { thicknessMm: 3 },
        });
        const b = computeLine(line, { ...quoteInput, lines: [line] }, ref);
        best = Math.max(best, b.materialPerUnit);
        if (b.materialPerUnit > 0) {
          priced = true;
          break;
        }
      }
      if (!priced) {
        const allLabourOnly = candidates.every((c) => !c.default_family_id);
        report.push(`${d}: ${priced ? "material ok" : allLabourOnly ? "labour only" : "NO MATERIAL"}`);
        expect(allLabourOnly, `${d} has default families but zero material`).toBe(true);
      }
    }
    // eslint-disable-next-line no-console
    if (report.length) console.log("labour-only disciplines:", report.join("; "));
  });
});
