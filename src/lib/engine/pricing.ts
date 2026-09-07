// Labour, overhead, margin, rounding and VAT. Spec sections 4.2 and 4.6,
// labour model redesigned per docs/UPDATE_LABOUR_MODEL.md: labour is an
// editable input with a suggestion; it never enters the cost floor and no
// nudge ever fires on it.
import type {
  EngineSettings,
  LabourHistoryPoint,
  LabourSource,
  LineInputs,
  SiteProfileRef,
  StageRef,
  TierRef,
  TileLabourAnchor,
} from "./types";

// Site multiplier on labour: profile multiplier x noise uplift where set.
export function labourMultiplier(site: SiteProfileRef, settings: EngineSettings): number {
  const noise = site.noiseRestricted ? 1 + (settings.noiseLabourUplift ?? 0.08) : 1;
  return site.labourMultiplier * noise;
}

// Tile labour ladder: labour per sqm for floor installation, interpolated
// linearly on tile area between consecutive anchors, clamped at the ends.
// Wall installation adds settings.tilingWallUplift (default 10).
export function tileLadderLabour(
  anchors: TileLabourAnchor[] | undefined,
  inputs: LineInputs,
  settings: EngineSettings
): number | null {
  if (!anchors?.length || !inputs.tileLengthMm || !inputs.tileWidthMm) return null;
  const sorted = [...anchors].sort((a, b) => a.areaSqm - b.areaSqm);
  const area = (inputs.tileLengthMm / 1000) * (inputs.tileWidthMm / 1000);
  let rate: number;
  if (area <= sorted[0].areaSqm) rate = sorted[0].labourPerSqm;
  else if (area >= sorted[sorted.length - 1].areaSqm) rate = sorted[sorted.length - 1].labourPerSqm;
  else {
    let lo = sorted[0];
    let hi = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (area >= sorted[i].areaSqm && area <= sorted[i + 1].areaSqm) {
        lo = sorted[i];
        hi = sorted[i + 1];
        break;
      }
    }
    rate =
      lo.labourPerSqm +
      ((area - lo.areaSqm) / (hi.areaSqm - lo.areaSqm)) * (hi.labourPerSqm - lo.labourPerSqm);
  }
  if (inputs.wallInstallation) rate += settings.tilingWallUplift ?? 10;
  return rate;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Labour suggestion, in order: median of past quote-line labour values for
// the same stage; else the tile ladder (tiling lines with a tile size); else
// the application-only rate table; else the labour tier rate. The result is
// scaled by the site multiplier and, where coats are set, by the coat time
// factor from the stage's subsequent-coat weight. Never a nudge target.
export function suggestLabour(args: {
  stage: StageRef | null;
  tier: TierRef | null;
  inputs: LineInputs;
  site: SiteProfileRef;
  settings: EngineSettings;
  tileLabourAnchors?: TileLabourAnchor[];
  labourHistory?: LabourHistoryPoint[];
}): { value: number; source: LabourSource } {
  const { stage, tier, inputs, site, settings } = args;
  const mult = labourMultiplier(site, settings);
  const coats = Math.max(1, inputs.coats ?? 1);
  const coatFactor = 1 + (coats - 1) * (stage?.subsequentCoatFactor ?? 1);

  const past = (args.labourHistory ?? []).filter((h) => h.stageId === stage?.id);
  if (past.length >= 2) {
    return { value: median(past.map((p) => p.labourPerUnit)), source: "history median" };
  }

  const ladder = tileLadderLabour(args.tileLabourAnchors, inputs, settings);
  if (ladder !== null && stage?.applicationOnly?.tiling) {
    return { value: ladder * mult, source: "tile ladder" };
  }

  const listRate = applicationOnlyListRate(stage, inputs);
  if (listRate !== null) {
    return { value: listRate * mult * coatFactor, source: "application-only rate" };
  }

  const tierRate = inputs.applicationRateOverride ?? tier?.applicationRatePerSqm ?? null;
  if (tierRate !== null) {
    return { value: tierRate * mult * coatFactor, source: "labour tier" };
  }
  return { value: 0, source: "none" };
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

// Application-only list rate (material by client), before the site labour
// multiplier. Tiling interpolates linearly on tile area between the anchors
// (60x60 at the small rate up to large slabs at the large rate), clamped to
// the anchor rates. Falls back to null when the stage has no list price; the
// caller then uses the labour tier application rate.
export function applicationOnlyListRate(
  stage: { applicationOnly?: StageApplicationOnly | null } | null,
  inputs: LineInputs
): number | null {
  const ao = stage?.applicationOnly;
  if (!ao) return null;
  if (ao.tiling && inputs.tileLengthMm && inputs.tileWidthMm) {
    const { smallArea, smallRate, largeArea, largeRate } = ao.tiling;
    const area = (inputs.tileLengthMm / 1000) * (inputs.tileWidthMm / 1000);
    if (area <= smallArea) return smallRate;
    if (area >= largeArea) return largeRate;
    return smallRate + ((area - smallArea) / (largeArea - smallArea)) * (largeRate - smallRate);
  }
  if (ao.tiling) return null; // tiling stage without a tile size: fall back
  return ao.rate ?? null;
}

type StageApplicationOnly = NonNullable<
  import("./types").StageRef["applicationOnly"]
>;

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
