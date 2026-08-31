import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";
import { Badge } from "@/components/ui/badge";

const PAGE_SIZE = 100;

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; flag?: string; page?: string }>;
}) {
  const { q, flag, page } = await searchParams;
  const pageNum = Math.max(1, parseInt(page ?? "1", 10) || 1);
  const supabase = await createClient();

  let query = supabase
    .from("products_with_sn_cost")
    .select("id, name, sku, brand, pack_qty, pack_unit, books_cost, sn_cost, stock_on_hand, cost_flag, family_id, active, last_synced_at", { count: "exact" })
    .order("name")
    .range((pageNum - 1) * PAGE_SIZE, pageNum * PAGE_SIZE - 1);
  if (q) query = query.ilike("name", `%${q}%`);
  if (flag) query = query.eq("cost_flag", flag);

  const [{ data: products, count }, { data: families }] = await Promise.all([
    query,
    supabase.from("product_families").select("id, name").order("name"),
  ]);
  const familyOptions = (families ?? []).map((f) => ({ value: f.id, label: f.name }));
  const total = count ?? 0;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-semibold">Products</h1>
        <span className="text-sm text-neutral-500">
          {total} items, page {pageNum} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
        </span>
      </div>
      <form className="mb-3 flex gap-2">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name"
          className="w-64 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        />
        <select name="flag" defaultValue={flag ?? ""} className="rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All flags</option>
          <option value="ok">Ok</option>
          <option value="zero_cost">Zero cost</option>
          <option value="duplicate_suspect">Duplicate suspect</option>
        </select>
        <button className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm">Filter</button>
      </form>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Name</th>
              <th className="px-3 py-2 font-normal">Brand</th>
              <th className="px-3 py-2 text-right font-normal">Pack</th>
              <th className="px-3 py-2 text-right font-normal">Books cost</th>
              <th className="px-3 py-2 text-right font-normal">SN cost</th>
              <th className="px-3 py-2 text-right font-normal">Stock</th>
              <th className="px-3 py-2 font-normal">Flag</th>
              <th className="px-3 py-2 font-normal">Family</th>
            </tr>
          </thead>
          <tbody>
            {(products ?? []).map((p) => (
              <tr key={p.id} className="border-b border-neutral-100">
                <td className="px-3 py-1.5">{p.name}</td>
                <td className="px-3 py-1.5 text-neutral-500">{p.brand}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.pack_qty ?? ""} {p.pack_unit ?? ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.books_cost?.toLocaleString("en-US") ?? ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {p.sn_cost?.toLocaleString("en-US") ?? ""}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{p.stock_on_hand ?? ""}</td>
                <td className="px-3 py-1.5">
                  {p.cost_flag !== "ok" ? (
                    <Badge variant="outline" className="border-amber-600 text-amber-700">
                      {p.cost_flag === "zero_cost" ? "Zero cost" : "Duplicate suspect"}
                    </Badge>
                  ) : null}
                </td>
                <td className="max-w-56 px-3 py-1.5">
                  <EditableCell
                    table="products"
                    id={p.id}
                    column="family_id"
                    value={p.family_id}
                    options={familyOptions}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex gap-2 text-sm">
        {pageNum > 1 ? (
          <a className="underline" href={`?q=${q ?? ""}&flag=${flag ?? ""}&page=${pageNum - 1}`}>
            Previous
          </a>
        ) : null}
        {pageNum * PAGE_SIZE < total ? (
          <a className="underline" href={`?q=${q ?? ""}&flag=${flag ?? ""}&page=${pageNum + 1}`}>
            Next
          </a>
        ) : null}
      </div>
    </div>
  );
}
