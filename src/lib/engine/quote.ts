// Assembles per-line breakdowns and quote totals. Spec sections 4 and 5.
import type {
  AdjustmentRow,
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

// Occupied building scales labour suggestions by 1 / productivity factor
export function suggestionScale(quote: QuoteInput, settings: ReferenceData["settings"]): number {
  return quote.occupiedBuilding ? 1 / (settings.occupiedProductivityFactor ?? 0.85) : 1;
}

// Microtopping lines describe their build-up (base coat mm x coats, finish
// coat mm, sealer coats); the engine translates that to thickness and coats.
export function effectiveInputs(inputs: LineInput["inputs"]): LineInput["inputs"] {
  if (
    inputs.baseCoatMm === undefined &&
    inputs.baseCoats === undefined &&
    inputs.finishCoatMm === undefined &&
    inputs.sealerCoats === undefined
  ) {
    return inputs;
  }
  const baseCoats = inputs.baseCoats ?? 1;
  const thickness = (inputs.baseCoatMm ?? 0) * baseCoats + (inputs.finishCoatMm ?? 0);
  const coats = baseCoats + (inputs.finishCoatMm ? 1 : 0) + (inputs.sealerCoats ?? 0);
  return {
    ...inputs,
    thicknessMm: thickness > 0 ? thickness : inputs.thicknessMm,
    coats,
  };
}

// History matching for the suggested price (section 6): same stage and family
// first, then same stage, then same discipline; unit must agree where known;
// application-only lines match only application-only history.
export function matchHistory(
  line: LineInput,
  ref: ReferenceData,
  history: HistoryPoint[]
): { matches: HistoryPoint[]; level: "stage and family" | "stage" | "discipline" } | null {
  const stage = line.stageId ? ref.stagesById.get(line.stageId) : null;
  if (!stage) return null;
  const appOnly = !!line.inputs.materialByClient;
  const pool = history.filter((h) => {
    if (h.unit && h.unit !== line.unit) return false;
    return appOnly ? h.applicationOnly === true : !h.applicationOnly;
  });
  const byFamily = pool.filter(
    (h) => h.stageId === stage.id && line.familyId && h.familyId === line.familyId
  );
  if (byFamily.length >= 2) return { matches: byFamily, level: "stage and family" };
  const byStage = pool.filter((h) => h.stageId === stage.id);
  if (byStage.length >= 2) return { matches: byStage, level: "stage" };
  const byDiscipline = pool.filter((h) => {
    const hStage = h.stageId ? ref.stagesById.get(h.stageId) : null;
    return hStage?.discipline === stage.discipline;
  });
  if (byDiscipline.length >= 2) return { matches: byDiscipline, level: "discipline" };
  return null;
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
  const inputs = effectiveInputs(line.inputs);
  const secondaries = (inputs.secondaryFamilyIds ?? [])
    .map((id) => ref.familiesById.get(id))
    .filter((f): f is NonNullable<typeof f> => !!f);

  const nudges: Nudge[] = [];
  const isLump = line.unit === "lump";
  const applicationOnly = !!inputs.materialByClient;

  const material = applicationOnly
    ? { value: 0, missing: [] as string[] }
    : totalMaterialPerUnit(family, secondaries, inputs, settings);
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
  // Consumables are covered inside the application rate (about 25 per
  // crew-day) and equipment is owned: neither enters the quote maths.
  const consumables = 0;
  const equipment = 0;

  // Labour is an input with a suggestion, never a nudge target. Resolution:
  // absorbed (explicit, or default on prep stages when a main application
  // stage of the same discipline is included) -> manual override -> share of
  // the quote-level job total -> the engine suggestion.
  const scale = suggestionScale(quote, settings);
  const rawSuggestion = suggestLabour({
    stage,
    tier,
    inputs,
    site: quote.siteProfile,
    settings,
    tileLabourAnchors: ref.tileLabourAnchors,
    labourHistory: ref.labourHistory,
  });
  // Occupied building scales the suggestion only; typed labour is untouched
  const suggestion = { ...rawSuggestion, value: rawSuggestion.value * scale };
  const absorbed = inputs.absorbLabour ?? absorbByDefault(line, quote, ref);
  let labour: number;
  let labourSource: LineBreakdown["labourSource"];
  if (absorbed) {
    labour = 0;
    labourSource = "absorbed";
  } else if (typeof inputs.labourOverride === "number") {
    labour = inputs.labourOverride;
    labourSource = "manual";
  } else if (jobTotalSharePerUnit !== null) {
    labour = jobTotalSharePerUnit;
    labourSource = "job total";
  } else {
    labour = suggestion.value;
    labourSource = suggestion.source;
  }

  const overhead = quote.overheadPct ?? settings.defaultOverhead;
  const margin = inputs.marginOverride ?? quote.marginPct ?? settings.defaultMargin;
  const quotedEarly = line.quotedRate ?? null;

  // Our cost is material plus overhead. Labour never enters it, and
  // consumables (about 25 per crew-day) are covered inside the application
  // rate (UPDATE_VARIABLES_CASH.md section 4).
  const floorBase = material.value + equipment;
  const { floor } = priceFromCost(floorBase, overhead, margin);
  const floorRounded = isLump ? Math.round(floor) : Math.round(floor * 2) / 2;

  const costPerUnit = material.value + labour + equipment;
  let engineCalculated: number;
  if (applicationOnly) {
    // Client supplies material: the suggested price is the labour figure
    // itself; application-only list rates already carry margin.
    const sited = inputs.upperFloorOrRoof ? labour * upperFloorFactor(settings) : labour;
    engineCalculated = roundRate(sited, isLump);
  } else {
    const { price } = priceFromCost(costPerUnit, overhead, margin);
    const sited = inputs.upperFloorOrRoof ? price * upperFloorFactor(settings) : price;
    const modelCalculated = roundRate(sited, isLump);
    // Manual lump lines (scaffolding, garbage, demolition priced as a lump):
    // when the engine has no usable cost basis the model price rounds to zero,
    // so the quoted amount passes through as the suggested price instead of
    // dragging the calculated total to nothing the engine never meant.
    engineCalculated =
      isLump && quotedEarly !== null && modelCalculated === 0 ? quotedEarly : modelCalculated;
  }

  // Suggested price both ways (section 6): history median of matching
  // accepted quote lines leads when at least 2 matches exist; the engine
  // build-up otherwise. Both figures are always reported. Lumps stay on the
  // engine side: lump amounts are job-specific and medians mislead.
  const historyMatch = isLump ? null : matchHistory(line, ref, history);
  const approximate = !!(inputs.tileLengthMm || inputs.thicknessMm);
  const priceHistory = historyMatch
    ? {
        median: median(historyMatch.matches.map((m) => m.unitPrice)),
        count: historyMatch.matches.length,
        matchLevel: historyMatch.level,
        approximate,
        quotes: historyMatch.matches
          .slice(0, 4)
          .map((m) => ({ quoteNumber: m.quoteNumber, rate: m.unitPrice, date: m.quoteDate })),
      }
    : null;
  const useHistory = priceHistory !== null && priceHistory.count >= 2;
  const calculated = useHistory ? roundRate(priceHistory.median, isLump) : engineCalculated;
  const priceDiverges =
    priceHistory !== null &&
    engineCalculated > 0 &&
    Math.abs(priceHistory.median - engineCalculated) / engineCalculated > 0.25;

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
    priceHistory,
    priceEngine: engineCalculated,
    priceSourceUsed: useHistory ? ("history" as const) : ("engine" as const),
    priceDiverges,
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
  const scale = suggestionScale(quote, ref.settings);
  const suggestions = new Map<string, number>();
  let suggestionWeight = 0;
  for (const l of quote.lines) {
    const stage = l.stageId ? (ref.stagesById.get(l.stageId) ?? null) : null;
    const tier = l.tierId ? (ref.tiersById.get(l.tierId) ?? null) : null;
    const s = suggestLabour({
      stage,
      tier,
      inputs: effectiveInputs(l.inputs),
      site: quote.siteProfile,
      settings: ref.settings,
      tileLabourAnchors: ref.tileLabourAnchors,
      labourHistory: ref.labourHistory,
    });
    s.value *= scale;
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
    settings: {
      ...ref.settings,
      workingDaysPerWeek: quote.programmeDaysPerWeek ?? ref.settings.workingDaysPerWeek,
    },
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

  const labourSuggestedTotal = quote.lines.reduce((s, l) => {
    const absorbed = l.inputs.absorbLabour ?? absorbByDefault(l, quote, ref);
    if (!l.included || l.isRateOnly || absorbed) return s;
    return s + (suggestions.get(l.id) ?? 0) * l.qty;
  }, 0);

  // Named adjustment rows from the working variables (section 1). "in rates"
  // rows are already inside line prices; "added" rows go on top of the
  // calculated subtotal. None of them ever nudges, and none reaches the PDF.
  const adjustments: AdjustmentRow[] = [];
  if (programme.applied && (programme.upliftTotal > 0 || programme.infeasible)) {
    adjustments.push({
      name: "Programme compression",
      amount: programme.upliftTotal,
      mode: "added",
      explanation: programme.explanation,
    });
  }
  if (quote.occupiedBuilding) {
    const factor = ref.settings.occupiedProductivityFactor ?? 0.85;
    const affected = lines.reduce((s, b, i) => {
      const l = quote.lines[i];
      const usedSuggestion = !["manual", "absorbed", "job total"].includes(b.labourSource);
      if (!l.included || l.isRateOnly || !usedSuggestion) return s;
      return s + b.labourSuggestedPerUnit * (1 - factor) * l.qty;
    }, 0);
    adjustments.push({
      name: "Occupied building",
      amount: affected,
      mode: "in rates",
      explanation: `Labour suggestions divided by the productivity factor ${factor}, about +${Math.round((1 / factor - 1) * 100)}%. Already inside the suggested rates. Lines where you typed the labour are untouched, and this row computes only from suggestion-led lines.`,
    });
  }
  if (quote.nightWorkPct != null) {
    adjustments.push({
      name: "Night work",
      amount: (quote.nightWorkPct / 100) * labourSubtotal,
      mode: "added",
      explanation: `${quote.nightWorkPct}% on the labour subtotal of ${Math.round(labourSubtotal).toLocaleString("en-US")}, computed from labour as entered, including any values you typed.`,
    });
  }
  for (const cv of quote.customVariables ?? []) {
    let amount = 0;
    let explanation = "";
    if (cv.kind === "pct_labour") {
      amount = (cv.value / 100) * labourSubtotal;
      explanation = `${cv.value}% on the labour subtotal of ${Math.round(labourSubtotal).toLocaleString("en-US")}.`;
    } else if (cv.kind === "pct_quote") {
      amount = (cv.value / 100) * calculatedSubtotal;
      explanation = `${cv.value}% on the quote subtotal of ${Math.round(calculatedSubtotal).toLocaleString("en-US")}.`;
    } else if (cv.kind === "fixed") {
      amount = cv.value;
      explanation = `Fixed amount.`;
    } else {
      const days = quote.programmeDaysRequested ?? 0;
      amount = cv.value * days;
      explanation = `${cv.value} per calendar day x ${days} days from the deadline.`;
    }
    adjustments.push({ name: cv.name, amount, mode: "added", explanation });
  }

  const addedTotal = adjustments
    .filter((a) => a.mode === "added")
    .reduce((s, a) => s + a.amount, 0);
  const calcWithProgramme = calculatedSubtotal + addedTotal;
  const floorWithProgramme = floorSubtotal + programme.upliftTotal;

  const materialSubtotal = includedBreakdowns.reduce((s, b) => {
    const line = quote.lines.find((l) => l.id === b.lineId)!;
    return s + b.materialPerUnit * (line.isRateOnly ? 0 : line.qty);
  }, 0);

  return {
    lines,
    labourSuggestedTotal,
    labourJobTotal: jobTotal,
    adjustments,
    materialSubtotal,
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
