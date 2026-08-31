"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// Allowlist of what the admin screens may edit. Cost data writes stay server
// side behind the admin role; nothing here is reachable without it.
const EDITABLE: Record<string, Set<string>> = {
  products: new Set(["family_id", "pack_qty", "pack_unit", "cost_flag", "is_colour_variant", "active"]),
  product_families: new Set([
    "coverage_value", "coverage_unit", "default_multiplier", "waste_pct",
    "coverage_source", "coverage_confidence", "coverage_note",
    "manual_cost", "manual_pack_qty", "manual_pack_unit", "driver",
    "brand", "discipline", "stage_group",
  ]),
  stages: new Set([
    "default_family_id", "labour_tier_id", "default_productivity_sqm_per_crew_day",
    "productivity_confidence", "cure_days", "consumable_per_sqm", "notes", "unit_of_sale",
  ]),
  labour_tiers: new Set([
    "crew_size", "crew_day_cost", "derived_application_rate_per_sqm", "rate_confidence", "notes",
  ]),
  site_profiles: new Set([
    "allowed_hours_per_day", "allowed_days_per_week", "noise_restricted", "night_work_allowed",
    "mobilisation_multiplier", "transport_per_trip", "permit_lump", "parking_per_day",
    "labour_multiplier", "protection_required", "garbage_disposal_included",
  ]),
  settings: new Set([
    "intercompany_factor", "vat_rate", "default_margin", "default_overhead", "default_waste",
    "working_hours_per_day", "working_days_per_week", "congestion_loss_per_extra_crew",
    "assistant_model", "nudge_model", "assistant_token_budget", "company_address",
  ]),
  sync_review_queue: new Set(["resolved", "resolved_family_id"]),
};

export async function updateField(
  table: string,
  id: string,
  column: string,
  value: string | number | boolean | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const allowed = EDITABLE[table];
  if (!allowed || !allowed.has(column)) {
    return { error: `Editing ${table}.${column} is not allowed` };
  }
  const supabase = createServiceClient();
  const { error } = await supabase
    .from(table)
    .update({ [column]: value === "" ? null : value })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return {};
}

// Resolve a review queue item: assign the product to a family and mark done.
export async function resolveReviewItem(
  queueId: string,
  booksItemId: string,
  familyId: string | null
): Promise<{ error?: string }> {
  await requireAdmin();
  const supabase = createServiceClient();
  if (familyId) {
    const { error } = await supabase
      .from("products")
      .update({ family_id: familyId })
      .eq("books_item_id", booksItemId);
    if (error) return { error: error.message };
  }
  const { error } = await supabase
    .from("sync_review_queue")
    .update({ resolved: true, resolved_family_id: familyId })
    .eq("id", queueId);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return {};
}
