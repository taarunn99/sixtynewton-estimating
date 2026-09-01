// Labour, overhead, margin, rounding and VAT. Spec sections 4.2 and 4.6.
import type { EngineSettings, LineInputs, SiteProfileRef, TierRef } from "./types";

// Labour pricing (correction 1 Sep 2026): the price always comes from the
// tier application rate x site labour multiplier. Crew day cost never prices
// a line, even when it exists; see crewCostReferencePerUnit below.
export function labourPerUnit(
  tier: TierRef | null,
  inputs: LineInputs,
  site: SiteProfileRef,
  settings: EngineSettings
): number | null {
  const noise = site.noiseRestricted ? 1 + (settings.noiseLabourUplift ?? 0.08) : 1;
  const multiplier = site.labourMultiplier * noise;
  const rate = inputs.applicationRateOverride ?? tier?.applicationRatePerSqm ?? null;
  if (rate === null) return null;
  return rate * multiplier;
}

// Crew cost reference, shown in the line breakdown only, never applied to the
// price: crew_day_cost / productivity. Productivity falls back to the settings
// baseline scaled by the stage speed weight when the stage has no figure.
export function crewCostReferencePerUnit(
  tier: TierRef | null,
  inputs: LineInputs,
  stageProductivity: number | null,
  speedWeight: number | null,
  settings: EngineSettings
): number | null {
  if (!tier?.crewDayCost) return null;
  const baseline = settings.baselineProductivityPerCrewDay ?? null;
  const prod =
    inputs.productivityOverride ??
    stageProductivity ??
    (baseline ? baseline * (speedWeight ?? 1) : null);
  if (!prod) return null;
  return tier.crewDayCost / prod;
}

// Upper floor or roof factor: multiplies the calculated price of affected
// lines. Editable in settings, clamped to at most 1.20.
export function upperFloorFactor(settings: EngineSettings): number {
  const f = settings.upperFloorFactor ?? 1.15;
  return Math.min(Math.max(f, 1), 1.2);
}

// Rounding per spec 4.6: unit rates to nearest 1 AED at 50 and above,
// nearest 0.5 below; lump sums to nearest 500.
export function roundRate(value: number, isLump: boolean): number {
  if (isLump) return Math.round(value / 500) * 500;
  if (value >= 50) return Math.round(value);
  return Math.round(value * 2) / 2;
}

export function priceFromCost(
  cost: number,
  overheadPct: number,
  marginPct: number
): { floor: number; price: number } {
  const floor = cost * (1 + overheadPct);
  const price = floor * (1 + marginPct);
  return { floor, price };
}
