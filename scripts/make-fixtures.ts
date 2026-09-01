// Snapshots product family data (with representative product costs) into
// tests/fixtures/families.json so engine tests run without a database.
// Re-run after material prices change: npm run fixtures
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { data: settings, error: sErr } = await supabase.from("settings").select("*").single();
  if (sErr) throw new Error(sErr.message);

  const { data: families, error } = await supabase
    .from("product_families")
    .select(
      "id, name, brand, discipline, driver, pack_qty, pack_unit, coverage_value, coverage_unit, default_multiplier, waste_pct, coverage_confidence, manual_cost, manual_pack_qty, manual_pack_unit, representative_product_id"
    )
    .order("name");
  if (error) throw new Error(error.message);

  const repIds = (families ?? []).map((f) => f.representative_product_id).filter(Boolean);
  const costById = new Map<string, { books_cost: number | null; cost_flag: string }>();
  for (let i = 0; i < repIds.length; i += 200) {
    const { data } = await supabase
      .from("products")
      .select("id, books_cost, cost_flag")
      .in("id", repIds.slice(i, i + 200));
    for (const p of data ?? []) costById.set(p.id, p);
  }

  const out = {
    settings: {
      intercompanyFactor: Number(settings.intercompany_factor),
      vatRate: Number(settings.vat_rate),
      defaultMargin: Number(settings.default_margin),
      defaultOverhead: Number(settings.default_overhead),
      defaultWaste: Number(settings.default_waste),
      workingHoursPerDay: Number(settings.working_hours_per_day),
      workingDaysPerWeek: Number(settings.working_days_per_week),
      congestionLossPerExtraCrew: Number(settings.congestion_loss_per_extra_crew),
    },
    families: (families ?? []).map((f) => {
      const rep = f.representative_product_id ? costById.get(f.representative_product_id) : null;
      return {
        id: f.id,
        name: f.name,
        brand: f.brand,
        discipline: f.discipline,
        driver: f.driver,
        packQty: f.pack_qty === null ? null : Number(f.pack_qty),
        packUnit: f.pack_unit,
        booksCost: rep?.books_cost === null || rep?.books_cost === undefined ? null : Number(rep.books_cost),
        costFlag: rep?.cost_flag ?? "ok",
        manualCost: f.manual_cost === null ? null : Number(f.manual_cost),
        manualPackQty: f.manual_pack_qty === null ? null : Number(f.manual_pack_qty),
        manualPackUnit: f.manual_pack_unit,
        coverageValue: f.coverage_value === null ? null : Number(f.coverage_value),
        coverageUnit: f.coverage_unit,
        defaultMultiplier: f.default_multiplier === null ? null : Number(f.default_multiplier),
        wastePct: f.waste_pct === null ? null : Number(f.waste_pct),
        coverageConfidence: f.coverage_confidence,
      };
    }),
  };

  const path = join(process.cwd(), "tests", "fixtures", "families.json");
  writeFileSync(path, JSON.stringify(out, null, 1));
  console.log(`wrote ${out.families.length} families to tests/fixtures/families.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
