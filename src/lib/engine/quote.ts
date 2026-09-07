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
  crewCostReferencePerUnit,
  priceFromCost,
  roundRate,
  suggestLabour,
  upperFloorFactor,
} from "./pricing";
import { computeProgramme } from "./programme";

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Prep stages default to absorbing their labour in the margin when a main
// application stage of the same discipline is on the quote. Demolition is
// not a prep stage.
export function isPrepStage(name: string): boolean {
  if (/demoli/i.test(name)) return false;
  return /grind|prim/i.test(name) || /surface prep/i.test(name);
}

function absorbByDefault(line: LineInput, quote: QuoteInput, ref: ReferenceData): boolean {
  const stage = line.stageId ? ref.stagesById.get(line.stageId) : null;
  if (!stage || !isPrepStage(stage.name)) return false;
  return quote.lines.some((other) => {
    if (other.id === line.id || !other.included) return false;
    const otherStage = other.stageId ? ref.stagesById.get(other.stageId) : null;
    return !!otherStage && otherStage.discipline === stage.discipline && !isPrepStage(otherStage.name);
  });
}

export function computeLine(
  line: LineInput,
  quote: QuoteInput,
  ref: ReferenceData,
  history: HistoryPoint[] = [],
  // Per-unit labour share from the quote-level job total, when distributed
  jobTotalSharePerUnit: number | null = null
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

  const crewReference = crewCostReferencePerUnit(
    tier,
    line.inputs,
    stage?.productivity ?? null,
    stage?.speedWeight ?? null,
    settings
  );
  const consumables = stage?.consumablePerSqm ?? 0;
  const equipment = 0;

  // Labour is an input with a suggestion, never a nudge target. Resolution:
  // absorbed (explicit, or default on prep stages when a main application
  // stage of the same discipline is included) -> manual override -> share of
  // the quote-level job total -> the engine suggestion.
  const suggestion = suggestLabour({
    stage,
    tier,
    inputs: line.inputs,
    site: quote.siteProfile,
    settings,
    tileLabourAnchors: ref.tileLabourAnchors,
    labourHistory: ref.labourHistory,
  });
  const absorbed = line.inputs.absorbLabour ?? absorbByDefault(line, quote, ref);
  let labour: number;
  let labourSource: LineBreakdown["labourSource"];
  if (absorbed) {
    labour = 0;
    labourSource = "absorbed";
  } else if (typeof line.inputs.labourOverride === "number") {
    labour = line.inputs.labourOverride;
    labourSource = "manual";
  } else if (jobTotalSharePerUnit !== null) {
    labour = jobTotalSharePerUnit;
    labourSource = "job total";
  } else {
    labour = suggestion.value;
    labourSource = suggestion.source;
  }

  const overhead = quote.overheadPct ?? settings.defaultOverhead;
  const margin = line.inputs.marginOverride ?? quote.marginPct ?? settings.defaultMargin;
  const quotedEarly = line.quotedRate ?? null;

  // Our cost never includes labour (UPDATE_LABOUR_MODEL.md section 1):
  // material + consumables + equipment, plus overhead.
  const floorBase = material.value + consumables + equipment;
  const { floor } = priceFromCost(floorBase, overhead, margin);
  const floorRounded = isLump ? Math.round(floor) : Math.round(floor * 2) / 2;

  const costPerUnit = material.value + labour + consumables + equipment;
  let calculated: number;
  if (applicationOnly) {
    // Client supplies material: the suggested price is the labour figure
    // itself; application-only list rates already carry margin.
    const sited = line.inputs.upperFloorOrRoof ? labour * upperFloorFactor(settings) : labour;
    calculated = roundRate(sited, isLump);
  } else {
    const { price } = priceFromCost(costPerUnit, overhead, margin);
    const sited = line.inputs.upperFloorOrRoof ? price * upperFloorFactor(settings) : price;
    const modelCalculated = roundRate(sited, isLump);
    // Manual lump lines (scaffolding, garbage, demolition priced as a lump):
    // when the engine has no usable cost basis the model price rounds to zero,
    // so the quoted amount passes through as the suggested price instead of
    // dragging the calculated total to nothing the engine never meant.
    calculated =
      isLump && quotedEarly !== null && modelCalculated === 0 ? quotedEarly : modelCalculated;
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
  // No nudges ever fire on labour; low confidence only speaks about coverage.
  if (family?.coverageConfidence === "L") {
    nudges.push({
      rule: "low_confidence",
      severity: "info",
      message: "A low-confidence material coverage feeds this line.",
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
    labourSuggestedPerUnit: suggestion.value,
    labourSource,
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

  // Quote-level labour job total: distribute across labour-bearing lines pro
  // rata to their suggestions; per-line overrides keep their own value. A
  // line is labour-bearing when included, not rate-only, not absorbed, and
  // its suggestion is above zero.
  const suggestions = new Map<string, number>();
  let suggestionWeight = 0;
  for (const l of quote.lines) {
    const stage = l.stageId ? (ref.stagesById.get(l.stageId) ?? null) : null;
    const tier = l.tierId ? (ref.tiersById.get(l.tierId) ?? null) : null;
    const s = suggestLabour({
      stage,
      tier,
      inputs: l.inputs,
      site: quote.siteProfile,
      settings: ref.settings,
      tileLabourAnchors: ref.tileLabourAnchors,
      labourHistory: ref.labourHistory,
    });
    suggestions.set(l.id, s.value);
    const absorbed = l.inputs.absorbLabour ?? absorbByDefault(l, quote, ref);
    if (l.included && !l.isRateOnly && !absorbed && s.value > 0) {
      suggestionWeight += s.value * l.qty;
    }
  }
  const jobTotal = quote.labourJobTotal ?? null;
  const sharePerUnit = (l: LineInput): number | null => {
    if (jobTotal === null || suggestionWeight <= 0) return null;
    const absorbed = l.inputs.absorbLabour ?? absorbByDefault(l, quote, ref);
    const s = suggestions.get(l.id) ?? 0;
    if (!l.included || l.isRateOnly || absorbed || s <= 0) return null;
    return (jobTotal * s) / suggestionWeight;
  };

  const lines = quote.lines.map((l) => computeLine(l, quote, ref, history, sharePerUnit(l)));
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

  const labourSuggestedTotal = quote.lines.reduce((s, l) => {
    const absorbed = l.inputs.absorbLabour ?? absorbByDefault(l, quote, ref);
    if (!l.included || l.isRateOnly || absorbed) return s;
    return s + (suggestions.get(l.id) ?? 0) * l.qty;
  }, 0);

  return {
    lines,
    labourSuggestedTotal,
    labourJobTotal: jobTotal,
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
