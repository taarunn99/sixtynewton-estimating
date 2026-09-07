// Rate book data collector (UPDATE_FINAL_RATEBOOK_MAIL.md part 1). Pure over
// a Supabase client so both the npm script and the admin route share it.
// Every number comes through the same engine the workbench uses.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeLine,
  type EngineSettings,
  type FamilyRef,
  type HistoryPoint,
  type LineInput,
  type ReferenceData,
  type SiteProfileRef,
  type StageRef,
  type TierRef,
} from "../engine";

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

export interface RateBookRow {
  discipline: string;
  stage: string;
  family: string | null;
  brand: string | null;
  repItem: string | null;
  pack: string | null;
  snCostPerPack: number | null;
  snCostPerUnit: number | null;
  coverage: string;
  defaults: string;
  source: string;
  confidence: string;
  materialPerUnit: number;
  materialDerivation: string;
  labourHistory: { median: number; count: number; quotes: { quoteNumber: string; rate: number; date: string }[] } | null;
  labourEngine: number;
  labourLeads: "history" | "engine";
  supplyRate: number;
  applicationOnlyRate: number;
  unit: string;
  evidence: { quoteNumber: string; rate: number; date: string; client: string }[];
  review: boolean;
  historyPoints: number;
  thicknessSweep: { label: string; material: number; supply: number }[] | null;
}

export interface RateBookData {
  generated: string;
  syncNote: string;
  settings: {
    intercompany: number;
    overheadPct: number;
    marginPct: number;
    vatPct: number;
  };
  rows: RateBookRow[];
  tilingLadder: { size: string; floor: number; wall: number }[];
  coverage: { stage: string; discipline: string; points: number; median: number | null }[];
  confidential: string[];
}

export async function collectRateBook(supabase: SupabaseClient): Promise<RateBookData> {
  const [{ data: settingsRow }, { data: famRows }, { data: tierRows }, { data: stageRows }, { data: appRates }, { data: anchorRows }, { data: importedRates }, { data: issuedLines }, { data: labourRef }, { data: lastSync }] =
    await Promise.all([
      supabase.from("settings").select("*").single(),
      supabase.from("product_families").select("*"),
      supabase.from("labour_tiers").select("*"),
      supabase.from("stages").select("*").order("sort_order"),
      supabase.from("application_rates").select("*"),
      supabase.from("tile_labour_anchors").select("tile_area_sqm, labour_per_sqm").order("tile_area_sqm"),
      supabase
        .from("imported_quotes")
        .select("stage_id, family_id, rate, unit, quote_number, quote_date_text, client_site, notes")
        .not("rate", "is", null),
      supabase
        .from("quote_lines")
        .select("stage_id, family_id, unit, unit_price, inputs, quotes!inner(status, number, quote_date)")
        .in("quotes.status", ["issued", "revised", "won"])
        .not("stage_id", "is", null),
      supabase.from("labour_reference").select("item, detail").eq("confidential", true),
      supabase.from("products").select("updated_at").order("updated_at", { ascending: false }).limit(1),
    ]);

  const repIds = (famRows ?? []).map((f) => f.representative_product_id).filter(Boolean);
  const costById = new Map<string, { books_cost: number | null }>();
  for (let i = 0; i < repIds.length; i += 400) {
    const { data } = await supabase
      .from("products")
      .select("id, books_cost")
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
    tilingWallUplift: num(settingsRow!.tiling_wall_uplift) ?? undefined,
  };

  const familiesById = new Map<string, FamilyRef>(
    (famRows ?? []).map((f) => [
      f.id,
      {
        id: f.id,
        name: f.name,
        driver: f.driver,
        packQty: num(f.pack_qty),
        packUnit: f.pack_unit,
        booksCost: num(costById.get(f.representative_product_id ?? "")?.books_cost),
        costFlag: "ok" as const,
        manualCost: num(f.manual_cost),
        manualPackQty: num(f.manual_pack_qty),
        manualPackUnit: f.manual_pack_unit,
        coverageValue: num(f.coverage_value),
        coverageUnit: f.coverage_unit,
        defaultMultiplier: num(f.default_multiplier),
        wastePct: num(f.waste_pct),
        coverageConfidence: f.coverage_confidence,
      },
    ])
  );
  const appRateById = new Map((appRates ?? []).map((r) => [r.id, r]));
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
    (stageRows ?? []).map((s) => {
      const ar = s.application_rate_id ? appRateById.get(s.application_rate_id) : null;
      return [
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
          applicationOnly: ar
            ? ar.anchor_small_area !== null
              ? {
                  tiling: {
                    smallArea: Number(ar.anchor_small_area),
                    smallRate: Number(ar.anchor_small_rate),
                    largeArea: Number(ar.anchor_large_area),
                    largeRate: Number(ar.anchor_large_rate),
                  },
                }
              : { rate: num(ar.rate) }
            : null,
        },
      ];
    })
  );

  const history: HistoryPoint[] = [
    ...(importedRates ?? []).map((r) => ({
      stageId: r.stage_id,
      familyId: r.family_id,
      unitPrice: Number(r.rate),
      quoteNumber: r.quote_number ?? "",
      quoteDate: r.quote_date_text ?? "",
      siteLabel: r.client_site ?? undefined,
      unit: r.unit ?? null,
      applicationOnly: /application only/i.test(r.notes ?? ""),
    })),
    ...(issuedLines ?? [])
      .filter((r) => r.unit_price !== null)
      .map((r) => {
        const q = r.quotes as unknown as { number: string; quote_date: string };
        return {
          stageId: r.stage_id as string,
          familyId: (r.family_id as string) ?? null,
          unitPrice: Number(r.unit_price),
          quoteNumber: q.number,
          quoteDate: q.quote_date ?? "",
          unit: (r.unit as string) ?? null,
          applicationOnly: !!(r.inputs as Record<string, unknown> | null)?.materialByClient,
        };
      }),
  ];

  const ref: ReferenceData = {
    settings,
    familiesById,
    tiersById,
    stagesById,
    tileLabourAnchors: (anchorRows ?? []).map((a) => ({
      areaSqm: Number(a.tile_area_sqm),
      labourPerSqm: Number(a.labour_per_sqm),
    })),
    labourHistory: [],
  };

  const site: SiteProfileRef = {
    allowedHoursPerDay: 8,
    allowedDaysPerWeek: 6,
    labourMultiplier: 1,
    mobilisationMultiplier: 1,
    transportPerTrip: 0,
    permitLump: 0,
    parkingPerDay: 0,
    noiseRestricted: false,
  };

  const defaultInputsFor = (family: FamilyRef | null, stage: StageRef) => {
    const inputs: LineInput["inputs"] = {};
    let words = "at defaults";
    if (stage.applicationOnly?.tiling) {
      inputs.tileWidthMm = 600;
      inputs.tileLengthMm = 1200;
      inputs.jointWidthMm = 3;
      inputs.tileThicknessMm = 10;
      words = "60x120 tile, 3 mm joint";
    } else if (family?.coverageUnit?.includes("/cm")) {
      inputs.thicknessCm = 5;
      words = "at 5 cm";
    } else if (family?.driver === "thickness") {
      inputs.thicknessMm = family.coverageUnit?.includes("/mm") ? 3 : 2;
      words = `at ${inputs.thicknessMm} mm, 1 coat`;
    } else if (family) {
      words = "1 coat at TDS coverage";
    }
    return { inputs, words };
  };

  const compute = (stage: StageRef, family: FamilyRef | null, tierId: string | null, inputs: LineInput["inputs"]) => {
    const line: LineInput = {
      id: "rb",
      stageId: stage.id,
      familyId: family?.id ?? null,
      tierId,
      description: stage.name,
      qty: 1,
      unit: "sqm",
      included: true,
      inputs,
    };
    return computeLine(line, { lines: [line], siteProfile: site }, ref, history);
  };

  const stageRowsSrc = (stageRows ?? []).filter((s) => s.discipline);
  const rows: RateBookRow[] = [];
  for (const s of stageRowsSrc) {
    const stage = stagesById.get(s.id)!;
    const family = s.default_family_id ? (familiesById.get(s.default_family_id) ?? null) : null;
    const famRow = (famRows ?? []).find((f) => f.id === s.default_family_id) ?? null;
    const { inputs, words } = defaultInputsFor(family, stage);
    const b = compute(stage, family, s.labour_tier_id, inputs);
    const appOnly = compute(stage, family, s.labour_tier_id, { ...inputs, materialByClient: true });

    const snPerPack =
      family?.booksCost != null ? family.booksCost * settings.intercompanyFactor : (family?.manualCost ?? null);
    const perUnit =
      snPerPack !== null && family?.packQty ? snPerPack / family.packQty : null;

    const overheadPct = Math.round(settings.defaultOverhead * 100);
    const stageHistoryPoints = history.filter((h) => h.stageId === stage.id).length;

    let thicknessSweep: RateBookRow["thicknessSweep"] = null;
    if (family?.driver === "thickness" && stage.discipline === "SL & screed") {
      const isCm = !!family.coverageUnit?.includes("/cm");
      const points = isCm ? [5, 10, 15] : [3, 5, 10];
      thicknessSweep = points.map((t) => {
        const sw = compute(stage, family, s.labour_tier_id, isCm ? { thicknessCm: t } : { thicknessMm: t });
        return { label: `${t} ${isCm ? "cm" : "mm"}`, material: sw.materialPerUnit, supply: sw.calculatedPerUnit };
      });
    }

    rows.push({
      discipline: stage.discipline,
      stage: stage.name,
      family: family?.name ?? null,
      brand: famRow?.brand ?? null,
      repItem: famRow?.representative_item_name ?? null,
      pack: family?.packQty ? `${family.packQty} ${family.packUnit ?? ""}` : null,
      snCostPerPack: snPerPack,
      snCostPerUnit: perUnit,
      coverage:
        family?.coverageValue != null
          ? `${family.coverageValue} ${family.coverageUnit ?? ""}, waste ${Math.round((family.wastePct ?? settings.defaultWaste) * 100)}%`
          : family
            ? "no coverage on file"
            : "labour only",
      defaults: words,
      source: famRow?.coverage_source ?? "",
      confidence: famRow?.coverage_confidence ?? "",
      materialPerUnit: b.materialPerUnit,
      materialDerivation:
        family && b.materialPerUnit > 0
          ? `coverage x pack cost x 1.09 + waste, + overhead ${overheadPct}% = our cost ${b.floorPerUnit}`
          : "no material",
      labourHistory: b.priceHistory
        ? { median: b.priceHistory.median, count: b.priceHistory.count, quotes: b.priceHistory.quotes.slice(0, 3) }
        : null,
      labourEngine: b.labourSuggestedPerUnit,
      labourLeads: b.priceSourceUsed,
      supplyRate: b.calculatedPerUnit,
      applicationOnlyRate: appOnly.calculatedPerUnit,
      unit: s.unit_of_sale ?? "sqm",
      evidence: (b.priceHistory?.quotes ?? []).slice(0, 3).map((q) => {
        const h = history.find((x) => x.quoteNumber === q.quoteNumber && x.unitPrice === q.rate);
        return { ...q, client: h?.siteLabel ?? "" };
      }),
      review: b.priceDiverges,
      historyPoints: stageHistoryPoints,
      thicknessSweep,
    });
  }

  // Tiling ladder at the named sizes, floor and wall
  const tilingStage = [...stagesById.values()].find(
    (s) => s.discipline === "Tiling & marble" && s.applicationOnly?.tiling
  );
  const tilingLadder: RateBookData["tilingLadder"] = [];
  if (tilingStage) {
    const sizes: [string, number, number][] = [
      ["30x30", 300, 300],
      ["60x60", 600, 600],
      ["60x120", 600, 1200],
      ["80x120", 800, 1200],
      ["120x120", 1200, 1200],
      ["240x240", 2400, 2400],
    ];
    const { tileLadderLabour } = await import("../engine");
    for (const [label, w, h] of sizes) {
      const floor = tileLadderLabour(ref.tileLabourAnchors, { tileWidthMm: w, tileLengthMm: h }, settings) ?? 0;
      const wall =
        tileLadderLabour(ref.tileLabourAnchors, { tileWidthMm: w, tileLengthMm: h, wallInstallation: true }, settings) ?? 0;
      tilingLadder.push({ size: label, floor: Math.round(floor * 10) / 10, wall: Math.round(wall * 10) / 10 });
    }
  }

  const median = (v: number[]) => {
    const s2 = [...v].sort((a, b) => a - b);
    const mid = Math.floor(s2.length / 2);
    return s2.length % 2 ? s2[mid] : (s2[mid - 1] + s2[mid]) / 2;
  };
  const coverage = stageRowsSrc.map((s) => {
    const pts = history.filter((h) => h.stageId === s.id).map((h) => h.unitPrice);
    return {
      stage: s.name,
      discipline: s.discipline,
      points: pts.length,
      median: pts.length ? Math.round(median(pts) * 10) / 10 : null,
    };
  });

  return {
    generated: new Date().toISOString().slice(0, 10),
    syncNote: `Zoho Books org 719219457, last product update ${((lastSync ?? [])[0]?.updated_at ?? "").slice(0, 10)}; 36 quotations imported; TDS defaults; references Tarun, Sep 2026`,
    settings: {
      intercompany: settings.intercompanyFactor,
      overheadPct: Math.round(settings.defaultOverhead * 100),
      marginPct: Math.round(settings.defaultMargin * 100),
      vatPct: Math.round(settings.vatRate * 100),
    },
    rows,
    tilingLadder,
    coverage,
    confidential: (labourRef ?? []).map((r) => `${r.item}: ${r.detail}`),
  };
}
