import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";

const CONFIDENCE_OPTIONS = [
  { value: "H", label: "H" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
];

export default async function ApplicationRatesPage() {
  const supabase = await createClient();
  const { data: rates } = await supabase
    .from("application_rates")
    .select("id, slug, name, rate, anchor_small_area, anchor_small_rate, anchor_large_area, anchor_large_rate, source, confidence")
    .order("sort");

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold">Application-only rates</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          List prices when the client supplies the material. The suggested price is the rate times
          the site labour multiplier; list prices already carry margin. Tiling interpolates on tile
          area between the two anchors. Stages without a rate fall back to their labour tier.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Rate</th>
              <th className="px-3 py-2 text-right font-normal">AED per sqm</th>
              <th className="px-3 py-2 text-right font-normal">Small anchor sqm, rate</th>
              <th className="px-3 py-2 text-right font-normal">Large anchor sqm, rate</th>
              <th className="px-3 py-2 font-normal">Source</th>
              <th className="px-3 py-2 font-normal">Conf</th>
            </tr>
          </thead>
          <tbody>
            {(rates ?? []).map((r) => (
              <tr key={r.id} className="border-b border-neutral-100">
                <td className="px-3 py-1.5">{r.name}</td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="application_rates" id={r.id} column="rate" value={r.rate} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  {r.anchor_small_area !== null ? (
                    <span className="flex justify-end gap-1">
                      <EditableCell table="application_rates" id={r.id} column="anchor_small_area" value={r.anchor_small_area} kind="number" width="w-14" />
                      <EditableCell table="application_rates" id={r.id} column="anchor_small_rate" value={r.anchor_small_rate} kind="number" width="w-14" />
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-right">
                  {r.anchor_large_area !== null ? (
                    <span className="flex justify-end gap-1">
                      <EditableCell table="application_rates" id={r.id} column="anchor_large_area" value={r.anchor_large_area} kind="number" width="w-14" />
                      <EditableCell table="application_rates" id={r.id} column="anchor_large_rate" value={r.anchor_large_rate} kind="number" width="w-14" />
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-xs text-neutral-500">{r.source}</td>
                <td className="px-3 py-1.5">
                  <EditableCell table="application_rates" id={r.id} column="confidence" value={r.confidence} options={CONFIDENCE_OPTIONS} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
