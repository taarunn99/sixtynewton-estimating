// Labour model redesign (docs/UPDATE_LABOUR_MODEL.md): labour excluded from
// the floor, per-line override, job-total distribution, absorb toggle,
// thickness and tile size wiring, wall uplift, confidential data containment.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/families.json";
import {
  computeLine,
  computeQuote,
  isPrepStage,
  tileLadderLabour,
  type EngineSettings,
  type FamilyRef,
  type LineInput,
  type QuoteInput,
  type ReferenceData,
  type SiteProfileRef,
  type StageRef,
  type TierRef,
  type TileLabourAnchor,
} from "../src/lib/engine";

const families = fixtures.families as FamilyRef[];
const fam = (name: string) => families.find((f) => f.name === name)!;

const settings: EngineSettings = {
  ...fixtures.settings,
  baselineProductivityPerCrewDay: 25,
  tilingWallUplift: 10,
};

const ANCHORS: TileLabourAnchor[] = [
  { areaSqm: 0.36, labourPerSqm: 40 },
  { areaSqm: 0.72, labourPerSqm: 65 },
  { areaSqm: 1.44, labourPerSqm: 90 },
  { areaSqm: 5.76, labourPerSqm: 115 },
];

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
  consumablePerSqm: 2,
  productivity: null,
  productivityConfidence: null,
  applicationOnly: null,
};

const grindStage: StageRef = {
  id: "grind",
  name: "Floor grinding",
  discipline: "SL & screed",
  cureDays: null,
  consumablePerSqm: 0,
  productivity: null,
  productivityConfidence: null,
  applicationOnly: null,
};

const tilingStage: StageRef = {
  id: "tile",
  name: "Adhesive fixing",
  discipline: "Tiling & marble",
  cureDays: null,
  consumablePerSqm: 0,
  productivity: null,
  productivityConfidence: null,
  applicationOnly: { tiling: { smallArea: 0.36, smallRate: 55, largeArea: 1.68, largeRate: 120 } },
};

function refData(): ReferenceData {
  return {
    settings,
    tileLabourAnchors: ANCHORS,
    labourHistory: [],
    familiesById: new Map(families.map((f) => [f.id, f])),
    tiersById: new Map([[tier.id, tier]]),
    stagesById: new Map([
      [slStage.id, slStage],
      [grindStage.id, grindStage],
      [tilingStage.id, tilingStage],
    ]),
  };
}

let seq = 0;
const baseLine = (over: Partial<LineInput>): LineInput => ({
  id: `l${++seq}`,
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

describe("labour is excluded from the floor", () => {
  it("our cost is material plus consumables plus overhead, no labour", () => {
    const ultraplan = fam("Mapei Ultraplan Eco 20 (23 kg)");
    const line = baseLine({ familyId: ultraplan.id, tierId: tier.id, stageId: slStage.id, inputs: { thicknessMm: 4 } });
    const b = computeLine(line, quoteWith([line]), refData());
    const expectedFloor = (b.materialPerUnit + b.consumablesPerUnit) * (1 + settings.defaultOverhead);
    expect(b.floorPerUnit).toBeCloseTo(Math.round(expectedFloor * 2) / 2, 6);
    expect(b.labourPerUnit).toBeGreaterThan(0);
  });
});

describe("per-line labour override", () => {
  it("flows into the suggested price and totals; source reads manual", () => {
    const line = baseLine({ tierId: tier.id, stageId: slStage.id, inputs: { labourOverride: 20 } });
    const b = computeLine(line, quoteWith([line]), refData());
    expect(b.labourPerUnit).toBe(20);
    expect(b.labourSource).toBe("manual");
    const expected = (b.materialPerUnit + 20 + b.consumablesPerUnit) * 1.12 * 1.25;
    expect(b.calculatedPerUnit).toBeCloseTo(Math.round(expected * 2) / 2, 6);
  });

  it("suggestion is kept alongside and no nudge fires on labour", () => {
    const line = baseLine({ tierId: tier.id, stageId: slStage.id, inputs: { labourOverride: 1 } });
    const b = computeLine(line, quoteWith([line]), refData());
    expect(b.labourSuggestedPerUnit).toBeCloseTo(37.5, 6);
    expect(b.nudges.map((n) => n.rule)).not.toContain("low_confidence");
  });
});

describe("quote-level labour job total", () => {
  it("distributes pro rata to suggestions, then a per-line override wins", () => {
    const a = baseLine({ tierId: tier.id, stageId: slStage.id, qty: 100 });
    const b = baseLine({ tierId: tier.id, stageId: slStage.id, qty: 300 });
    const totals = computeQuote(quoteWith([a, b], { labourJobTotal: 20000 }), refData());
    // Equal suggestions (37.5), weights 100:300, shares 5,000 and 15,000
    expect(totals.lines[0].labourPerUnit * 100).toBeCloseTo(5000, 3);
    expect(totals.lines[1].labourPerUnit * 300).toBeCloseTo(15000, 3);
    expect(totals.lines[0].labourSource).toBe("job total");

    const bOver = { ...b, inputs: { labourOverride: 10 } };
    const totals2 = computeQuote(quoteWith([a, bOver], { labourJobTotal: 20000 }), refData());
    expect(totals2.lines[1].labourPerUnit).toBe(10);
    expect(totals2.lines[1].labourSource).toBe("manual");
    expect(totals2.lines[0].labourSource).toBe("job total");
  });

  it("reports the suggested total beside the box", () => {
    const a = baseLine({ tierId: tier.id, stageId: slStage.id, qty: 100 });
    const totals = computeQuote(quoteWith([a]), refData());
    expect(totals.labourSuggestedTotal).toBeCloseTo(37.5 * 100, 3);
    expect(totals.labourJobTotal).toBeNull();
  });
});

describe("absorb labour in margin", () => {
  it("explicit toggle zeroes labour, line stays priced on material", () => {
    const line = baseLine({ tierId: tier.id, stageId: slStage.id, inputs: { absorbLabour: true } });
    const b = computeLine(line, quoteWith([line]), refData());
    expect(b.labourPerUnit).toBe(0);
    expect(b.labourSource).toBe("absorbed");
  });

  it("defaults on for a prep stage when a main application stage of the same discipline is included", () => {
    const grind = baseLine({ tierId: tier.id, stageId: grindStage.id });
    const main = baseLine({ tierId: tier.id, stageId: slStage.id });
    const both = computeQuote(quoteWith([grind, main]), refData());
    expect(both.lines[0].labourSource).toBe("absorbed");
    // Alone, the prep stage keeps its labour
    const alone = computeQuote(quoteWith([{ ...grind, inputs: {} }]), refData());
    expect(alone.lines[0].labourSource).not.toBe("absorbed");
    // Demolition is not a prep stage
    expect(isPrepStage("Demolition and surface preparation")).toBe(false);
    expect(isPrepStage("Floor grinding")).toBe(true);
  });
});

describe("thickness drives material live", () => {
  it("Ultraplan at 10 mm carries five times the material of 2 mm", () => {
    const ultraplan = fam("Mapei Ultraplan Eco 20 (23 kg)");
    const at2 = computeLine(
      baseLine({ familyId: ultraplan.id, tierId: tier.id, stageId: slStage.id, inputs: { thicknessMm: 2 } }),
      quoteWith([]),
      refData()
    );
    const at10 = computeLine(
      baseLine({ familyId: ultraplan.id, tierId: tier.id, stageId: slStage.id, inputs: { thicknessMm: 10 } }),
      quoteWith([]),
      refData()
    );
    expect(at10.materialPerUnit / at2.materialPerUnit).toBeCloseTo(5, 3);
    expect(at10.calculatedPerUnit).toBeGreaterThan(at2.calculatedPerUnit * 1.3);
  });
});

describe("tile ladder", () => {
  const inputs = (wCm: number, hCm: number, wall = false) => ({
    tileWidthMm: wCm * 10,
    tileLengthMm: hCm * 10,
    wallInstallation: wall,
  });

  it("anchors and interpolation on tile area", () => {
    expect(tileLadderLabour(ANCHORS, inputs(60, 60), settings)).toBe(40);
    expect(tileLadderLabour(ANCHORS, inputs(60, 120), settings)).toBe(65);
    expect(tileLadderLabour(ANCHORS, inputs(120, 120), settings)).toBe(90);
    expect(tileLadderLabour(ANCHORS, inputs(240, 240), settings)).toBe(115);
    // 80x160 = 1.28 sqm sits between 0.72 and 1.44: 65 + (0.56/0.72)x25
    expect(tileLadderLabour(ANCHORS, inputs(80, 160), settings)).toBeCloseTo(84.4, 1);
  });

  it("wall installation adds 10", () => {
    expect(tileLadderLabour(ANCHORS, inputs(120, 120, true), settings)).toBe(100);
  });

  it("tile size changes the labour suggestion and the suggested price", () => {
    const small = computeLine(
      baseLine({ tierId: tier.id, stageId: tilingStage.id, inputs: inputs(60, 60) }),
      quoteWith([]),
      refData()
    );
    const large = computeLine(
      baseLine({ tierId: tier.id, stageId: tilingStage.id, inputs: inputs(120, 120, true) }),
      quoteWith([]),
      refData()
    );
    expect(small.labourSuggestedPerUnit).toBe(40);
    expect(small.labourSource).toBe("tile ladder");
    expect(large.labourSuggestedPerUnit).toBe(100);
    expect(large.calculatedPerUnit).toBeGreaterThan(small.calculatedPerUnit);
  });

  it("tile size changes adhesive consumption (back-butter at 60x60 and larger)", () => {
    const keraflex = fam("Mapei Keraflex Maxi S1 Zero Grey (25 kg)");
    const small = computeLine(
      baseLine({ familyId: keraflex.id, tierId: tier.id, stageId: tilingStage.id, inputs: { tileWidthMm: 300, tileLengthMm: 300 } }),
      quoteWith([]),
      refData()
    );
    const big = computeLine(
      baseLine({ familyId: keraflex.id, tierId: tier.id, stageId: tilingStage.id, inputs: { tileWidthMm: 600, tileLengthMm: 600 } }),
      quoteWith([]),
      refData()
    );
    expect(big.materialPerUnit).toBeGreaterThan(small.materialPerUnit);
  });
});

describe("confidential labour data stays off client-facing surfaces", () => {
  // The labour_reference table (which holds the confidential piece rates) may
  // only ever be read by admin screens. Scan every client-facing source file,
  // including the PDF template and the assistant context builder.
  it("labour_reference is referenced only under src/app/admin", () => {
    const roots = ["src/app/quotes", "src/lib/assistant", "src/lib/engine", "src/lib/engine-server.ts"];
    const offenders: string[] = [];
    const scan = (p: string) => {
      const full = path.resolve(p);
      if (statSync(full).isDirectory()) {
        for (const f of readdirSync(full)) scan(path.join(p, f));
        return;
      }
      if (!/\.(ts|tsx)$/.test(p)) return;
      const text = readFileSync(full, "utf8");
      if (/labour_reference|piece.rate|Al Wathba|16\/lm/i.test(text)) offenders.push(p);
    };
    for (const r of roots) scan(r);
    expect(offenders).toEqual([]);
  });

  it("the PDF template contains no confidential figures", () => {
    const text = readFileSync(path.resolve("src/app/quotes/[id]/pdf/template.tsx"), "utf8");
    expect(text).not.toMatch(/labour_reference|piece|Al Wathba|crew/i);
  });
});
