// Seeds reference data from docs/SixtyNewton_Stage_Catalogue_and_Coverage_Capture.xlsx.
// Idempotent: re-running updates rather than duplicates.
//   Stage Catalogue -> stages
//   Coverage (TDS defaults) -> product_families, plus placeholder products for
//     the representative Books items so material costs work before the first
//     Zoho sync (the sync adopts these rows by exact name match)
//   Observed Rates -> imported_quotes
// Also seeds labour tiers (spec section 8), site profiles and lump items (spec 3.1).
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";
import { config } from "dotenv";
import { join } from "node:path";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const WORKBOOK = join(
  process.cwd(),
  "docs",
  "SixtyNewton_Stage_Catalogue_and_Coverage_Capture.xlsx"
);

type Row = (string | number | null | undefined)[];

function sheetRows(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`Sheet not found: ${name}`);
  return XLSX.utils.sheet_to_json<Row>(ws, { header: 1, raw: true, defval: null });
}

const str = (v: Row[number]): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};
const num = (v: Row[number]): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

const UNIT_MAP: Record<string, string> = {
  sqm: "sqm",
  lm: "lm",
  nos: "nos",
  lump: "lump",
  each: "nos",
};
function mapUnit(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.toLowerCase().split(/[\s,/]+/)[0];
  return UNIT_MAP[first] ?? null;
}

const DRIVER_MAP: Record<string, string> = {
  coverage: "coverage",
  thickness: "thickness",
  roll: "roll",
  board: "board",
  linear: "linear",
  each: "each",
  "bought-in": "bought_in",
  bought_in: "bought_in",
};

const PACK_UNITS = new Set(["kg", "L", "sqm", "lm", "pcs"]);
function mapPackUnit(raw: string | null): string | null {
  if (!raw) return null;
  const v = raw.trim();
  if (PACK_UNITS.has(v)) return v;
  const lower = v.toLowerCase();
  if (lower === "l" || lower === "ltr" || lower === "litre") return "L";
  if (PACK_UNITS.has(lower)) return lower;
  return null;
}

function fail(step: string, error: { message: string } | null) {
  if (error) throw new Error(`${step}: ${error.message}`);
}

async function seedStages(wb: XLSX.WorkBook) {
  const rows = sheetRows(wb, "Stage Catalogue").slice(3);
  const records = rows
    .filter((r) => str(r[0]) !== null && str(r[2]) !== null)
    .map((r) => ({
      sort_order: num(r[0]),
      discipline: str(r[1])!,
      name: str(r[2])!,
      driver: str(r[3]),
      unit_of_sale: mapUnit(str(r[4])),
      unit_of_sale_raw: str(r[4]),
      material_formula_shape: str(r[5]),
      notes: str(r[6]),
      books_families_note: str(r[7]),
      observed_rate_note: str(r[8]),
    }));
  const { error } = await supabase
    .from("stages")
    .upsert(records, { onConflict: "discipline,name" });
  fail("stages", error);
  console.log(`stages: ${records.length} upserted`);
}

async function seedFamilies(wb: XLSX.WorkBook) {
  const rows = sheetRows(wb, "Coverage (TDS defaults)").slice(5);
  const data = rows.filter((r) => str(r[0]) !== null && str(r[4]) !== null);

  // Placeholder products for representative Books items, so costs exist
  // before the first Zoho sync. The sync adopts these rows by exact name.
  const seenItems = new Map<string, Record<string, unknown>>();
  for (const r of data) {
    const itemName = str(r[5]);
    if (!itemName || seenItems.has(itemName)) continue;
    seenItems.set(itemName, {
      name: itemName,
      sku: str(r[6]),
      brand: str(r[7]),
      pack_qty: num(r[9]),
      pack_unit: mapPackUnit(str(r[10])),
      books_cost: num(r[11]),
      stock_on_hand: num(r[21]),
      active: true,
    });
  }
  const { data: existingProducts, error: pErr } = await supabase
    .from("products")
    .select("id, name");
  fail("products read", pErr);
  const productIdByName = new Map<string, string>(
    (existingProducts ?? []).map((p) => [p.name as string, p.id as string])
  );
  for (const [name, record] of seenItems) {
    const existingId = productIdByName.get(name);
    if (existingId) {
      const { error } = await supabase.from("products").update(record).eq("id", existingId);
      fail(`product update ${name}`, error);
    } else {
      const { data: inserted, error } = await supabase
        .from("products")
        .insert(record)
        .select("id")
        .single();
      fail(`product insert ${name}`, error);
      productIdByName.set(name, inserted!.id as string);
    }
  }
  console.log(`products: ${seenItems.size} representative items upserted`);

  const families = data.map((r) => {
    const driverRaw = (str(r[3]) ?? "").toLowerCase();
    const itemName = str(r[5]);
    return {
      name: str(r[4])!,
      brand: str(r[7]),
      discipline: str(r[1]),
      stage_group: str(r[2]),
      driver: DRIVER_MAP[driverRaw] ?? "coverage",
      representative_product_id: itemName ? (productIdByName.get(itemName) ?? null) : null,
      representative_item_name: itemName,
      representative_sku: str(r[6]),
      variants_in_books: num(r[8]),
      pack_qty: num(r[9]),
      pack_unit: mapPackUnit(str(r[10])),
      coverage_unit: str(r[13]),
      coverage_value: num(r[14]),
      default_multiplier: num(r[15]),
      waste_pct: num(r[16]),
      coverage_note: str(r[17]),
      coverage_source: str(r[18]) ?? "manual",
      coverage_confidence: str(r[19]) ?? "M",
      // Families with no Books item are priced manually from the workbook cost
      manual_cost: itemName ? null : num(r[11]),
      manual_pack_qty: itemName ? null : num(r[9]),
      manual_pack_unit: itemName ? null : mapPackUnit(str(r[10])),
    };
  });
  // A family can appear under two disciplines with identical data
  // (Primer SN, Mapesil AC). Keep the first occurrence per name.
  const uniqueFamilies = [...new Map(families.map((f) => [f.name, f])).values()];
  const { error } = await supabase
    .from("product_families")
    .upsert(uniqueFamilies, { onConflict: "name" });
  fail("product_families", error);
  console.log(`product_families: ${uniqueFamilies.length} upserted (${families.length} workbook rows)`);

  // Default family per stage: first workbook family for that discipline and stage
  const { data: fams, error: fErr } = await supabase
    .from("product_families")
    .select("id, name, discipline, stage_group");
  fail("families read", fErr);
  const famByName = new Map((fams ?? []).map((f) => [f.name as string, f]));
  const firstFamilyForStage = new Map<string, string>();
  for (const f of families) {
    const key = `${f.discipline}|${f.stage_group}`;
    if (!firstFamilyForStage.has(key)) {
      const dbRow = famByName.get(f.name);
      if (dbRow) firstFamilyForStage.set(key, dbRow.id as string);
    }
  }
  const { data: stages, error: sErr } = await supabase
    .from("stages")
    .select("id, discipline, name, default_family_id");
  fail("stages read", sErr);
  // The Coverage tab's Stage column is a short group label, so fall back to a
  // prefix match within the same discipline. Disciplines are aliased where the
  // two tabs spell them differently.
  const DISC_ALIAS: Record<string, string> = {
    "Decorative concrete": "Design concrete",
    Microtopping: "Design concrete",
  };
  const aliased = (d: string | null) => DISC_ALIAS[d ?? ""] ?? d ?? "";
  const groupsByDiscipline = new Map<string, { group: string; famId: string }[]>();
  for (const [key, famId] of firstFamilyForStage) {
    const [disc, group] = key.split("|");
    const d = aliased(disc);
    if (!groupsByDiscipline.has(d)) groupsByDiscipline.set(d, []);
    groupsByDiscipline.get(d)!.push({ group, famId });
  }
  let linked = 0;
  for (const s of stages ?? []) {
    let famId = firstFamilyForStage.get(`${s.discipline}|${s.name}`);
    if (!famId) {
      const candidates = (groupsByDiscipline.get(aliased(s.discipline)) ?? [])
        .filter((c) => (s.name as string).toLowerCase().startsWith(c.group.toLowerCase()))
        .sort((a, b) => b.group.length - a.group.length);
      famId = candidates[0]?.famId;
    }
    if (famId && s.default_family_id !== famId) {
      const { error } = await supabase
        .from("stages")
        .update({ default_family_id: famId })
        .eq("id", s.id);
      fail("stage default family", error);
      linked++;
    }
  }
  console.log(`stages: ${linked} default families linked`);
}

async function seedObservedRates(wb: XLSX.WorkBook) {
  const rows = sheetRows(wb, "Observed Rates").slice(3);
  const records = rows
    .filter((r) => str(r[0]) !== null)
    .map((r) => {
      const dateText = str(r[5]);
      let quoteDate: string | null = null;
      if (dateText) {
        const parsed = new Date(dateText);
        if (!Number.isNaN(parsed.getTime()) && /\d{1,2}\s/.test(dateText)) {
          quoteDate = parsed.toISOString().slice(0, 10);
        }
      }
      return {
        stage_name: str(r[0])!,
        rate: num(r[1]),
        unit: str(r[2]),
        quote_number: str(r[3]),
        client_site: str(r[4]),
        quote_date_text: dateText,
        quote_date: quoteDate,
        notes: str(r[6]),
      };
    });
  const { error } = await supabase
    .from("imported_quotes")
    .upsert(records, { onConflict: "stage_name,quote_number,rate" });
  fail("imported_quotes", error);
  console.log(`imported_quotes: ${records.length} upserted`);
}

// Spec section 8: tier defaults back-solved from the 19 quotes, confidence M.
const LABOUR_TIERS = [
  { name: "Thin coating", derived_application_rate_per_sqm: 37.5, notes: "Grout, cementitious WP, SL skim, sealant per lm. Evidence: Kerapoxy 34 to 39, CM210 36.5, Ultraplan 37 to 40, PU45 34 per lm." },
  { name: "Heavy application", derived_application_rate_per_sqm: 75, notes: "Tiling, screed, multi-coat WP systems. Evidence: Keraflex tiling 74, Topcem screed 70 to 80, Mapelastic system 77." },
  { name: "Surface preparation", derived_application_rate_per_sqm: 15, notes: "Grinding. Evidence: QT-296, QT-298." },
  { name: "Demolition", derived_application_rate_per_sqm: 80, notes: "Evidence: QT-269, QT-299, range 75 to 86." },
  { name: "Roll membranes", derived_application_rate_per_sqm: 27, notes: "Torch applied. Evidence: Awazel 14, anti-root 40." },
  { name: "Skilled finishing", derived_application_rate_per_sqm: null, notes: "Decorative and microtopping work. No back-solved rate yet." },
  { name: "Machine operator", derived_application_rate_per_sqm: null, notes: "Spray rigs and grinders. No back-solved rate yet." },
] as const;

const SITE_PROFILES = [
  { name: "Standard Dubai commercial", allowed_hours_per_day: 8, allowed_days_per_week: 6, labour_multiplier: 1.0, noise_restricted: false, night_work_allowed: false, mobilisation_multiplier: 1.0, protection_required: false },
  { name: "Gated community villa", allowed_hours_per_day: 8, allowed_days_per_week: 6, labour_multiplier: 1.3, noise_restricted: true, night_work_allowed: false, mobilisation_multiplier: 1.0, protection_required: false },
  { name: "Island / restricted", allowed_hours_per_day: 6, allowed_days_per_week: 6, labour_multiplier: 2.0, noise_restricted: true, night_work_allowed: false, mobilisation_multiplier: 2.0, protection_required: false },
  { name: "Abu Dhabi", allowed_hours_per_day: 8, allowed_days_per_week: 6, labour_multiplier: 1.15, noise_restricted: false, night_work_allowed: false, mobilisation_multiplier: 1.0, protection_required: false },
  { name: "Occupied hotel", allowed_hours_per_day: 6, allowed_days_per_week: 7, labour_multiplier: 1.4, noise_restricted: true, night_work_allowed: true, mobilisation_multiplier: 1.0, protection_required: true },
] as const;

const LUMP_ITEMS = [
  { name: "Site survey", pricing_rule: "fixed" },
  { name: "NDT report", pricing_rule: "fixed" },
  { name: "Method statement", pricing_rule: "fixed" },
  { name: "Scaffolding provision", pricing_rule: "per_day" },
  { name: "Garbage disposal and protection", pricing_rule: "fixed" },
  { name: "Mobilisation", pricing_rule: "per_trip" },
  { name: "Permits and NOC", pricing_rule: "fixed" },
  { name: "Flood test", pricing_rule: "fixed" },
  { name: "Handover documentation", pricing_rule: "fixed" },
] as const;

async function seedDefaults() {
  const { error: e1 } = await supabase
    .from("labour_tiers")
    .upsert(LABOUR_TIERS.map((t) => ({ ...t, rate_confidence: "M" })), { onConflict: "name" });
  fail("labour_tiers", e1);
  const { error: e2 } = await supabase
    .from("site_profiles")
    .upsert([...SITE_PROFILES], { onConflict: "name" });
  fail("site_profiles", e2);
  const { error: e3 } = await supabase
    .from("lump_items")
    .upsert([...LUMP_ITEMS], { onConflict: "name" });
  fail("lump_items", e3);
  console.log(
    `defaults: ${LABOUR_TIERS.length} labour tiers, ${SITE_PROFILES.length} site profiles, ${LUMP_ITEMS.length} lump items`
  );
}

async function main() {
  const wb = XLSX.readFile(WORKBOOK);
  await seedStages(wb);
  await seedFamilies(wb);
  await seedObservedRates(wb);
  await seedDefaults();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
