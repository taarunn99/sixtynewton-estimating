import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";

const CONFIDENCE_OPTIONS = [
  { value: "H", label: "H" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
];

export default async function LabourTiersPage() {
  const supabase = await createClient();
  const { data: tiers } = await supabase
    .from("labour_tiers")
    .select("id, name, crew_size, crew_day_cost, derived_application_rate_per_sqm, rate_confidence, notes")
    .order("name");

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold">Labour tiers</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          The price always comes from the application rate per sqm, back-solved from the 19
          analysed quotes at confidence M. Crew size and crew day cost are reference figures
          only: they appear in line breakdowns and programme estimates, never in a price.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Tier</th>
              <th className="px-3 py-2 text-right font-normal">Crew size</th>
              <th className="px-3 py-2 text-right font-normal">Crew day cost AED</th>
              <th className="px-3 py-2 text-right font-normal">Application AED per sqm</th>
              <th className="px-3 py-2 font-normal">Conf</th>
              <th className="px-3 py-2 font-normal">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(tiers ?? []).map((t) => (
              <tr key={t.id} className="border-b border-neutral-100">
                <td className="px-3 py-1.5">{t.name}</td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="labour_tiers" id={t.id} column="crew_size" value={t.crew_size} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="labour_tiers" id={t.id} column="crew_day_cost" value={t.crew_day_cost} kind="number" width="w-20" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="labour_tiers" id={t.id} column="derived_application_rate_per_sqm" value={t.derived_application_rate_per_sqm} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5">
                  <EditableCell table="labour_tiers" id={t.id} column="rate_confidence" value={t.rate_confidence} options={CONFIDENCE_OPTIONS} />
                </td>
                <td className="max-w-96 px-3 py-1.5">
                  <EditableCell table="labour_tiers" id={t.id} column="notes" value={t.notes} width="w-80" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
