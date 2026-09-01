// Imports QT-000299 (Jumeirah Bay podium) from docs/quotes into the app:
// R1 as issued-then-revised (matching the PDF, total 286,125), R2 as the
// working draft from the mockup. Idempotent by quote number and revision.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function one<T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>, label: string): Promise<NonNullable<T>> {
  const { data, error } = await q;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (data === null || data === undefined) throw new Error(`${label}: not found`);
  return data;
}

async function idByName(table: string, name: string): Promise<string | null> {
  const { data } = await supabase.from(table).select("id").eq("name", name).maybeSingle();
  return data?.id ?? null;
}

async function stageIdLike(pattern: string): Promise<string | null> {
  const { data } = await supabase.from("stages").select("id, name").ilike("name", pattern).limit(1);
  return data?.[0]?.id ?? null;
}

async function main() {
  // Client and site
  let clientId = await idByName("clients", "Jumeirah Bay");
  if (!clientId) {
    const c = await one<{ id: string }>(
      supabase.from("clients").insert({ name: "Jumeirah Bay", type: "developer" }).select("id").single(),
      "client"
    );
    clientId = c.id as string;
  }
  const islandProfileId = await idByName("site_profiles", "Island / restricted");
  const { data: existingSite } = await supabase.from("sites").select("id").eq("name", "Jumeirah Bay Island").maybeSingle();
  let siteId = existingSite?.id ?? null;
  if (!siteId) {
    const s = await one<{ id: string }>(
      supabase
        .from("sites")
        .insert({
          name: "Jumeirah Bay Island",
          client_id: clientId,
          emirate: "Dubai",
          community: "Jumeirah Bay",
          is_island: true,
          site_profile_id: islandProfileId,
        })
        .select("id")
        .single(),
      "site"
    );
    siteId = s.id as string;
  }

  // Reference lookups
  const fam = async (name: string) => idByName("product_families", name);
  const tier = async (name: string) => idByName("labour_tiers", name);

  const keraflex = await fam("Mapei Keraflex Maxi S1 Zero Grey (25 kg)");
  const ultracolor = await fam("Mapei Ultracolor Plus (5 kg)");
  const mapesil = await fam("Mapei Mapesil AC (310 ml)");
  const kerapoxy = await fam("Mapei Kerapoxy (10 kg epoxy)");
  const topcem = await fam("Mapei Topcem (20 kg binder)");
  const mapetex = await fam("Mapei Mapetex Sel (25x1 m)");
  const purtop = await fam("Mapei Purtop 500 N (A+B drum)");
  const primerSn = await fam("Mapei Primer SN (epoxy primer)");
  const mapelasticSmart = await fam("Mapei Mapelastic Smart");
  const mapenet = await fam("Mapei Mapenet 150 (1x50 m)");
  const ultraplanEco = await fam("Mapei Ultraplan Eco 20 (23 kg)");
  const primerG = await fam("Mapei Primer G");

  const demolitionTier = await tier("Demolition");
  const heavyTier = await tier("Heavy application");
  const thinTier = await tier("Thin coating");
  const prepTier = await tier("Surface preparation");

  const stScreed = await stageIdLike("%screed%");
  const stMembrane = await stageIdLike("%membrane coat 1%");
  const stTile = await stageIdLike("%tile%install%");
  const stGrout = await stageIdLike("%grout%");
  const stPrep = await stageIdLike("%substrate preparation%");
  const stSurvey = await stageIdLike("%site survey%");

  type LineSeed = {
    sort: number;
    description: string;
    detail?: string;
    qty: number;
    unit: "sqm" | "lm" | "nos" | "lump";
    quoted: number;
    included?: boolean;
    stage_id?: string | null;
    family_id?: string | null;
    tier?: string | null;
    inputs?: Record<string, unknown>;
  };

  async function upsertQuote(revision: number, status: string, lines: LineSeed[], extras: Record<string, unknown> = {}) {
    const { data: existing } = await supabase
      .from("quotes")
      .select("id")
      .eq("number", "QT-000299")
      .eq("revision", revision)
      .maybeSingle();
    let quoteId = existing?.id ?? null;
    const quoteRow = {
      number: "QT-000299",
      revision,
      status,
      site_id: siteId,
      client_id: clientId,
      quote_date: "2026-08-22",
      valid_days: 15,
      ...extras,
    };
    if (quoteId) {
      await supabase.from("quotes").update(quoteRow).eq("id", quoteId);
      await supabase.from("quote_lines").delete().eq("quote_id", quoteId);
    } else {
      const q = await one<{ id: string }>(supabase.from("quotes").insert(quoteRow).select("id").single(), `quote R${revision}`);
      quoteId = q.id as string;
    }
    const rows = lines.map((l) => ({
      quote_id: quoteId,
      sort: l.sort,
      stage_id: l.stage_id ?? null,
      family_id: l.family_id ?? null,
      description: l.description,
      qty: l.qty,
      unit: l.unit,
      included: l.included ?? true,
      unit_price: l.quoted,
      line_total: l.included === false ? 0 : l.quoted * (l.unit === "lump" ? 1 : l.qty),
      inputs: { ...(l.inputs ?? {}), tierId: l.tier ?? null, detail: l.detail ?? null },
    }));
    const { error } = await supabase.from("quote_lines").insert(rows);
    if (error) throw new Error(`lines R${revision}: ${error.message}`);
    console.log(`QT-000299 R${revision} (${status}): ${rows.length} lines`);
  }

  // R1: exactly the issued PDF, 272,500 + VAT = 286,125
  await upsertQuote(1, "revised", [
    { sort: 1, description: "Demolition and surface preparation", detail: "350 sqm, lump sum on R1", qty: 1, unit: "lump", quoted: 30000, stage_id: stPrep, tier: demolitionTier },
    { sort: 2, description: "Application of screed with anti fracture membrane", qty: 350, unit: "sqm", quoted: 205, stage_id: stScreed, family_id: topcem, tier: heavyTier, inputs: { thicknessCm: 5, secondaryFamilyIds: [mapetex].filter(Boolean) } },
    { sort: 3, description: "Supply and application of waterproofing with Mapei system including membrane", qty: 350, unit: "sqm", quoted: 110, stage_id: stMembrane, family_id: mapelasticSmart, tier: thinTier, inputs: { secondaryFamilyIds: [mapenet].filter(Boolean) } },
    { sort: 4, description: "Application of tile installation with adhesive", qty: 350, unit: "sqm", quoted: 160, stage_id: stTile, family_id: keraflex, tier: heavyTier, inputs: { tileLengthMm: 1200, tileWidthMm: 600 } },
    { sort: 5, description: "Supply and application of grout and sealant", qty: 350, unit: "sqm", quoted: 55, stage_id: stGrout, family_id: ultracolor, tier: thinTier, inputs: { secondaryFamilyIds: [mapesil].filter(Boolean) } },
    { sort: 6, description: "Scaffolding provision charges", qty: 1, unit: "lump", quoted: 15000, stage_id: stSurvey },
    { sort: 7, description: "Garbage disposal and protection", qty: 1, unit: "lump", quoted: 42000, stage_id: stSurvey },
  ], { issued_at: "2026-08-22T12:00:00Z" });

  // R2: the working draft from the mockup
  await upsertQuote(2, "draft", [
    { sort: 1, description: "Demolition and surface preparation", detail: "Labour and machine, disposal by Sixty Newton", qty: 350, unit: "sqm", quoted: 85.7, stage_id: stPrep, tier: demolitionTier },
    { sort: 2, description: "Floor grinding", detail: "Not needed after demolition", qty: 350, unit: "sqm", quoted: 15, included: false, stage_id: stPrep, tier: prepTier },
    { sort: 3, description: "Garbage disposal and protection", detail: "Skips x 6, protection sheeting, island barge surcharge", qty: 1, unit: "lump", quoted: 42000, stage_id: stSurvey },
    { sort: 4, description: "Screed 5 cm with anti-fracture membrane", detail: "Topcem 2.5 kg/sqm/cm, Mapetex Sel, heavy application tier", qty: 350, unit: "sqm", quoted: 205, stage_id: stScreed, family_id: topcem, tier: heavyTier, inputs: { thicknessCm: 5, secondaryFamilyIds: [mapetex].filter(Boolean) } },
    { sort: 5, description: "Self-levelling 5 mm", detail: "Ultraplan Eco 20, Primer G", qty: 350, unit: "sqm", quoted: 55, included: false, stage_id: stScreed, family_id: ultraplanEco, tier: thinTier, inputs: { thicknessMm: 5, secondaryFamilyIds: [primerG].filter(Boolean) } },
    { sort: 6, description: "Purtop 500 N, 2 mm sprayed", detail: "1.05 kg/sqm/mm, 8% overspray, Primer SN", qty: 350, unit: "sqm", quoted: 95, stage_id: stMembrane, family_id: purtop, tier: thinTier, inputs: { coats: 2, secondaryFamilyIds: [primerSn].filter(Boolean) } },
    { sort: 7, description: "Mapelastic Smart system with Mapenet 150", detail: "R1 option, replaced by Purtop in R2", qty: 350, unit: "sqm", quoted: 110, included: false, stage_id: stMembrane, family_id: mapelasticSmart, tier: thinTier, inputs: { secondaryFamilyIds: [mapenet].filter(Boolean) } },
    { sort: 8, description: "Flood test 48 hr and IR", detail: "Included free in R1 notes", qty: 1, unit: "lump", quoted: 0, included: false, stage_id: stSurvey },
    { sort: 9, description: "Tile installation with adhesive, client tiles", detail: "Keraflex Maxi S1 back-buttered, clips, heavy tier, island premium", qty: 350, unit: "sqm", quoted: 160, stage_id: stTile, family_id: keraflex, tier: heavyTier, inputs: { tileLengthMm: 1200, tileWidthMm: 600 } },
    { sort: 10, description: "Grout and perimeter sealant", detail: "Ultracolor Plus at 60x120, 3 mm; Mapesil AC", qty: 350, unit: "sqm", quoted: 55, stage_id: stGrout, family_id: ultracolor, tier: thinTier, inputs: { secondaryFamilyIds: [mapesil].filter(Boolean) } },
    { sort: 11, description: "Epoxy grout upgrade", detail: "Kerapoxy 0.6 kg/sqm at 1.5 mm", qty: 350, unit: "sqm", quoted: 60, included: false, stage_id: stGrout, family_id: kerapoxy, tier: thinTier },
    { sort: 12, description: "Scaffolding provision", detail: "Hire 21 days, island delivery, erect and strike", qty: 1, unit: "lump", quoted: 15000, stage_id: stSurvey },
    { sort: 13, description: "Mobilisation and barge transport", detail: "4 trips at island rate; currently absorbed in labour multiplier", qty: 1, unit: "lump", quoted: 0, included: false, stage_id: stSurvey },
  ], {
    programme_days_requested: 15,
    programme_hours_per_day: 6,
    programme_base_crew_days: 30,
  });

  console.log("Import complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
