// Unit tests for engine mechanics: rounding, grout formula, back-butter,
// programme compression (spec worked example), noise uplift, rate-only lines.
import { describe, it, expect } from "vitest";
import fixtures from "./fixtures/families.json";
import {
  roundRate,
  groutKgPerSqm,
  adhesiveKgPerSqm,
  computeProgramme,
  computeLine,
  computeQuote,
  type EngineSettings,
  type FamilyRef,
  type LineInput,
  type ReferenceData,
  type SiteProfileRef,
  type TierRef,
} from "../src/lib/engine";

const settings: EngineSettings = fixtures.settings;
const families = fixtures.families as FamilyRef[];
const fam = (name: string) => families.find((f) => f.name === name)!;

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

describe("rounding, spec 4.6", () => {
  it("rates at 50 and above round to 1 AED", () => {
    expect(roundRate(121.4, false)).toBe(121);
    expect(roundRate(74.5, false)).toBe(75);
  });
  it("rates below 50 round to 0.5", () => {
    expect(roundRate(36.3, false)).toBe(36.5);
    expect(roundRate(14.2, false)).toBe(14);
  });
  it("lump sums round to 500", () => {
    expect(roundRate(45240, true)).toBe(45000);
    expect(roundRate(45250, true)).toBe(45500);
    expect(roundRate(14180, true)).toBe(14000);
  });
});

describe("grout and adhesive formulas, spec 4.1", () => {
  it("grout kg/sqm follows the Mapei formula", () => {
    const kg = groutKgPerSqm({
      tileLengthMm: 600,
      tileWidthMm: 1200,
      jointWidthMm: 3,
      tileThicknessMm: 10,
      groutType: "cementitious",
    });
    expect(kg).toBeCloseTo(((600 + 1200) / (600 * 1200)) * 3 * 10 * 1.6, 6);
  });

  it("epoxy grout uses density 1.55", () => {
    const cement = groutKgPerSqm({ tileLengthMm: 600, tileWidthMm: 600, jointWidthMm: 2, tileThicknessMm: 9, groutType: "cementitious" })!;
    const epoxy = groutKgPerSqm({ tileLengthMm: 600, tileWidthMm: 600, jointWidthMm: 2, tileThicknessMm: 9, groutType: "epoxy" })!;
    expect(epoxy / cement).toBeCloseTo(1.55 / 1.6, 6);
  });

  it("back-butter adds 1.5 kg/sqm at 60x60 and larger", () => {
    const keraflex = fam("Mapei Keraflex Maxi S1 Zero Grey (25 kg)");
    expect(adhesiveKgPerSqm(keraflex, { tileLengthMm: 600, tileWidthMm: 600 })).toBe(7.5);
    expect(adhesiveKgPerSqm(keraflex, { tileLengthMm: 300, tileWidthMm: 300 })).toBe(6);
  });
});

describe("programme compression, spec 4.4 worked example", () => {
  it("30 crew-days, 6 h site, 15 days, 6-day week needs 4 crews at +30% congestion", () => {
    const result = computeProgramme({
      baseCrewDays: 30,
      programmeDaysRequested: 15,
      programmeHoursPerDay: 6,
      cureDaysTotal: 0,
      labourSubtotal: 100000,
      mobilisationPerCrew: 3100,
      site: site({ allowedHoursPerDay: 6 }),
      settings,
    });
    expect(result.availableHoursPerCrew).toBeCloseTo(15 * 6 * (6 / 7), 3);
    expect(result.crewsRequired).toBe(4);
    expect(result.congestionPct).toBeCloseTo(0.3, 6);
    expect(result.infeasible).toBe(false);
    expect(result.upliftTotal).toBeGreaterThan(100000 * 0.3);
  });

  it("flags infeasible when cure days exceed the deadline", () => {
    const result = computeProgramme({
      baseCrewDays: 10,
      programmeDaysRequested: 5,
      programmeHoursPerDay: 8,
      cureDaysTotal: 7,
      labourSubtotal: 10000,
      mobilisationPerCrew: 0,
      site: site(),
      settings,
    });
    expect(result.infeasible).toBe(true);
  });
});

const thinTier: TierRef = { id: "t1", name: "Thin coating", crewSize: null, crewDayCost: null, applicationRatePerSqm: 37.5, confidence: "M" };

function refData(): ReferenceData {
  return {
    settings,
    familiesById: new Map(families.map((f) => [f.id, f])),
    tiersById: new Map([[thinTier.id, thinTier]]),
    stagesById: new Map(),
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

describe("labour multipliers", () => {
  it("island multiplier and noise uplift scale labour", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const flat = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: thinTier.id }),
      { lines: [], siteProfile: site() },
      refData()
    );
    const island = computeLine(
      baseLine({ familyId: kerapoxy.id, tierId: thinTier.id }),
      { lines: [], siteProfile: site({ labourMultiplier: 1.8, noiseRestricted: true }) },
      refData()
    );
    expect(flat.labourPerUnit).toBeCloseTo(37.5, 6);
    expect(island.labourPerUnit).toBeCloseTo(37.5 * 1.8 * 1.08, 6);
  });
});

describe("rate-only lines, spec 4.7", () => {
  it("shows a rate but contributes nothing to totals", () => {
    const kerapoxy = fam("Mapei Kerapoxy (10 kg epoxy)");
    const line = baseLine({
      familyId: kerapoxy.id,
      tierId: thinTier.id,
      isRateOnly: true,
      quotedRate: 88,
      qty: 1,
    });
    const totals = computeQuote({ lines: [line], siteProfile: site() }, refData());
    expect(totals.lines[0].calculatedPerUnit).toBeGreaterThan(0);
    expect(totals.quotedSubtotal).toBe(0);
    expect(totals.calculatedSubtotal).toBe(0);
  });
});
