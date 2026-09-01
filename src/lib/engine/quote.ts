// Assembles per-line breakdowns and quote totals. Spec sections 4 and 5.
import type {
  HistoryPoint,
  LineBreakdown,
  LineInput,
  Nudge,
  QuoteInput,
  QuoteTotals,
  ReferenceData,
} from "./types";
import { totalMaterialPerUnit } from "./material";
import {
  applicationOnlyListRate,
  crewCostReferencePerUnit,
  labourPerUnit,
  priceFromCost,
  roundRate,
  upperFloorFactor,
} from "./pricing";
import { computeProgramme } from "./programme";

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function computeLine(
  line: LineInput,
  quote: QuoteInput,
  ref: ReferenceData,
  history: HistoryPoint[] = []
): LineBreakdown {
  const { settings } = ref;
  const family = line.familyId ? (ref.familiesById.get(line.familyId) ?? null) : null;
  const stage = line.stageId ? (ref.stagesById.get(line.stageId) ?? null) : null;
  const tier = line.tierId ? (ref.tiersById.get(line.tierId) ?? null) : null;
  const secondaries = (line.inputs.secondaryFamilyIds ?? [])
    .map((id) => ref.familiesById.get(id))
    .filter((f): f is NonNullable<typeof f> => !!f);

  const nudges: Nudge[] = [];
  const isLump = line.unit === "lump";
  const applicationOnly = !!line.inputs.materialByClient;

  const material = applicationOnly
    ? { value: 0, missing: [] as string[] }
    : totalMaterialPerUnit(family, secondaries, line.inputs, settings);
  for (const name of material.missing) {
    nudges.push({
      rule: "missing_cost",
      severity: "warn",
      message: `No cost available for ${name}. Enter a manual cost or link a Books product.`,
      lineId: line.id,
    });
  }

  const labour = labourPerUnit(tier, line.inputs, quote.siteProfile, settings) ?? 0;
  const crewReference = crewCostReferencePerUnit(
    tier,
    line.inputs,
    stage?.productivity ?? null,
    stage?.speedWeight ?? null,
    settings
  );
  const consumables = stage?.consumablePerSqm ?? 0;
  const equipment = 0;

  const overhead = quote.overheadPct ?? settings.defaultOverhead;
  const margin = line.inputs.marginOverride ?? quote.marginPct ?? settings.defaultMargin;
  const quotedEarly = line.quotedRate ?? null;

  let costPerUnit: number;
  let floorRounded: number;
  let calculated: number;
  if (applicationOnly) {
    // Application-only mode: client supplies material. Our cost is the crew
    // cost reference alone; the suggested price is the application-only list
    // rate (or the tier application rate when no list price exists) times the
    // site labour multiplier. List prices already carry margin.
    costPerUnit = crewReference ?? labour;
    floorRounded = isLump ? Math.round(costPerUnit) : Math.round(costPerUnit * 2) / 2;
    const listRate =
      applicationOnlyListRate(stage, line.inputs) ??
      line.inputs.applicationRateOverride ??
      tier?.applicationRatePerSqm ??
      0;
    const priced = listRate * quote.siteProfile.labourMultiplier;
    const sited = line.inputs.upperFloorOrRoof ? priced * upperFloorFactor(settings) : priced;
    calculated = roundRate(sited, isLump);
  } else {
    costPerUnit = material.value + labour + consumables + equipment;
    const { floor, price } = priceFromCost(costPerUnit, overhead, margin);
    const sited = line.inputs.upperFloorOrRoof ? price * upperFloorFactor(settings) : price;
    const modelCalculated = roundRate(sited, isLump);
    // Manual lump lines (scaffolding, garbage, demolition priced as a lump):
    // when the engine has no usable cost basis the model price rounds to zero,
    // so the quoted amount passes through as the suggested price instead of
    // dragging the calculated total to nothing the engine never meant.
    calculated =
      isLump && quotedEarly !== null && modelCalculated === 0 ? quotedEarly : modelCalculated;
    floorRounded = isLump ? Math.round(floor) : Math.round(floor * 2) / 2;
  }

  const quoted = line.quotedRate ?? null;
  const qtyForTotals = line.isRateOnly ? 0 : line.qty;

  // Nudge rules that read one line (spec section 5)
  if (quoted !== null && quoted < floorRounded) {
    nudges.push({
      rule: "below_cost_floor",
      severity: "block",
      message: `Your price ${quoted} is below our cost of ${floorRounded}. This line loses money.`,
      lineId: line.id,
    });
  } else if (quoted !== null && quoted < calculated) {
    nudges.push({
      rule: "below_calculated",
      severity: "warn",
      message: `Your price ${quoted} sits below the suggested ${calculated}.`,
      lineId: line.id,
    });
  }
  if (family?.coverageConfidence === "L" || stage?.productivityConfidence === "L") {
    nudges.push({
      rule: "low_confidence",
      severity: "info",
      message: "A low-confidence coverage or productivity feeds this line.",
      lineId: line.id,
    });
  }
  if (family?.costFlag === "zero_cost" || family?.costFlag === "duplicate_suspect") {
    nudges.push({
      rule: "product_data_flag",
      severity: "warn",
      message: `${family.name}: the representative Books item is flagged ${family.costFlag === "zero_cost" ? "zero cost" : "duplicate suspect"}.`,
      lineId: line.id,
    });
  }
  const matches = history.filter(
    (h) =>
      h.stageId !== null &&
      h.stageId === line.stageId &&
      (h.familyId === null || h.familyId === line.familyId)
  );
  if (quoted !== null && matches.length >= 2) {
    const med = median(matches.map((m) => m.unitPrice));
    if (med > 0 && Math.abs(quoted - med) / med > 0.15) {
      const last = matches
        .slice(-3)
        .map((m) => `${m.quoteNumber} at ${m.unitPrice}`)
        .join(", ");
      nudges.push({
        rule: "history_deviation",
        severity: "warn",
        message: `Your price ${quoted} deviates more than 15% from the median of ${med} for this stage (${last}).`,
        lineId: line.id,
      });
    }
  }

  return {
    lineId: line.id,
    materialPerUnit: material.value,
    labourPerUnit: labour,
    consumablesPerUnit: consumables,
    equipmentPerUnit: equipment,
    crewCostReferencePerUnit: crewReference,
    costPerUnit,
    floorPerUnit: floorRounded,
    calculatedPerUnit: calculated,
    quotedPerUnit: quoted,
    lineCost: costPerUnit * qtyForTotals,
    lineFloor: floorRounded * qtyForTotals,
    lineCalculated: calculated * qtyForTotals,
    lineQuoted: quoted === null ? null : quoted * qtyForTotals,
    nudges,
  };
}

// Dependent-stage pairs (spec rule 4): if a line matches `needs` and no
// included line matches `wants`, warn.
const DEPENDENCY_RULES: { needs: RegExp; wants: RegExp; message: string }[] = [
  {
    needs: /epoxy|self.?level|\bsl\b|mapefloor|ultraplan/i,
    wants: /primer|prep|grind/i,
    message: "Epoxy or self-levelling with no primer or surface preparation stage.",
  },
  {
    needs: /bitumen|membrane.*torch|awazel|py\s*40/i,
    wants: /protection/i,
    message: "Bitumen membrane with no protection stage.",
  },
];

export function computeQuote(
  quote: QuoteInput,
  ref: ReferenceData,
  history: HistoryPoint[] = []
): QuoteTotals {
  const included = quote.lines.filter((l) => l.included);
  const lines = quote.lines.map((l) => computeLine(l, quote, ref, history));
  const includedBreakdowns = lines.filter(
    (b) => quote.lines.find((l) => l.id === b.lineId)?.included
  );

  const floorSubtotal = includedBreakdowns.reduce((s, b) => s + b.lineFloor, 0);
  const calculatedSubtotal = includedBreakdowns.reduce((s, b) => s + b.lineCalculated, 0);
  const quotedSubtotal = includedBreakdowns.reduce((s, b) => s + (b.lineQuoted ?? 0), 0);
  const labourSubtotal = includedBreakdowns.reduce((s, b) => {
    const line = quote.lines.find((l) => l.id === b.lineId)!;
    return s + b.labourPerUnit * (line.isRateOnly ? 0 : line.qty);
  }, 0);

  const cureDaysTotal = included.reduce((s, l) => {
    const stage = l.stageId ? ref.stagesById.get(l.stageId) : null;
    return s + (stage?.cureDays ?? 0);
  }, 0);

  const programme = computeProgramme({
    baseCrewDays: quote.baseProgrammeCrewDays ?? null,
    programmeDaysRequested: quote.programmeDaysRequested ?? null,
    programmeHoursPerDay: quote.programmeHoursPerDay ?? null,
    cureDaysTotal,
    labourSubtotal,
    mobilisationPerCrew:
      quote.siteProfile.transportPerTrip * quote.siteProfile.mobilisationMultiplier,
    site: quote.siteProfile,
    settings: ref.settings,
  });

  const nudges: Nudge[] = lines.flatMap((b) => b.nudges);
  if (programme.infeasible) {
    nudges.push({ rule: "programme_infeasible", severity: "block", message: programme.explanation });
  }
  for (const rule of DEPENDENCY_RULES) {
    const hasNeed = included.some((l) => rule.needs.test(l.description));
    const hasWant = included.some((l) => rule.wants.test(l.description));
    if (hasNeed && !hasWant) {
      nudges.push({ rule: "missing_dependent_stage", severity: "warn", message: rule.message });
    }
  }

  const vatRate = ref.settings.vatRate;
  const calcWithProgramme = calculatedSubtotal + programme.upliftTotal;
  const floorWithProgramme = floorSubtotal + programme.upliftTotal;

  return {
    lines,
    floorSubtotal,
    calculatedSubtotal,
    quotedSubtotal,
    programme,
    vatFloor: floorWithProgramme * vatRate,
    vatCalculated: calcWithProgramme * vatRate,
    vatQuoted: quotedSubtotal * vatRate,
    totalFloor: floorWithProgramme * (1 + vatRate),
    totalCalculated: calcWithProgramme * (1 + vatRate),
    totalQuoted: quotedSubtotal * (1 + vatRate),
    nudges,
  };
}
