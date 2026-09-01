// Runs the Books sync directly, using the same modules as the cron route.
// For bootstrap and manual re-runs: npm run sync
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { getAccessToken, iterateActiveItems } from "../src/lib/sync/zoho";
import { parsePack, normaliseName } from "../src/lib/sync/parse";
import { matchFamily } from "../src/lib/sync/families";

config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function main() {
  const startedAt = new Date().toISOString();
  const accessToken = await getAccessToken();
  console.log("Zoho token ok");

  const { data: families, error: famErr } = await supabase
    .from("product_families")
    .select("id, name, representative_item_name");
  if (famErr) throw new Error(famErr.message);
  const familyIdByItemName = new Map<string, string>();
  const familyIdByFamilyName = new Map<string, string>();
  for (const f of families ?? []) {
    familyIdByFamilyName.set(f.name, f.id);
    if (f.representative_item_name) familyIdByItemName.set(f.representative_item_name, f.id);
  }

  const { data: placeholders } = await supabase
    .from("products")
    .select("id, name")
    .is("books_item_id", null);
  const placeholderIdByName = new Map((placeholders ?? []).map((p) => [p.name, p.id]));

  let upserted = 0;
  let unparsed = 0;
  let linked = 0;
  let adopted = 0;
  let page = 0;
  const allSeen: { id: string; norm: string; cost: number | null }[] = [];

  for await (const items of iterateActiveItems(accessToken)) {
    page++;
    const records = items.map((item) => {
      const pack = parsePack(item.name);
      const famName = matchFamily(item.name);
      const familyId =
        familyIdByItemName.get(item.name) ??
        (famName ? (familyIdByFamilyName.get(famName) ?? null) : null);
      if (familyId) linked++;
      if (!pack) unparsed++;
      return {
        adoptId: placeholderIdByName.get(item.name) ?? null,
        row: {
          books_item_id: item.item_id,
          name: item.name,
          sku: item.sku ?? null,
          brand: item.brand ?? null,
          unit_raw: item.unit ?? null,
          pack_qty: pack?.pack_qty ?? null,
          pack_unit: pack?.pack_unit ?? null,
          books_cost: item.purchase_rate ?? null,
          books_sell: item.rate ?? null,
          stock_on_hand: item.stock_on_hand ?? null,
          family_id: familyId,
          active: true,
          cost_flag: (item.purchase_rate ?? 0) <= 1 ? ("zero_cost" as const) : ("ok" as const),
          last_synced_at: startedAt,
        },
        queue: !familyId
          ? {
              books_item_id: item.item_id,
              item_name: item.name,
              reason: pack ? "no family match" : "no pack parse and no family match",
            }
          : null,
      };
    });

    for (const r of records.filter((r) => r.adoptId)) {
      const { error } = await supabase.from("products").update(r.row).eq("id", r.adoptId!);
      if (error) throw new Error(`adopt ${r.row.name}: ${error.message}`);
      adopted++;
    }
    const fresh = records.filter((r) => !r.adoptId).map((r) => r.row);
    if (fresh.length) {
      const { error } = await supabase
        .from("products")
        .upsert(fresh, { onConflict: "books_item_id" });
      if (error) throw new Error(`upsert page ${page}: ${error.message}`);
    }
    upserted += records.length;

    const queueRows = records.map((r) => r.queue).filter(Boolean);
    if (queueRows.length) {
      const { error } = await supabase
        .from("sync_review_queue")
        .upsert(queueRows as object[], { onConflict: "books_item_id", ignoreDuplicates: true });
      if (error) throw new Error(`queue page ${page}: ${error.message}`);
    }

    for (const r of records) {
      allSeen.push({ id: r.row.books_item_id, norm: normaliseName(r.row.name), cost: r.row.books_cost });
    }
    console.log(`page ${page}: ${records.length} items (total ${upserted})`);
  }

  const byNorm = new Map<string, { id: string; cost: number }[]>();
  for (const s of allSeen) {
    if (s.cost === null || s.cost <= 1) continue;
    if (!byNorm.has(s.norm)) byNorm.set(s.norm, []);
    byNorm.get(s.norm)!.push({ id: s.id, cost: s.cost });
  }
  const duplicateIds: string[] = [];
  const duplicateGroups: string[] = [];
  for (const [norm, entries] of byNorm) {
    if (entries.length < 2) continue;
    const costs = entries.map((e) => e.cost);
    if (Math.min(...costs) > 0 && Math.max(...costs) / Math.min(...costs) > 5) {
      duplicateIds.push(...entries.map((e) => e.id));
      duplicateGroups.push(`${norm} (${costs.sort((a, b) => a - b).join(" vs ")})`);
    }
  }
  for (let i = 0; i < duplicateIds.length; i += 100) {
    const { error } = await supabase
      .from("products")
      .update({ cost_flag: "duplicate_suspect" })
      .in("books_item_id", duplicateIds.slice(i, i + 100));
    if (error) throw new Error(`duplicate flags: ${error.message}`);
  }

  const { error: deactErr } = await supabase
    .from("products")
    .update({ active: false })
    .not("books_item_id", "is", null)
    .lt("last_synced_at", startedAt);
  if (deactErr) throw new Error(deactErr.message);

  const { count: queueCount } = await supabase
    .from("sync_review_queue")
    .select("id", { count: "exact", head: true })
    .eq("resolved", false);

  console.log("\nSync complete.");
  console.log(`items synced: ${upserted}`);
  console.log(`placeholders adopted: ${adopted}`);
  console.log(`linked to families: ${linked}`);
  console.log(`pack unparsed: ${unparsed}`);
  console.log(`review queue (unresolved): ${queueCount}`);
  console.log(`duplicate suspect groups: ${duplicateGroups.length}`);
  for (const g of duplicateGroups.slice(0, 15)) console.log(`  ${g}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
