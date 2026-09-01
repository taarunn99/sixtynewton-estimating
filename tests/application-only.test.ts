// Application-only mode (material by client), Tarun Sep 2026: material zero,
// our cost is the crew cost reference alone, suggested price is the list rate
// times the site labour multiplier, tiling interpolates on tile area.
import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/families.json";
import {
  applicationOnlyListRate,
  computeLine,
  type EngineSettings,
  type FamilyRef,
  type LineInput,
  type ReferenceData,
  type SiteProfileRef,
  type StageRef,
  type TierRef,
} from "../src/lib/engine";

const families = fixtures.families as FamilyRef[];
const fam = (name: string) => families.find((f) => f.name === name)!;

const settings: EngineSettings = { ...fixtures.settings, baselineProductivityPerCrewDay: 25 };

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

const wpStage: StageRef = {
  id: "s1",
  name: "Cementitious waterproofing",
  discipline: "Waterproofing",
  cureDays: null,
  consumablePerSqm: null,
  productivity: null,
  productivityConfidence: null,
  speedWeight: 0.8,
  subsequentCoatFactor: 1,
  applicationOnly: { rate: 30 },
};

const tilingStage: StageRef = {
  id: "s2",
  name: "Tile installation",
  discipline: "Tiling & marble",
  cureDays: null,
  consumablePerSqm: null,
  productivity: null,
  productivityConfidence: null,
  applicationOnly: { tiling: { smallArea: 0.36, smallRate: 55, largeArea: 1.68, largeRate: 120 } },
};

const noRateStage: StageRef = {
  id: "s3",
  name: "Special repair",
  discipline: "Repair",
  cureDays: null,
  consumablePerSqm: null,
  productivity: null,
  productivityConfidence: null,
  applicationOnly: null,
};

function refData(): ReferenceData {
  return {
    settings,
    familiesById: new Map(families.map((f) => [f.id, f])),
    tiersById: new Map([[tier.id, tier]]),
    stagesById: new Map([
      [wpStage.id, wpStage],
      [tilingStage.id, tilingStage],
      [noRateStage.id, noRateStage],
    ]),
  };
}

const baseLine = (over: Partial<LineInput>): LineInput => ({
  id: "l1",
  description: "Supply and application of waterproofing",
  qty: 100,
  unit: "sqm",
  included: true,
  inputs: { materialByClient: true },
  ...over,
});

describe("application-only pricing", () => {
  it("material is zero, our cost is the crew cost reference alone", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const b = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tier.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    expect(b.materialPerUnit).toBe(0);
    // crew ref: 470 / (25 x 0.8) = 23.5, no overhead, no margin
    expect(b.floorPerUnit).toBe(23.5);
  });

  it("suggested price is the list rate times the site labour multiplier, no margin", () => {
    const b = computeLine(
      baseLine({ tierId: tier.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    expect(b.calculatedPerUnit).toBe(30);
    const island = computeLine(
      baseLine({ tierId: tier.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site({ labourMultiplier: 1.55 }) },
      refData()
    );
    expect(island.calculatedPerUnit).toBe(46.5);
  });

  it("falls back to the labour tier application rate when no list rate exists", () => {
    const b = computeLine(
      baseLine({ tierId: tier.id, stageId: noRateStage.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    expect(b.calculatedPerUnit).toBe(37.5);
  });
});

describe("tiling interpolation on tile area", () => {
  const inputsFor = (wCm: number, hCm: number) => ({
    materialByClient: true,
    tileWidthMm: wCm * 10,
    tileLengthMm: hCm * 10,
  });

  it("anchors: 60x60 gives 55, large slabs give 120", () => {
    expect(applicationOnlyListRate(tilingStage, inputsFor(60, 60))).toBe(55);
    expect(applicationOnlyListRate(tilingStage, inputsFor(160, 360))).toBe(120);
    expect(applicationOnlyListRate(tilingStage, inputsFor(30, 30))).toBe(55);
  });

  it("interpolates between the anchors: 60x120 lands near 73", () => {
    const rate = applicationOnlyListRate(tilingStage, inputsFor(60, 120))!;
    expect(rate).toBeGreaterThan(70);
    expect(rate).toBeLessThan(75);
  });

  it("no tile size on a tiling stage falls back to the tier rate", () => {
    const b = computeLine(
      baseLine({ tierId: tier.id, stageId: tilingStage.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    expect(b.calculatedPerUnit).toBe(37.5);
  });

  it("tile size flows into the suggested price", () => {
    const b = computeLine(
      baseLine({ tierId: tier.id, stageId: tilingStage.id, inputs: inputsFor(60, 60) }),
      { lines: [], siteProfile: site() },
      refData()
    );
    expect(b.calculatedPerUnit).toBe(55);
  });
});
