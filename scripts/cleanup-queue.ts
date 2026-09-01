// One-off cleanup after the first Books sync:
// 1. Auto-link review queue items to families via the extended regex table
//    (Kerakoll, Weber, Awazel, Fosroc, Laticrete, Saveto lines).
// 2. Resolve tools and accessories brands (Dewalt, Profilpas, Bihui, Rubi,
//    Montolit, Vixtron) as not applicable.
// 3. Fold the 'NOT IN BOOKS' placeholder into manual costs on its families.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { matchFamily, isNotApplicableBrand } from "../src/lib/sync/families";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const { data: families, error: fErr } = await supabase
    .from("product_families")
    .select("id, name, representative_item_name");
  if (fErr) throw new Error(fErr.message);
  const famIdByName = new Map((families ?? []).map((f) => [f.name, f.id]));

  // Pull the whole unresolved queue with product brands
  const queue: { id: string; books_item_id: string; item_name: string }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sync_review_queue")
      .select("id, books_item_id, item_name")
      .eq("resolved", false)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    queue.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  console.log(`unresolved queue: ${queue.length}`);

  const brandById = new Map<string, string | null>();
  for (let i = 0; i < queue.length; i += 200) {
    const ids = queue.slice(i, i + 200).map((q) => q.books_item_id);
    const { data } = await supabase.from("products").select("books_item_id, brand").in("books_item_id", ids);
    for (const p of data ?? []) brandById.set(p.books_item_id, p.brand);
  }

  let linked = 0;
  let notApplicable = 0;
  const linkedNames: string[] = [];
  for (const q of queue) {
    const brand = brandById.get(q.books_item_id) ?? null;
    if (isNotApplicableBrand(q.item_name, brand)) {
      const { error } = await supabase
        .from("sync_review_queue")
        .update({ resolved: true, reason: "not applicable: tools and accessories brand" })
        .eq("id", q.id);
      if (error) throw new Error(error.message);
      notApplicable++;
      continue;
    }
    const famName = matchFamily(q.item_name);
    const famId = famName ? famIdByName.get(famName) : null;
    if (famId) {
      const { error: e1 } = await supabase
        .from("products")
        .update({ family_id: famId })
        .eq("books_item_id", q.books_item_id);
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await supabase
        .from("sync_review_queue")
        .update({ resolved: true, resolved_family_id: famId })
        .eq("id", q.id);
      if (e2) throw new Error(e2.message);
      linked++;
      if (linkedNames.length < 40) linkedNames.push(`${q.item_name} -> ${famName}`);
    }
  }
  console.log(`auto-linked: ${linked}`);
  for (const n of linkedNames) console.log(`  ${n}`);
  console.log(`not applicable: ${notApplicable}`);
  const { count: remaining } = await supabase
    .from("sync_review_queue")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false);
  console.log(`remaining in queue: ${remaining}`);

  // 3. NOT IN BOOKS fold
  const { data: fake } = await supabase
    .from("products")
    .select("id")
    .eq("name", "NOT IN BOOKS")
    .maybeSingle();
  const { data: nibFams, error: nibErr } = await supabase
    .from("product_families")
    .select("id, name")
    .eq("representative_item_name", "NOT IN BOOKS");
  if (nibErr) throw new Error(nibErr.message);

  // Manual costs known from the Bugatti quote (spec section 11)
  const BUGATTI: Record<string, { manual_cost: number; manual_pack_qty: number; manual_pack_unit: string; driver?: string }> = {
    "Kerakoll Microresina KK2 (incl. primer)": { manual_cost: 55, manual_pack_qty: 1, manual_pack_unit: "sqm", driver: "roll" },
    "Kerakoll Wallcrete Living KK72 (incl. primer)": { manual_cost: 53, manual_pack_qty: 1, manual_pack_unit: "sqm", driver: "roll" },
    "Kerakoll Absolute decorative paint": { manual_cost: 696, manual_pack_qty: 45, manual_pack_unit: "sqm", driver: "roll" },
    "Kerakoll Universal Wall Primer": { manual_cost: 145, manual_pack_qty: 62.5, manual_pack_unit: "sqm", driver: "roll" },
  };

  for (const f of nibFams ?? []) {
    const patch: Record<string, unknown> = {
      representative_product_id: null,
      representative_item_name: null,
    };
    const bugatti = BUGATTI[f.name];
    if (bugatti) Object.assign(patch, bugatti);
    const { error } = await supabase.from("product_families").update(patch).eq("id", f.id);
    if (error) throw new Error(`${f.name}: ${error.message}`);
    console.log(`folded to manual: ${f.name}${bugatti ? " (Bugatti cost applied)" : " (cost pending admin entry)"}`);
  }
  if (fake) {
    const { error } = await supabase.from("products").delete().eq("id", fake.id);
    if (error) console.log(`fake product not deleted (${error.message}), marking inactive`);
    else console.log("fake 'NOT IN BOOKS' product deleted");
    if (error) await supabase.from("products").update({ active: false }).eq("id", fake.id);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
