// Loads live reference data and a quote from Supabase for calibration tests.
// Mirrors the mapping in src/lib/engine-server.ts without Next.js imports so
// vitest can run it directly. Requires .env.local; tests skip without it.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import type {
  EngineSettings,
  FamilyRef,
  LineInput,
  QuoteInput,
  ReferenceData,
  SiteProfileRef,
  StageRef,
  TierRef,
} from "../src/lib/engine";

config({ path: ".env.local" });

export const hasLiveEnv = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);

export function liveClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export async function loadLiveQuote(
  quoteNumber: string,
  revision: number,
  overrides: { includeAll?: boolean } = {}
): Promise<{ quoteInput: QuoteInput; ref: ReferenceData; lines: LineInput[] }> {
  const supabase = liveClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("*, sites(site_profile_id)")
    .eq("number", quoteNumber)
    .eq("revision", revision)
    .single();

  const [{ data: lineRows }, { data: settingsRow }, { data: famRows }, { data: tierRows }, { data: stageRows }, { data: profileRow }] =
    await Promise.all([
      supabase.from("quote_lines").select("*").eq("quote_id", quote.id).order("sort"),
      supabase.from("settings").select("*").single(),
      supabase
        .from("product_families")
        .select(
          "id, name, driver, pack_qty, pack_unit, coverage_value, coverage_unit, default_multiplier, waste_pct, coverage_confidence, manual_cost, manual_pack_qty, manual_pack_unit, representative_product_id"
        ),
      supabase.from("labour_tiers").select("*"),
      supabase.from("stages").select("*"),
      supabase.from("site_profiles").select("*").eq("id", quote.sites.site_profile_id).single(),
    ]);

  const repIds = (famRows ?? []).map((f) => f.representative_product_id).filter(Boolean);
  const costById = new Map<string, { books_cost: number | null; cost_flag: string }>();
  for (let i = 0; i < repIds.length; i += 400) {
    const { data } = await supabase
      .from("products")
      .select("id, books_cost, cost_flag")
      .in("id", repIds.slice(i, i + 400));
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

  const siteProfile: SiteProfileRef = {
    allowedHoursPerDay: Number(profileRow!.allowed_hours_per_day),
    allowedDaysPerWeek: Number(profileRow!.allowed_days_per_week),
    labourMultiplier: Number(profileRow!.labour_multiplier),
    mobilisationMultiplier: Number(profileRow!.mobilisation_multiplier),
    transportPerTrip: Number(profileRow!.transport_per_trip),
    permitLump: Number(profileRow!.permit_lump),
    parkingPerDay: Number(profileRow!.parking_per_day),
    noiseRestricted: profileRow!.noise_restricted,
    isIsland: profileRow!.is_island ?? false,
  };

  const lines: LineInput[] = (lineRows ?? []).map((l) => ({
    id: l.id,
    stageId: l.stage_id,
    familyId: l.family_id,
    tierId: (l.inputs?.tierId as string) ?? null,
    description: l.description,
    qty: Number(l.qty ?? 0),
    unit: l.unit ?? "sqm",
    included: overrides.includeAll ? true : l.included,
    isRateOnly: l.is_rate_only,
    quotedRate: num(l.unit_price),
    inputs: l.inputs ?? {},
  }));

  const quoteInput: QuoteInput = {
    lines,
    siteProfile,
    programmeDaysRequested: num(quote.programme_days_requested),
    programmeHoursPerDay: num(quote.programme_hours_per_day),
    baseProgrammeCrewDays: num(quote.programme_base_crew_days),
    marginPct: num(quote.margin_pct) ?? undefined,
    overheadPct: num(quote.overhead_pct) ?? undefined,
  };

  return { quoteInput, ref: { settings, familiesById, tiersById, stagesById }, lines };
}
