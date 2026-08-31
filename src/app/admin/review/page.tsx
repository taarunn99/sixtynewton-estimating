import { createClient } from "@/lib/supabase/server";
import { ReviewRow } from "./review-row";

export default async function ReviewQueuePage() {
  const supabase = await createClient();
  const [{ data: queue }, { data: families }] = await Promise.all([
    supabase
      .from("sync_review_queue")
      .select("id, books_item_id, item_name, reason, resolved")
      .eq("resolved", false)
      .order("item_name")
      .limit(500),
    supabase.from("product_families").select("id, name").order("name"),
  ]);

  const familyOptions = (families ?? []).map((f) => ({ value: f.id, label: f.name }));

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-semibold">Review queue</h1>
        <span className="text-sm text-neutral-500">{queue?.length ?? 0} unresolved items</span>
      </div>
      {(queue?.length ?? 0) === 0 ? (
        <p className="text-sm text-neutral-500">
          Nothing to review. Items land here when the nightly Books sync cannot parse a pack size
          or match a product family.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-3 py-2 font-normal">Books item</th>
                <th className="px-3 py-2 font-normal">Reason</th>
                <th className="px-3 py-2 font-normal">Assign family</th>
                <th className="px-3 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {(queue ?? []).map((item) => (
                <ReviewRow key={item.id} item={item} familyOptions={familyOptions} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
