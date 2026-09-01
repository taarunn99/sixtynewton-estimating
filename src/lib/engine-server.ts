// Server-side bridge: loads a quote and reference data, runs the pure engine,
// returns a serializable result for the ledger. Cost data never reaches the
// client beyond the per-line breakdowns of the quote being viewed.
import { createServiceClient } from "@/lib/supabase/server";
import {
  computeQuote,
  type EngineSettings,
  type FamilyRef,
  type HistoryPoint,
  type LineInput,
  type QuoteInput,
  type ReferenceData,
  type SiteProfileRef,
  type StageRef,
  type TierRef,
} from "@/lib/engine";

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v);

export type LedgerLine = {
  id: string;
  sort: number;
  description: string;
  detail: string | null;
  discipline: string;
  familyId: string | null;
  familyName: string | null;
  qty: number;
  unit: string;
  included: boolean;
  isRateOnly: boolean;
  quoted: number | null;
  floor: number;
  calculated: number;
  breakdown: {
    material: number;
    labour: number;
    consumables: number;
    equipment: number;
    cost: number;
    // Reference only, never applied to the price
    crewCostReference: number | null;
  };
  nudges: { rule: string; severity: string; message: string }[];
};

export type LedgerResult = {
  quote: {
    id: string;
    number: string;
    revision: number;
    status: string;
    quoteDate: string;
    validDays: number;
    clientName: string;
    siteName: string;
    siteProfileName: string;
    labourMultiplier: number;
    paymentTerms: string;
    programmeDaysRequested: number | null;
    programmeHoursPerDay: number | null;
    programmeBaseCrewDays: number | null;
    marginPct: number;
    noiseRestricted: boolean;
  };
  lines: LedgerLine[];
  totals: {
    floorSubtotal: number;
    calculatedSubtotal: number;
    quotedSubtotal: number;
    programmeUplift: number;
    programmeExplanation: string;
    programmeInfeasible: boolean;
    vatFloor: number;
    vatCalculated: number;
    vatQuoted: number;
    totalFloor: number;
    totalCalculated: number;
    totalQuoted: number;
  };
  quoteNudges: { rule: string; severity: string; message: string }[];
  revisions: {
    revision: number;
    status: string;
    quotedTotal: number | null;
    changed: string;
  }[];
};

export async function computeLedger(quoteId: string): Promise<LedgerResult | null> {
  const supabase = createServiceClient();

  const { data: quote } = await supabase
    .from("quotes")
    .select("*, clients(name), sites(name, site_profile_id)")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return null;

  const [{ data: lines }, { data: settingsRow }, { data: famRows }, { data: tierRows }, { data: stageRows }, { data: profileRow }, { data: revisions }] =
    await Promise.all([
      supabase.from("quote_lines").select("*").eq("quote_id", quoteId).order("sort"),
      supabase.from("settings").select("*").single(),
      supabase
        .from("product_families")
        .select(
          "id, name, driver, pack_qty, pack_unit, coverage_value, coverage_unit, default_multiplier, waste_pct, coverage_confidence, manual_cost, manual_pack_qty, manual_pack_unit, representative_product_id, discipline"
        ),
      supabase.from("labour_tiers").select("id, name, crew_size, crew_day_cost, derived_application_rate_per_sqm, rate_confidence"),
      supabase.from("stages").select("id, name, discipline, cure_days, consumable_per_sqm, default_productivity_sqm_per_crew_day, productivity_confidence, speed_weight, subsequent_coat_factor"),
      quote.sites?.site_profile_id
        ? supabase.from("site_profiles").select("*").eq("id", quote.sites.site_profile_id).single()
        : Promise.resolve({ data: null }),
      supabase
        .from("quotes")
        .select("id, revision, status, totals, updated_at")
        .eq("number", quote.number)
        .order("revision"),
    ]);

  const repIds = (famRows ?? []).map((f) => f.representative_product_id).filter(Boolean);
  const costById = new Map<string, { books_cost: number | null; cost_flag: string }>();
  for (let i = 0; i < repIds.length; i += 200) {
    const { data } = await supabase
      .from("products")
      .select("id, books_cost, cost_flag")
      .in("id", repIds.slice(i, i + 200));
    for (const p of data ?? []) costById.set(p.id, p);
  }

  const settings: EngineSettings = {
    intercompanyFactor: Number(settingsRow!.intercompany_factor),
    vatRate: Number(settingsRow!.vat_rate),
    defaultMargin: Number(settingsRow!.default_margin),
    defaultOverhead: Number(settingsRow!.default_overhead),
    defaultWaste: Number(settingsRow!.default_waste),
    workingHoursPerDay: Number(settingsRow!.working_hours_per_day),
    workingDaysPerWeek: Number(settingsRow!.working_days_per_week),
    congestionLossPerExtraCrew: Number(settingsRow!.congestion_loss_per_extra_crew),
    baselineProductivityPerCrewDay: num(settingsRow!.baseline_productivity_sqm_per_crew_day) ?? undefined,
    upperFloorFactor: num(settingsRow!.upper_floor_factor) ?? undefined,
    logisticsPickupCost: num(settingsRow!.logistics_pickup_cost) ?? undefined,
    logisticsTruckCost: num(settingsRow!.logistics_truck_cost) ?? undefined,
    logisticsTruckCapacityTons: num(settingsRow!.logistics_truck_capacity_tons) ?? undefined,
    logisticsBargePerTon: num(settingsRow!.logistics_barge_per_ton) ?? undefined,
  };

  const familiesById = new Map<string, FamilyRef>(
    (famRows ?? []).map((f) => {
      const rep = f.representative_product_id ? costById.get(f.representative_product_id) : null;
      return [
        f.id,
        {
          id: f.id,
          name: f.name,
          driver: f.driver,
          packQty: num(f.pack_qty),
          packUnit: f.pack_unit,
          booksCost: num(rep?.books_cost),
          costFlag: (rep?.cost_flag ?? "ok") as FamilyRef["costFlag"],
          manualCost: num(f.manual_cost),
          manualPackQty: num(f.manual_pack_qty),
          manualPackUnit: f.manual_pack_unit,
          coverageValue: num(f.coverage_value),
          coverageUnit: f.coverage_unit,
          defaultMultiplier: num(f.default_multiplier),
          wastePct: num(f.waste_pct),
          coverageConfidence: f.coverage_confidence,
        },
      ];
    })
  );

  const tiersById = new Map<string, TierRef>(
    (tierRows ?? []).map((t) => [
      t.id,
      {
        id: t.id,
        name: t.name,
        crewSize: num(t.crew_size),
        crewDayCost: num(t.crew_day_cost),
        applicationRatePerSqm: num(t.derived_application_rate_per_sqm),
        confidence: t.rate_confidence,
      },
    ])
  );

  const stagesById = new Map<string, StageRef>(
    (stageRows ?? []).map((s) => [
      s.id,
      {
        id: s.id,
        name: s.name,
        discipline: s.discipline,
        cureDays: num(s.cure_days),
        consumablePerSqm: num(s.consumable_per_sqm),
        productivity: num(s.default_productivity_sqm_per_crew_day),
        productivityConfidence: s.productivity_confidence,
        speedWeight: num(s.speed_weight),
        subsequentCoatFactor: num(s.subsequent_coat_factor),
      },
    ])
  );

  const siteProfile: SiteProfileRef = profileRow
    ? {
        allowedHoursPerDay: Number(profileRow.allowed_hours_per_day),
        allowedDaysPerWeek: Number(profileRow.allowed_days_per_week),
        labourMultiplier: Number(profileRow.labour_multiplier),
        mobilisationMultiplier: Number(profileRow.mobilisation_multiplier),
        transportPerTrip: Number(profileRow.transport_per_trip),
        permitLump: Number(profileRow.permit_lump),
        parkingPerDay: Number(profileRow.parking_per_day),
        noiseRestricted: profileRow.noise_restricted,
        isIsland: profileRow.is_island ?? false,
      }
    : {
        allowedHoursPerDay: settings.workingHoursPerDay,
        allowedDaysPerWeek: settings.workingDaysPerWeek,
        labourMultiplier: 1,
        mobilisationMultiplier: 1,
        transportPerTrip: 0,
        permitLump: 0,
        parkingPerDay: 0,
        noiseRestricted: false,
      };

  const engineLines: LineInput[] = (lines ?? []).map((l) => ({
    id: l.id,
    stageId: l.stage_id,
    familyId: l.family_id,
    tierId: (l.inputs?.tierId as string) ?? null,
    description: l.description,
    qty: Number(l.qty ?? 0),
    unit: l.unit ?? "sqm",
    included: l.included,
    isRateOnly: l.is_rate_only,
    quotedRate: num(l.unit_price),
    inputs: l.inputs ?? {},
  }));

  const quoteInput: QuoteInput = {
    lines: engineLines,
    siteProfile,
    programmeDaysRequested: num(quote.programme_days_requested),
    programmeHoursPerDay: num(quote.programme_hours_per_day),
    baseProgrammeCrewDays: num(quote.programme_base_crew_days),
    marginPct: num(quote.margin_pct) ?? undefined,
    overheadPct: num(quote.overhead_pct) ?? undefined,
  };

  // History: issued quote lines plus imported observed rates by stage
  const { data: importedRates } = await supabase
    .from("imported_quotes")
    .select("stage_id, family_id, rate, quote_number, quote_date_text");
  const history: HistoryPoint[] = (importedRates ?? [])
    .filter((r) => r.rate !== null)
    .map((r) => ({
      stageId: r.stage_id,
      familyId: r.family_id,
      unitPrice: Number(r.rate),
      quoteNumber: r.quote_number ?? "",
      quoteDate: r.quote_date_text ?? "",
    }));

  const ref: ReferenceData = { settings, familiesById, tiersById, stagesById };
  const totals = computeQuote(quoteInput, ref, history);

  const ledgerLines: LedgerLine[] = (lines ?? []).map((l, i) => {
    const b = totals.lines[i];
    const stage = l.stage_id ? stagesById.get(l.stage_id) : null;
    const family = l.family_id ? familiesById.get(l.family_id) : null;
    return {
      id: l.id,
      sort: l.sort,
      description: l.description,
      detail: (l.inputs?.detail as string) ?? null,
      discipline: stage?.discipline ?? "Other",
      familyId: l.family_id,
      familyName: family?.name ?? null,
      qty: Number(l.qty ?? 0),
      unit: l.unit ?? "sqm",
      included: l.included,
      isRateOnly: l.is_rate_only,
      quoted: num(l.unit_price),
      floor: b.floorPerUnit,
      calculated: b.calculatedPerUnit,
      breakdown: {
        material: b.materialPerUnit,
        labour: b.labourPerUnit,
        consumables: b.consumablesPerUnit,
        equipment: b.equipmentPerUnit,
        cost: b.costPerUnit,
        crewCostReference: b.crewCostReferencePerUnit,
      },
      nudges: b.nudges,
    };
  });

  return {
    quote: {
      id: quote.id,
      number: quote.number,
      revision: quote.revision,
      status: quote.status,
      quoteDate: quote.quote_date,
      validDays: quote.valid_days,
      clientName: quote.clients?.name ?? "",
      siteName: quote.sites?.name ?? "",
      siteProfileName: profileRow?.name ?? "Standard",
      labourMultiplier: siteProfile.labourMultiplier,
      paymentTerms: quote.payment_terms,
      programmeDaysRequested: num(quote.programme_days_requested),
      programmeHoursPerDay: num(quote.programme_hours_per_day),
      programmeBaseCrewDays: num(quote.programme_base_crew_days),
      marginPct: num(quote.margin_pct) ?? settings.defaultMargin,
      noiseRestricted: siteProfile.noiseRestricted,
    },
    lines: ledgerLines,
    totals: {
      floorSubtotal: totals.floorSubtotal,
      calculatedSubtotal: totals.calculatedSubtotal,
      quotedSubtotal: totals.quotedSubtotal,
      programmeUplift: totals.programme.upliftTotal,
      programmeExplanation: totals.programme.explanation,
      programmeInfeasible: totals.programme.infeasible,
      vatFloor: totals.vatFloor,
      vatCalculated: totals.vatCalculated,
      vatQuoted: totals.vatQuoted,
      totalFloor: totals.totalFloor,
      totalCalculated: totals.totalCalculated,
      totalQuoted: totals.totalQuoted,
    },
    quoteNudges: totals.nudges.filter((n) => !n.lineId),
    revisions: (revisions ?? []).map((r) => ({
      revision: r.revision,
      status: r.status,
      quotedTotal: r.id === quote.id ? null : (r.totals?.totalQuoted as number | null) ?? null,
      changed: r.id === quote.id ? "current draft, updates live" : `R${r.revision}, ${r.status}`,
    })),
  };
}
