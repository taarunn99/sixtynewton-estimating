// Reproduces the 19 analysed quotes (docs/quotes) within the labour tier
// ranges documented in spec section 8. For each quoted rate, the implied
// application rate is quoted minus the engine's material cost; it must land
// in the documented tier band. Known below-cost lines must trip the floor.
import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/families.json";
import {
  materialPerUnit,
  totalMaterialPerUnit,
  computeLine,
  computeQuote,
  type EngineSettings,
  type FamilyRef,
  type LineInput,
  type QuoteInput,
  type ReferenceData,
  type SiteProfileRef,
  type TierRef,
} from "../src/lib/engine";

const settings: EngineSettings = fixtures.settings;
const families = fixtures.families as FamilyRef[];

function fam(name: string): FamilyRef {
  const f = families.find((x) => x.name === name);
  if (!f) throw new Error(`fixture family missing: ${name}`);
  return f;
}
function mat(name: string, inputs = {}): number {
  const v = materialPerUnit(fam(name), inputs, settings);
  if (v === null) throw new Error(`no material cost for ${name}`);
  return v;
}

const flatSite: SiteProfileRef = {
  allowedHoursPerDay: 8,
  allowedDaysPerWeek: 6,
  labourMultiplier: 1,
  mobilisationMultiplier: 1,
  transportPerTrip: 0,
  permitLump: 0,
  parkingPerDay: 0,
  noiseRestricted: false,
};

// Spec section 8 tier bands, with a 10% evidence tolerance either side
const BANDS = {
  thin: [30, 44],
  heavy: [63, 88],
  heavyIsland: [113, 160],
  prep: [13, 17],
  demolition: [67, 95],
  rollTorch: [11, 17],
  antiRoot: [35, 45],
  mapelasticSystem: [69, 92],
} as const;

const inBand = (value: number, band: readonly [number, number]) => {
  expect(value).toBeGreaterThanOrEqual(band[0]);
  expect(value).toBeLessThanOrEqual(band[1]);
};

describe("labour-only rates reproduce directly", () => {
  it("QT-000296 and QT-000298 grinding at 15", () => inBand(15, BANDS.prep));
  it("QT-000272 grout removal at 15", () => inBand(15, BANDS.prep));
  it("QT-000269 demolition, 15,000 lump on 200 sqm", () => inBand(15000 / 200, BANDS.demolition));
  it("QT-000299 R1 demolition, 30,000 lump on 350 sqm", () => inBand(30000 / 350, BANDS.demolition));
});

describe("implied application rates land in tier bands", () => {
  it("QT-000272 Kerapoxy at 55, thin coating", () => {
    const material = mat("Mapei Kerapoxy (10 kg epoxy)");
    inBand(55 - material, BANDS.thin);
  });

  it("QT-000271 Kerapoxy at 60, thin coating", () => {
    const material = mat("Mapei Kerapoxy (10 kg epoxy)");
    inBand(60 - material, BANDS.thin);
  });

  it("QT-000301 Fosroc CM210 at 45, thin coating (documented 36.5)", () => {
    const material = mat("Fosroc Nitocote CM210");
    const implied = 45 - material;
    inBand(implied, BANDS.thin);
    expect(Math.abs(implied - 36.5)).toBeLessThan(2);
  });

  it("QT-000298 self-levelling 4 to 5 mm at 55, thin coating (documented 37 to 40)", () => {
    const material = mat("Mapei Ultraplan Eco 20 (23 kg)", { thicknessMm: 4 });
    inBand(55 - material, BANDS.thin);
  });

  it("QT-000273 PU45 groove filling at 40 per lm, thin coating (documented 34)", () => {
    const material = mat("Mapei Mapeflex PU45 FT (600 ml sausage)");
    const implied = 40 - material;
    inBand(implied, BANDS.thin);
    expect(Math.abs(implied - 34)).toBeLessThan(2);
  });

  it("QT-000261 tile with adhesive and grout at 100, heavy application (documented 74)", () => {
    const adhesive = mat("Mapei Keraflex Maxi S1 Zero Grey (25 kg)", {
      tileLengthMm: 1200,
      tileWidthMm: 600,
    });
    const grout = mat("Mapei Ultracolor Plus (5 kg)");
    inBand(100 - adhesive - grout, BANDS.heavy);
  });

  it("QT-000299 R2 island tiling at 160, heavy application x 1.8 island premium", () => {
    const adhesive = mat("Mapei Keraflex Maxi S1 Zero Grey (25 kg)", {
      tileLengthMm: 1200,
      tileWidthMm: 600,
    });
    inBand(160 - adhesive, BANDS.heavyIsland);
  });

  it("QT-000301 Awazel PY40 SBS membrane at 32, torch roll (documented 14)", () => {
    const material = mat("Awazel PY40 L 4 mm SBS");
    inBand(32 - material, BANDS.rollTorch);
  });

  it("QT-000301 anti-root membrane at 58, torch roll (documented 40)", () => {
    const material = mat("Weber Biflex PL anti-root 4 mm (10 sqm)");
    inBand(58 - material, BANDS.antiRoot);
  });

  it("QT-000299 R1 Mapelastic system at 110 (documented 77 application)", () => {
    const membrane = mat("Mapei Mapelastic (A+B 32 kg)");
    const mesh = mat("Mapei Mapenet 150 (1x50 m)");
    inBand(110 - membrane - mesh, BANDS.mapelasticSystem);
  });
});

// Reference data helpers for full line computation
const thinTier: TierRef = { id: "t1", name: "Thin coating", crewSize: null, crewDayCost: null, applicationRatePerSqm: 37.5, confidence: "M" };
const heavyTier: TierRef = { id: "t2", name: "Heavy application", crewSize: null, crewDayCost: null, applicationRatePerSqm: 75, confidence: "M" };

function refData(): ReferenceData {
  return {
    settings,
    familiesById: new Map(families.map((f) => [f.id, f])),
    tiersById: new Map([
      [thinTier.id, thinTier],
      [heavyTier.id, heavyTier],
    ]),
    stagesById: new Map(),
  };
}

function lineWith(partial: Partial<LineInput>): LineInput {
  return {
    id: "l1",
    description: "",
    qty: 100,
    unit: "sqm",
    included: true,
    inputs: {},
    ...partial,
  };
}

function quoteWith(lines: LineInput[]): QuoteInput {
  return { lines, siteProfile: flatSite };
}

describe("known below-cost lines trip the floor (spec section 8)", () => {
  it("QT-000298 self-levelling 18 mm at 85 blocks below floor (material 108 documented)", () => {
    const maxi = fam("Mapei Ultraplan Maxi (25 kg)");
    const line = lineWith({
      familyId: maxi.id,
      tierId: thinTier.id,
      quotedRate: 85,
      inputs: { thicknessMm: 18 },
    });
    const material = materialPerUnit(maxi, { thicknessMm: 18 }, settings)!;
    expect(material).toBeGreaterThan(95);
    const result = computeLine(line, quoteWith([line]), refData());
    expect(result.nudges.some((n) => n.rule === "below_cost_floor")).toBe(true);
  });

  it("QT-000296 R3 epoxy at 45 blocks below floor (material about 65 documented)", () => {
    const epoxy = fam("Mapei Mapefloor I 300 SL (A+B+C 47 kg)");
    const primer = fam("Mapei Primer SN (epoxy primer)");
    const material = totalMaterialPerUnit(epoxy, [primer], { thicknessMm: 2 }, settings);
    expect(material.value).toBeGreaterThan(55);
    expect(material.value).toBeLessThan(75);
    const line = lineWith({
      familyId: epoxy.id,
      tierId: thinTier.id,
      quotedRate: 45,
      inputs: { thicknessMm: 2, secondaryFamilyIds: [primer.id] },
    });
    const result = computeLine(line, quoteWith([line]), refData());
    expect(result.nudges.some((n) => n.rule === "below_cost_floor")).toBe(true);
  });

  it("QT-000301 water-based primer at 4 blocks below floor", () => {
    const primer = fam("Mapei Primer G (diluted)");
    const line = lineWith({
      familyId: primer.id,
      tierId: thinTier.id,
      quotedRate: 4,
      inputs: {},
    });
    const result = computeLine(line, quoteWith([line]), refData());
    expect(result.nudges.some((n) => n.rule === "below_cost_floor")).toBe(true);
  });

  it("QT-000269 screed at 10 cm for 130 blocks with Topcem Pronto (only site-mixed viable)", () => {
    const pronto = fam("Mapei Topcem Pronto (25 kg ready-mix)");
    const line = lineWith({
      familyId: pronto.id,
      tierId: heavyTier.id,
      quotedRate: 130,
      inputs: { thicknessCm: 10 },
    });
    const result = computeLine(line, quoteWith([line]), refData());
    expect(result.nudges.some((n) => n.rule === "below_cost_floor")).toBe(true);
  });
});

describe("quote totals and VAT", () => {
  it("applies 5% VAT exclusively on the subtotal", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const line = lineWith({ familyId: kerapoxy.id, tierId: thinTier.id, quotedRate: 60, qty: 300 });
    const totals = computeQuote(quoteWith([line]), refData());
    expect(totals.quotedSubtotal).toBe(18000);
    expect(totals.vatQuoted).toBeCloseTo(900, 5);
    expect(totals.totalQuoted).toBeCloseTo(18900, 5);
  });

  it("QT-000271 reproduces: epoxy grout 300 sqm at 60 plus 67 sqm at 60 totals 23,121", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const l1 = lineWith({ id: "a", familyId: kerapoxy.id, tierId: thinTier.id, quotedRate: 60, qty: 300 });
    const l2 = lineWith({ id: "b", familyId: kerapoxy.id, tierId: thinTier.id, quotedRate: 60, qty: 67 });
    const totals = computeQuote(quoteWith([l1, l2]), refData());
    expect(totals.totalQuoted).toBeCloseTo(23121, 0);
  });
});
