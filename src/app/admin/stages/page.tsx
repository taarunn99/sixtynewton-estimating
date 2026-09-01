import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";

const CONFIDENCE_OPTIONS = [
  { value: "H", label: "H" },
  { value: "M", label: "M" },
  { value: "L", label: "L" },
];
const UNIT_OPTIONS = ["sqm", "lm", "nos", "lump"].map((v) => ({ value: v, label: v }));

export default async function StagesPage() {
  const supabase = await createClient();
  const [{ data: stages }, { data: families }, { data: tiers }] = await Promise.all([
    supabase
      .from("stages")
      .select("id, sort_order, discipline, name, driver, unit_of_sale, default_family_id, labour_tier_id, default_productivity_sqm_per_crew_day, productivity_confidence, cure_days, speed_weight, subsequent_coat_factor, notes")
      .order("sort_order"),
    supabase.from("product_families").select("id, name").order("name"),
    supabase.from("labour_tiers").select("id, name").order("name"),
  ]);
  const familyOptions = (families ?? []).map((f) => ({ value: f.id, label: f.name }));
  const tierOptions = (tiers ?? []).map((t) => ({ value: t.id, label: t.name }));

  let currentDiscipline = "";
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-semibold">Stage catalogue</h1>
        <span className="text-sm text-neutral-500">{stages?.length ?? 0} stages</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Stage</th>
              <th className="px-3 py-2 font-normal">Unit</th>
              <th className="px-3 py-2 font-normal">Default family</th>
              <th className="px-3 py-2 font-normal">Labour tier</th>
              <th className="px-3 py-2 text-right font-normal">Productivity</th>
              <th className="px-3 py-2 font-normal">Conf</th>
              <th className="px-3 py-2 text-right font-normal">Cure days</th>
              <th className="px-3 py-2 text-right font-normal">Speed weight</th>
              <th className="px-3 py-2 text-right font-normal">Next coat factor</th>
            </tr>
          </thead>
          <tbody>
            {(stages ?? []).map((s) => {
              const header =
                s.discipline !== currentDiscipline ? (
                  <tr key={`${s.id}-h`} className="border-b border-neutral-200 bg-neutral-50">
                    <td colSpan={9} className="px-3 py-1.5 font-serif text-sm">
                      {s.discipline}
                    </td>
                  </tr>
                ) : null;
              currentDiscipline = s.discipline;
              return (
                <>
                  {header}
                  <tr key={s.id} className="border-b border-neutral-100">
                    <td className="px-3 py-1.5">{s.name}</td>
                    <td className="px-3 py-1.5">
                      <EditableCell table="stages" id={s.id} column="unit_of_sale" value={s.unit_of_sale} options={UNIT_OPTIONS} />
                    </td>
                    <td className="max-w-64 px-3 py-1.5">
                      <EditableCell table="stages" id={s.id} column="default_family_id" value={s.default_family_id} options={familyOptions} />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell table="stages" id={s.id} column="labour_tier_id" value={s.labour_tier_id} options={tierOptions} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <EditableCell table="stages" id={s.id} column="default_productivity_sqm_per_crew_day" value={s.default_productivity_sqm_per_crew_day} kind="number" width="w-16" />
                    </td>
                    <td className="px-3 py-1.5">
                      <EditableCell table="stages" id={s.id} column="productivity_confidence" value={s.productivity_confidence} options={CONFIDENCE_OPTIONS} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <EditableCell table="stages" id={s.id} column="cure_days" value={s.cure_days} kind="number" width="w-14" />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <EditableCell table="stages" id={s.id} column="speed_weight" value={s.speed_weight} kind="number" width="w-14" />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <EditableCell table="stages" id={s.id} column="subsequent_coat_factor" value={s.subsequent_coat_factor} kind="number" width="w-14" />
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
