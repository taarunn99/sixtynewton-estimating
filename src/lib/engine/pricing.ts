// Labour, overhead, margin, rounding and VAT. Spec sections 4.2 and 4.6.
import type { EngineSettings, LineInputs, SiteProfileRef, TierRef } from "./types";

// Interim labour mode (spec section 8): until crew day costs are confirmed,
// labour per unit = application rate per sqm x site labour multiplier.
// When a tier has crew_day_cost and the line a productivity, the crew-day
// model applies instead: labour = crew_days x crew_day_cost x multiplier.
export function labourPerUnit(
  tier: TierRef | null,
  inputs: LineInputs,
  productivity: number | null,
  site: SiteProfileRef,
  settings: EngineSettings
): number | null {
  const noise = site.noiseRestricted ? 1 + (settings.noiseLabourUplift ?? 0.08) : 1;
  const multiplier = site.labourMultiplier * noise;
  const prod = inputs.productivityOverride ?? productivity;
  if (tier?.crewDayCost && prod) {
    return (tier.crewDayCost / prod) * multiplier;
  }
  const rate = inputs.applicationRateOverride ?? tier?.applicationRatePerSqm ?? null;
  if (rate === null) return null;
  return rate * multiplier;
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
