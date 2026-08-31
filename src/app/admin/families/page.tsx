import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";

const SOURCE_OPTIONS = [
  { value: "tds", label: "tds" },
  { value: "quote", label: "quote" },
  { value: "manual", label: "manual" },
];
const CONFIDENCE_OPTIONS = [
  { value: "H", label: "H" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
];
const DRIVER_OPTIONS = [
  "coverage", "thickness", "roll", "board", "linear", "each", "bought_in", "labour_only",
].map((v) => ({ value: v, label: v }));

export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const supabase = await createClient();
  let query = supabase
    .from("product_families")
    .select("id, name, discipline, stage_group, driver, coverage_value, coverage_unit, default_multiplier, waste_pct, coverage_source, coverage_confidence, coverage_note, manual_cost")
    .order("discipline")
    .order("name")
    .limit(300);
  if (q) query = query.ilike("name", `%${q}%`);
  const { data: families } = await query;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-semibold">Product families</h1>
        <span className="text-sm text-neutral-500">
          Coverage fields edit inline. Low confidence shows amber.
        </span>
      </div>
      <form className="mb-3">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name"
          className="w-64 rounded border border-neutral-300 bg-white px-3 py-1.5 text-sm"
        />
      </form>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Family</th>
              <th className="px-3 py-2 font-normal">Discipline</th>
              <th className="px-3 py-2 font-normal">Driver</th>
              <th className="px-3 py-2 text-right font-normal">Coverage</th>
              <th className="px-3 py-2 font-normal">Unit</th>
              <th className="px-3 py-2 text-right font-normal">Multiplier</th>
              <th className="px-3 py-2 text-right font-normal">Waste</th>
              <th className="px-3 py-2 font-normal">Source</th>
              <th className="px-3 py-2 font-normal">Conf</th>
              <th className="px-3 py-2 font-normal">Note</th>
            </tr>
          </thead>
          <tbody>
            {(families ?? []).map((f) => (
              <tr
                key={f.id}
                className={`border-b border-neutral-100 ${f.coverage_confidence === "L" ? "bg-amber-50" : ""}`}
              >
                <td className="px-3 py-1.5">{f.name}</td>
                <td className="px-3 py-1.5 text-neutral-500">{f.discipline}</td>
                <td className="px-3 py-1.5">
                  <EditableCell table="product_families" id={f.id} column="driver" value={f.driver} options={DRIVER_OPTIONS} />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="product_families" id={f.id} column="coverage_value" value={f.coverage_value} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5">
                  <EditableCell table="product_families" id={f.id} column="coverage_unit" value={f.coverage_unit} width="w-28" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="product_families" id={f.id} column="default_multiplier" value={f.default_multiplier} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="product_families" id={f.id} column="waste_pct" value={f.waste_pct} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5">
                  <EditableCell table="product_families" id={f.id} column="coverage_source" value={f.coverage_source} options={SOURCE_OPTIONS} />
                </td>
                <td className="px-3 py-1.5">
                  <EditableCell table="product_families" id={f.id} column="coverage_confidence" value={f.coverage_confidence} options={CONFIDENCE_OPTIONS} />
                </td>
                <td className="max-w-72 px-3 py-1.5">
                  <EditableCell table="product_families" id={f.id} column="coverage_note" value={f.coverage_note} width="w-64" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
