"use server";

import { revalidatePath } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

// Ledger edits: quantity, quoted rate, include or exclude, swap the product.
export async function updateLine(
  lineId: string,
  patch: { qty?: number; quoted?: number | null; included?: boolean; familyId?: string | null }
): Promise<{ error?: string }> {
  await getProfile();
  const supabase = createServiceClient();
  const { data: line } = await supabase
    .from("quote_lines")
    .select("id, quote_id, unit, quotes(status)")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Line not found" };
  const status = (line.quotes as { status?: string } | null)?.status;
  if (status && !["draft"].includes(status)) {
    return { error: "Issued quotes are immutable. Create a new revision." };
  }
  const row: Record<string, unknown> = {};
  if (patch.qty !== undefined) row.qty = patch.qty;
  if (patch.quoted !== undefined) row.unit_price = patch.quoted;
  if (patch.included !== undefined) row.included = patch.included;
  if (patch.familyId !== undefined) row.family_id = patch.familyId;
  const { error } = await supabase.from("quote_lines").update(row).eq("id", lineId);
  if (error) return { error: error.message };
  revalidatePath(`/quotes/${line.quote_id}`);
  return {};
}

// Add a line from the stage catalogue. Pulls the stage's default family and
// labour tier so the line prices immediately.
export async function addStageLine(
  quoteId: string,
  stageId: string,
  qty: number
): Promise<{ error?: string }> {
  await getProfile();
  const supabase = createServiceClient();
  const { data: quote } = await supabase.from("quotes").select("status").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Quote not found" };
  if (quote.status !== "draft") return { error: "Issued quotes are immutable. Create a new revision." };

  const { data: stage } = await supabase
    .from("stages")
    .select("id, name, discipline, unit_of_sale, default_family_id, labour_tier_id")
    .eq("id", stageId)
    .maybeSingle();
  if (!stage) return { error: "Stage not found" };

  const { data: last } = await supabase
    .from("quote_lines")
    .select("sort")
    .eq("quote_id", quoteId)
    .order("sort", { ascending: false })
    .limit(1);
  const sort = (last?.[0]?.sort ?? 0) + 1;

  const { error } = await supabase.from("quote_lines").insert({
    quote_id: quoteId,
    sort,
    stage_id: stage.id,
    family_id: stage.default_family_id,
    description: stage.name,
    qty,
    unit: stage.unit_of_sale ?? "sqm",
    included: true,
    unit_price: null,
    inputs: { tierId: stage.labour_tier_id },
  });
  if (error) return { error: error.message };
  revalidatePath(`/quotes/${quoteId}`);
  return {};
}

export async function removeLine(lineId: string): Promise<{ error?: string }> {
  await getProfile();
  const supabase = createServiceClient();
  const { data: line } = await supabase
    .from("quote_lines")
    .select("quote_id, quotes(status)")
    .eq("id", lineId)
    .maybeSingle();
  if (!line) return { error: "Line not found" };
  if ((line.quotes as { status?: string } | null)?.status !== "draft") {
    return { error: "Issued quotes are immutable." };
  }
  const { error } = await supabase.from("quote_lines").delete().eq("id", lineId);
  if (error) return { error: error.message };
  revalidatePath(`/quotes/${line.quote_id}`);
  return {};
}

// Variables panel edits.
export async function updateQuoteVariables(
  quoteId: string,
  patch: {
    programme_days_requested?: number | null;
    programme_hours_per_day?: number | null;
    programme_base_crew_days?: number | null;
    margin_pct?: number | null;
  }
): Promise<{ error?: string }> {
  await getProfile();
  const supabase = createServiceClient();
  const { data: quote } = await supabase.from("quotes").select("status").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Quote not found" };
  if (quote.status !== "draft") {
    return { error: "Issued quotes are immutable. Create a new revision." };
  }
  const { error } = await supabase.from("quotes").update(patch).eq("id", quoteId);
  if (error) return { error: error.message };
  revalidatePath(`/quotes/${quoteId}`);
  return {};
}
