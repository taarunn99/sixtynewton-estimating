import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";
import { ToggleCell } from "@/components/admin/toggle-cell";

export default async function SiteProfilesPage() {
  const supabase = await createClient();
  const { data: profiles } = await supabase
    .from("site_profiles")
    .select("*")
    .order("name");

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold">Site profiles</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Site conditions that change the whole quote: allowed hours, labour multiplier,
          mobilisation, permits and parking.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Profile</th>
              <th className="px-3 py-2 text-right font-normal">Hours per day</th>
              <th className="px-3 py-2 text-right font-normal">Days per week</th>
              <th className="px-3 py-2 text-right font-normal">Labour multiplier</th>
              <th className="px-3 py-2 text-right font-normal">Mobilisation multiplier</th>
              <th className="px-3 py-2 text-right font-normal">Transport per trip</th>
              <th className="px-3 py-2 text-right font-normal">Permit lump</th>
              <th className="px-3 py-2 text-right font-normal">Parking per day</th>
              <th className="px-3 py-2 font-normal">Noise restricted</th>
              <th className="px-3 py-2 font-normal">Night work</th>
              <th className="px-3 py-2 font-normal">Protection</th>
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-b border-neutral-100">
                <td className="px-3 py-1.5">{p.name}</td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="allowed_hours_per_day" value={p.allowed_hours_per_day} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="allowed_days_per_week" value={p.allowed_days_per_week} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="labour_multiplier" value={p.labour_multiplier} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="mobilisation_multiplier" value={p.mobilisation_multiplier} kind="number" width="w-14" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="transport_per_trip" value={p.transport_per_trip} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="permit_lump" value={p.permit_lump} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="site_profiles" id={p.id} column="parking_per_day" value={p.parking_per_day} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5">
                  <ToggleCell table="site_profiles" id={p.id} column="noise_restricted" value={p.noise_restricted} />
                </td>
                <td className="px-3 py-1.5">
                  <ToggleCell table="site_profiles" id={p.id} column="night_work_allowed" value={p.night_work_allowed} />
                </td>
                <td className="px-3 py-1.5">
                  <ToggleCell table="site_profiles" id={p.id} column="protection_required" value={p.protection_required} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
