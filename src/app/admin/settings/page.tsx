import { createClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";

const FIELDS: { column: string; label: string; kind: "text" | "number"; hint?: string }[] = [
  { column: "intercompany_factor", label: "Intercompany factor", kind: "number", hint: "Sixty Newton cost = Books cost times this" },
  { column: "vat_rate", label: "VAT rate", kind: "number", hint: "Always exclusive" },
  { column: "default_margin", label: "Default margin", kind: "number" },
  { column: "default_overhead", label: "Default overhead", kind: "number", hint: "Supervision and vehicles, no rent" },
  { column: "default_waste", label: "Default waste", kind: "number" },
  { column: "working_hours_per_day", label: "Working hours per day", kind: "number" },
  { column: "working_days_per_week", label: "Working days per week", kind: "number" },
  { column: "congestion_loss_per_extra_crew", label: "Congestion loss per extra crew", kind: "number" },
  { column: "baseline_productivity_sqm_per_crew_day", label: "Baseline productivity sqm per crew-day", kind: "number", hint: "Programme estimates only, scaled by stage speed weight" },
  { column: "upper_floor_factor", label: "Upper floor or roof factor", kind: "number", hint: "On calculated price of affected lines, at most 1.20" },
  { column: "logistics_pickup_cost", label: "Logistics pickup cost AED", kind: "number", hint: "Suggested when material is under 1 ton" },
  { column: "logistics_truck_cost", label: "Logistics truck cost AED", kind: "number" },
  { column: "logistics_truck_capacity_tons", label: "Truck capacity tons", kind: "number" },
  { column: "logistics_barge_per_ton", label: "Barge AED per ton", kind: "number", hint: "Island sites, source Al Maya Island 2026" },
  { column: "assistant_model", label: "Assistant model", kind: "text" },
  { column: "nudge_model", label: "Nudge model", kind: "text" },
  { column: "assistant_token_budget", label: "Assistant token budget per quote", kind: "number" },
  { column: "company_address", label: "Company address", kind: "text" },
];

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from("settings").select("*").single();
  if (!settings) return <p className="text-sm text-red-700">Settings row missing.</p>;

  return (
    <div>
      <h1 className="mb-4 font-serif text-xl font-semibold">Settings</h1>
      <div className="max-w-2xl rounded-lg border border-neutral-300 bg-white">
        {FIELDS.map((f) => (
          <div key={f.column} className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5 last:border-b-0">
            <div>
              <div className="text-sm">{f.label}</div>
              {f.hint ? <div className="text-xs text-neutral-500">{f.hint}</div> : null}
            </div>
            <EditableCell
              table="settings"
              id={settings.id}
              column={f.column}
              value={settings[f.column]}
              kind={f.kind}
              width={f.column === "company_address" || f.column.endsWith("model") ? "w-80" : "w-24"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
