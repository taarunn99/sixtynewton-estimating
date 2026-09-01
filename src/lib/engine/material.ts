// Material cost per output unit, by cost driver. Spec section 4.1.
import type { EngineSettings, FamilyRef, LineInputs } from "./types";

// Sixty Newton cost of one pack: Books cost times the intercompany factor,
// or the manual cost as entered (already Sixty Newton's own cost).
export function snCostPerPack(family: FamilyRef, settings: EngineSettings): number | null {
  if (family.booksCost !== null && family.booksCost > 0) {
    return family.booksCost * settings.intercompanyFactor;
  }
  if (family.manualCost !== null) return family.manualCost;
  return null;
}

function packQty(family: FamilyRef): number | null {
  return family.packQty ?? family.manualPackQty ?? null;
}

// Mapei grout consumption: kg/sqm = (A+B)/(A*B) * C * D * density,
// A and B tile sides in mm, C joint width mm, D tile thickness mm.
export function groutKgPerSqm(inputs: LineInputs): number | null {
  const { tileLengthMm: a, tileWidthMm: b, jointWidthMm: c, tileThicknessMm: d } = inputs;
  if (!a || !b || !c || !d) return null;
  const density = inputs.groutType === "epoxy" ? 1.55 : 1.6;
  return ((a + b) / (a * b)) * c * d * density;
}

// Adhesive back-butter: +1.5 kg/sqm when tile format is 60x60 or larger, or stone.
export function adhesiveKgPerSqm(family: FamilyRef, inputs: LineInputs): number | null {
  const base = family.coverageValue;
  if (base === null) return null;
  const large =
    inputs.backButter ??
    (!!inputs.tileLengthMm && !!inputs.tileWidthMm &&
      Math.min(inputs.tileLengthMm, inputs.tileWidthMm) >= 600);
  return base + (large ? 1.5 : 0);
}

const GROUT_NAME = /grout|ultracolor|kerapoxy|fugabella|fugalite|weberjoint|permacolor/i;
const ADHESIVE_NAME = /adhesive|keraflex|kerabond|webercol|h40|biogel|bioflex|pragma|granirapid|elastorapid|keralastic|254 platinum/i;

export function materialPerUnit(
  family: FamilyRef,
  inputs: LineInputs,
  settings: EngineSettings
): number | null {
  const cost = snCostPerPack(family, settings);
  if (cost === null) return family.driver === "labour_only" ? 0 : null;
  const pack = packQty(family);
  const waste = inputs.wastePct ?? family.wastePct ?? settings.defaultWaste;

  switch (family.driver) {
    case "labour_only":
      return 0;
    case "coverage": {
      if (pack === null) return null;
      let coverage = family.coverageValue;
      if (GROUT_NAME.test(family.name)) {
        coverage = groutKgPerSqm(inputs) ?? coverage;
      } else if (ADHESIVE_NAME.test(family.name)) {
        coverage = adhesiveKgPerSqm(family, inputs) ?? coverage;
      }
      if (coverage === null) return null;
      const coats = inputs.coats ?? family.defaultMultiplier ?? 1;
      return (cost / pack) * coverage * coats * (1 + waste);
    }
    case "thickness": {
      if (pack === null || family.coverageValue === null) return null;
      const perCm = /per cm|\/cm/i.test(family.coverageUnit ?? "");
      const thickness = perCm
        ? (inputs.thicknessCm ?? family.defaultMultiplier ?? 1)
        : (inputs.thicknessMm ?? family.defaultMultiplier ?? 1);
      return (cost / pack) * family.coverageValue * thickness * (1 + waste);
    }
    case "roll":
    case "board": {
      const net = inputs.netUnitsPerPack ?? family.coverageValue ?? pack;
      if (!net) return null;
      return (cost / net) * (1 + waste);
    }
    case "linear": {
      let lmPerPack = inputs.lmPerPack ?? null;
      if (lmPerPack === null && inputs.sealantJointWidthMm && inputs.sealantJointDepthMm) {
        const packMl =
          (family.packUnit === "L" && pack !== null ? pack * 1000 : null);
        if (packMl !== null) {
          lmPerPack = packMl / (inputs.sealantJointWidthMm * inputs.sealantJointDepthMm);
        }
      }
      if (lmPerPack === null) lmPerPack = family.coverageValue;
      if (!lmPerPack) return null;
      // Coverage stated per kg or per pack; per-kg values scale by pack weight
      const perKg = /per kg/i.test(family.coverageUnit ?? "");
      const lm = perKg && pack !== null ? lmPerPack * pack : lmPerPack;
      return (cost / lm) * (1 + waste);
    }
    case "each": {
      const pcsPerPack = inputs.pcsPerPack ?? pack ?? 1;
      const per = inputs.pcsPerOutputUnit ?? 1;
      return (cost / pcsPerPack) * per;
    }
    case "bought_in": {
      const supplier = inputs.boughtInCost ?? cost;
      return supplier * (1 + (inputs.cuttingWastePct ?? 0)) * (1 + (inputs.markupPct ?? 0));
    }
  }
}

// Secondary families (primer under SL, mesh in membrane) sum into the line.
export function totalMaterialPerUnit(
  family: FamilyRef | null,
  secondaries: FamilyRef[],
  inputs: LineInputs,
  settings: EngineSettings
): { value: number; missing: string[] } {
  const missing: string[] = [];
  let total = 0;
  if (family) {
    const main = materialPerUnit(family, inputs, settings);
    if (main === null) missing.push(family.name);
    else total += main;
  }
  for (const s of secondaries) {
    const v = materialPerUnit(s, {}, settings);
    if (v === null) missing.push(s.name);
    else total += v;
  }
  return { value: total, missing };
}
