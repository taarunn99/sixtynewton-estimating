// Nightly Zoho Books item sync. Protected by CRON_SECRET.
// Pages through active items for the Lapiz Blue org, upserts products,
// parses pack qty and unit from the item name, sets cost flags, links
// families, and queues unmatched items for review.
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAccessToken, iterateActiveItems, type ZohoItem } from "@/lib/sync/zoho";
import { parsePack, normaliseName } from "@/lib/sync/parse";
import { matchFamily } from "@/lib/sync/families";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const startedAt = new Date().toISOString();

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "token error" },
      { status: 502 }
    );
  }

  // Family lookups: exact representative item name from the seed, then regex.
  const { data: families, error: famErr } = await supabase
    .from("product_families")
    .select("id, name, representative_item_name");
  if (famErr) return NextResponse.json({ error: famErr.message }, { status: 500 });
  const familyIdByItemName = new Map<string, string>();
  const familyIdByFamilyName = new Map<string, string>();
  for (const f of families ?? []) {
    familyIdByFamilyName.set(f.name, f.id);
    if (f.representative_item_name) familyIdByItemName.set(f.representative_item_name, f.id);
  }

  // Placeholder products created by the seed (no books_item_id yet) are
  // adopted by exact name so the sync does not duplicate them.
  const { data: placeholders } = await supabase
    .from("products")
    .select("id, name")
    .is("books_item_id", null);
  const placeholderIdByName = new Map((placeholders ?? []).map((p) => [p.name, p.id]));

  let upserted = 0;
  let unparsed = 0;
  let linked = 0;
  const costByNormName = new Map<string, { cost: number; ids: string[] }[]>();
  const allSeen: { id: string; norm: string; cost: number | null }[] = [];

  try {
    for await (const items of iterateActiveItems(accessToken)) {
      const records = items.map((item: ZohoItem) => {
        const pack = parsePack(item.name);
        const familyId =
          familyIdByItemName.get(item.name) ??
          (matchFamily(item.name) ? familyIdByFamilyName.get(matchFamily(item.name)!) : null) ??
          null;
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
            cost_flag:
              (item.purchase_rate ?? 0) <= 1 ? ("zero_cost" as const) : ("ok" as const),
            last_synced_at: startedAt,
          },
          queue: !familyId && !pack
            ? { books_item_id: item.item_id, item_name: item.name, reason: "no pack parse and no family match" }
            : !familyId
              ? { books_item_id: item.item_id, item_name: item.name, reason: "no family match" }
              : null,
        };
      });

      const adoptions = records.filter((r) => r.adoptId);
      for (const r of adoptions) {
        await supabase.from("products").update(r.row).eq("id", r.adoptId!);
      }
      const fresh = records.filter((r) => !r.adoptId).map((r) => r.row);
      if (fresh.length) {
        const { error } = await supabase
          .from("products")
          .upsert(fresh, { onConflict: "books_item_id" });
        if (error) throw new Error(`products upsert: ${error.message}`);
      }
      upserted += records.length;

      const queueRows = records.map((r) => r.queue).filter(Boolean) as {
        books_item_id: string;
        item_name: string;
        reason: string;
      }[];
      if (queueRows.length) {
        await supabase
          .from("sync_review_queue")
          .upsert(queueRows, { onConflict: "books_item_id", ignoreDuplicates: true });
      }

      for (const r of records) {
        allSeen.push({
          id: r.row.books_item_id,
          norm: normaliseName(r.row.name),
          cost: r.row.books_cost,
        });
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "sync error", upserted },
      { status: 502 }
    );
  }

  // Duplicate suspects: same normalised name, active, costs differ by more than 5x.
  for (const s of allSeen) {
    if (s.cost === null || s.cost <= 1) continue;
    if (!costByNormName.has(s.norm)) costByNormName.set(s.norm, []);
    costByNormName.get(s.norm)!.push({ cost: s.cost, ids: [s.id] });
  }
  const duplicateIds: string[] = [];
  for (const [, entries] of costByNormName) {
    if (entries.length < 2) continue;
    const costs = entries.map((e) => e.cost);
    const min = Math.min(...costs);
    const max = Math.max(...costs);
    if (min > 0 && max / min > 5) {
      duplicateIds.push(...entries.flatMap((e) => e.ids));
    }
  }
  if (duplicateIds.length) {
    for (let i = 0; i < duplicateIds.length; i += 100) {
      await supabase
        .from("products")
        .update({ cost_flag: "duplicate_suspect" })
        .in("books_item_id", duplicateIds.slice(i, i + 100));
    }
  }

  // Items no longer active in Books
  const { error: deactErr } = await supabase
    .from("products")
    .update({ active: false })
    .not("books_item_id", "is", null)
    .lt("last_synced_at", startedAt);
  if (deactErr) {
    return NextResponse.json({ error: deactErr.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    upserted,
    family_linked: linked,
    pack_unparsed: unparsed,
    duplicate_suspects: duplicateIds.length,
    started_at: startedAt,
  });
}
