// Labour reference model (correction 1 Sep 2026): crew-day maths is reference
// only and never prices a line. Upper floor factor, programme crew-day
// estimates and logistics suggestions.
import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/families.json";
import {
  computeLine,
  estimateCrewDays,
  roundRate,
  suggestLogistics,
  upperFloorFactor,
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

const settings: EngineSettings = {
  ...fixtures.settings,
  baselineProductivityPerCrewDay: 25,
  upperFloorFactor: 1.15,
  logisticsPickupCost: 0,
  logisticsTruckCost: 2000,
  logisticsTruckCapacityTons: 4,
  logisticsBargePerTon: 200,
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

const tierWithCrew: TierRef = {
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
  subsequentCoatFactor: 1.0,
};

const epoxyStage: StageRef = {
  id: "s2",
  name: "Epoxy coating",
  discipline: "Epoxy flooring",
  cureDays: null,
  consumablePerSqm: null,
  productivity: null,
  productivityConfidence: null,
  speedWeight: 1.2,
  subsequentCoatFactor: 0.4,
};

function refData(): ReferenceData {
  return {
    settings,
    familiesById: new Map(families.map((f) => [f.id, f])),
    tiersById: new Map([[tierWithCrew.id, tierWithCrew]]),
    stagesById: new Map([
      [wpStage.id, wpStage],
      [epoxyStage.id, epoxyStage],
    ]),
  };
}

const baseLine = (over: Partial<LineInput>): LineInput => ({
  id: "l1",
  description: "",
  qty: 100,
  unit: "sqm",
  included: true,
  inputs: {},
  ...over,
});

describe("crew cost is reference only, never priced", () => {
  it("labour stays on the application rate even when crew day cost and productivity exist", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const b = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tierWithCrew.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    // 470 / (25 x 0.8) = 23.5 would be the crew-day price; it must not appear
    expect(b.labourPerUnit).toBeCloseTo(37.5, 6);
    expect(b.labourPerUnit).not.toBeCloseTo(23.5, 1);
  });

  it("exposes the crew cost reference in the breakdown", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const b = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tierWithCrew.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    // baseline 25 x weight 0.8 = 20 sqm per crew-day, 470 / 20 = 23.5
    expect(b.crewCostReferencePerUnit).toBeCloseTo(23.5, 6);
  });

  it("reference is about 19 per sqm at weight 1.0 and null without crew day cost", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const ref = refData();
    const noWeight = { ...wpStage, speedWeight: null };
    ref.stagesById.set(wpStage.id, noWeight);
    const b = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tierWithCrew.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site() },
      ref
    );
    expect(b.crewCostReferencePerUnit).toBeCloseTo(470 / 25, 3);

    const noCrew: TierRef = { ...tierWithCrew, crewDayCost: null };
    ref.tiersById.set(tierWithCrew.id, noCrew);
    const b2 = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tierWithCrew.id, stageId: wpStage.id }),
      { lines: [], siteProfile: site() },
      ref
    );
    expect(b2.crewCostReferencePerUnit).toBeNull();
  });
});

describe("upper floor or roof factor", () => {
  it("multiplies the calculated price of affected lines by 1.15, floor unchanged", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const flat = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tierWithCrew.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    const upper = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: tierWithCrew.id, inputs: { upperFloorOrRoof: true } }),
      { lines: [], siteProfile: site() },
      refData()
    );
    const price =
      flat.costPerUnit * (1 + settings.defaultOverhead) * (1 + settings.defaultMargin);
    expect(upper.calculatedPerUnit).toBe(roundRate(price * 1.15, false));
    expect(upper.floorPerUnit).toBe(flat.floorPerUnit);
  });

  it("is clamped to at most 1.20", () => {
    expect(upperFloorFactor({ ...settings, upperFloorFactor: 1.5 })).toBe(1.2);
    expect(upperFloorFactor({ ...settings, upperFloorFactor: 1.18 })).toBeCloseTo(1.18, 6);
    expect(upperFloorFactor({ ...settings, upperFloorFactor: 0.9 })).toBe(1);
  });
});

describe("programme crew-day estimate, suggestion only", () => {
  it("uses baseline productivity scaled by speed weight", () => {
    const lines = [baseLine({ id: "a", stageId: wpStage.id, qty: 100 })];
    const est = estimateCrewDays(lines, refData().stagesById, settings);
    // 100 sqm at 25 x 0.8 = 20 sqm per crew-day
    expect(est.total).toBeCloseTo(5, 6);
  });

  it("subsequent coats take 0.4 of first-coat time for epoxy and 1.0 for waterproofing", () => {
    const stagesById = refData().stagesById;
    const epoxy3 = estimateCrewDays(
      [baseLine({ id: "a", stageId: epoxyStage.id, qty: 100, inputs: { coats: 3 } })],
      stagesById,
      settings
    );
    // prod 25 x 1.2 = 30; time units 1 + 2 x 0.4 = 1.8; 100 / 30 x 1.8 = 6
    expect(epoxy3.total).toBeCloseTo(6, 6);

    const wp2 = estimateCrewDays(
      [baseLine({ id: "b", stageId: wpStage.id, qty: 100, inputs: { coats: 2 } })],
      stagesById,
      settings
    );
    // prod 20; time units 2; 100 / 20 x 2 = 10
    expect(wp2.total).toBeCloseTo(10, 6);
  });

  it("skips rate-only, excluded and non-sqm lines", () => {
    const est = estimateCrewDays(
      [
        baseLine({ id: "a", stageId: wpStage.id, qty: 100, isRateOnly: true }),
        baseLine({ id: "b", stageId: wpStage.id, qty: 100, included: false }),
        baseLine({ id: "c", stageId: wpStage.id, qty: 100, unit: "lm" }),
      ],
      refData().stagesById,
      settings
    );
    expect(est.total).toBe(0);
  });
});

describe("logistics suggestion from tonnage", () => {
  it("under 1 ton suggests a pickup", () => {
    const s = suggestLogistics(0.5, site(), settings)!;
    expect(s.vehicle).toBe("pickup");
    expect(s.trips).toBe(1);
    expect(s.bargeCost).toBe(0);
  });

  it("mainland: ceil(tonnage / 4) trucks at 2,000 each, no barge", () => {
    const s = suggestLogistics(5, site(), settings)!;
    expect(s.vehicle).toBe("truck");
    expect(s.trips).toBe(2);
    expect(s.vehicleCost).toBe(4000);
    expect(s.bargeCost).toBe(0);
    expect(s.total).toBe(4000);
  });

  it("island adds a barge at 200 per ton: Al Maya 80 t gives 16,000 barge", () => {
    const s = suggestLogistics(80, site({ isIsland: true }), settings)!;
    expect(s.trips).toBe(20);
    expect(s.vehicleCost).toBe(40000);
    expect(s.bargeCost).toBe(16000);
    expect(s.total).toBe(56000);
  });

  it("returns null for zero or negative tonnage and is marked a low-confidence suggestion", () => {
    expect(suggestLogistics(0, site(), settings)).toBeNull();
    const s = suggestLogistics(2, site(), settings)!;
    expect(s.source).toBe("suggestion");
    expect(s.confidence).toBe("L");
  });
});
