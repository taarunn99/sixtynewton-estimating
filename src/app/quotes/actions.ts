"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { computeLedger } from "@/lib/engine-server";

// Ledger edits: quantity, quoted rate, include or exclude, swap the product.
export async function updateLine(
  lineId: string,
  patch: {
    qty?: number;
    quoted?: number | null;
    included?: boolean;
    familyId?: string | null;
    // Merged into the line's inputs jsonb (materialByClient, tile sizes, ...)
    inputs?: Record<string, unknown>;
  }
): Promise<{ error?: string }> {
  await getProfile();
  const supabase = createServiceClient();
  const { data: line } = await supabase
    .from("quote_lines")
    .select("id, quote_id, unit, inputs, quotes(status)")
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
  if (patch.inputs !== undefined) row.inputs = { ...(line.inputs ?? {}), ...patch.inputs };
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

// Issue flow, spec 4.6 and 9: drafts become issued and immutable. Lines
// quoted below the cost floor block the issue unless an admin gives a reason.
export async function issueQuote(
  quoteId: string,
  overrideReason?: string
): Promise<{ error?: string; needsOverride?: boolean }> {
  const profile = await getProfile();
  const supabase = createServiceClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("id, status, number, revision")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "Quote not found" };
  if (quote.status !== "draft") return { error: "Only drafts can be issued." };

  const ledger = await computeLedger(quoteId);
  if (!ledger) return { error: "Quote not found" };

  const belowFloor = ledger.lines.filter(
    (l) => l.included && l.nudges.some((n) => n.rule === "below_cost_floor")
  );
  if (belowFloor.length && !overrideReason) {
    return {
      needsOverride: true,
      error: `${belowFloor.length} line${belowFloor.length === 1 ? "" : "s"} below our cost: ${belowFloor
        .map((l) => l.description)
        .join(", ")}. An admin can issue with a reason.`,
    };
  }
  if (belowFloor.length && profile.role !== "admin") {
    return { error: "Only an admin can issue below our cost." };
  }

  const { error } = await supabase
    .from("quotes")
    .update({
      status: "issued",
      issued_at: new Date().toISOString(),
      totals: {
        totalQuoted: ledger.totals.totalQuoted,
        totalCalculated: ledger.totals.totalCalculated,
        totalFloor: ledger.totals.totalFloor,
        quotedSubtotal: ledger.totals.quotedSubtotal,
        issueOverrideReason: overrideReason ?? null,
        issuedBy: profile.id,
      },
    })
    .eq("id", quoteId);
  if (error) return { error: error.message };
  revalidatePath(`/quotes/${quoteId}`);
  return {};
}

// New revision: copy the quote and its lines to R+1 as a draft. The source
// stays untouched apart from issued becoming revised. Never overwrite.
export async function createRevision(quoteId: string): Promise<{ error?: string; newId?: string }> {
  await getProfile();
  const supabase = createServiceClient();
  const { data: quote } = await supabase.from("quotes").select("*").eq("id", quoteId).maybeSingle();
  if (!quote) return { error: "Quote not found" };
  if (quote.status === "draft") return { error: "This is already a draft. Edit it directly." };

  const { data: maxRev } = await supabase
    .from("quotes")
    .select("revision")
    .eq("number", quote.number)
    .order("revision", { ascending: false })
    .limit(1);
  const nextRevision = (maxRev?.[0]?.revision ?? quote.revision) + 1;

  const { id: _id, created_at: _c, updated_at: _u, ...rest } = quote;
  void _id;
  void _c;
  void _u;
  const { data: created, error } = await supabase
    .from("quotes")
    .insert({
      ...rest,
      revision: nextRevision,
      status: "draft",
      issued_at: null,
      totals: null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  const { data: lines } = await supabase.from("quote_lines").select("*").eq("quote_id", quoteId).order("sort");
  if (lines?.length) {
    const copies = lines.map((l) => {
      const { id: _lid, created_at: _lc, ...lineRest } = l;
      void _lid;
      void _lc;
      return { ...lineRest, quote_id: created.id };
    });
    const { error: e2 } = await supabase.from("quote_lines").insert(copies);
    if (e2) return { error: e2.message };
  }

  if (quote.status === "issued") {
    await supabase.from("quotes").update({ status: "revised" }).eq("id", quoteId);
  }
  revalidatePath(`/quotes/${created.id}`);
  return { newId: created.id };
}

// New quote: find or create the client and site, take the next number.
export async function createQuote(form: {
  clientName: string;
  siteName: string;
  siteProfileId: string;
  paymentTerms?: string;
}): Promise<{ error?: string } | never> {
  const profile = await getProfile();
  const supabase = createServiceClient();
  if (!form.clientName.trim() || !form.siteName.trim()) {
    return { error: "Client and site are required." };
  }

  let { data: client } = await supabase
    .from("clients")
    .select("id")
    .eq("name", form.clientName.trim())
    .maybeSingle();
  if (!client) {
    const { data, error } = await supabase
      .from("clients")
      .insert({ name: form.clientName.trim() })
      .select("id")
      .single();
    if (error) return { error: error.message };
    client = data;
  }

  let { data: site } = await supabase
    .from("sites")
    .select("id")
    .eq("name", form.siteName.trim())
    .eq("client_id", client.id)
    .maybeSingle();
  if (!site) {
    const { data, error } = await supabase
      .from("sites")
      .insert({
        name: form.siteName.trim(),
        client_id: client.id,
        site_profile_id: form.siteProfileId,
      })
      .select("id")
      .single();
    if (error) return { error: error.message };
    site = data;
  } else {
    await supabase.from("sites").update({ site_profile_id: form.siteProfileId }).eq("id", site.id);
  }

  const { data: numbers } = await supabase.from("quotes").select("number");
  const maxNum = (numbers ?? []).reduce((max, q) => {
    const n = parseInt(String(q.number).replace(/\D/g, ""), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  const number = `QT-${String(maxNum + 1).padStart(6, "0")}`;

  const { data: created, error } = await supabase
    .from("quotes")
    .insert({
      number,
      revision: 1,
      status: "draft",
      client_id: client.id,
      site_id: site.id,
      quote_date: new Date().toISOString().slice(0, 10),
      valid_days: 15,
      tax_mode: "exclusive",
      payment_terms:
        form.paymentTerms?.trim() || "50% advance, 40% at half completion, 10% on completion",
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };
  redirect(`/quotes/${created.id}`);
}

// Deletion, admin only, always behind a two-step confirm in the UI.
// Deleting a quote removes all its revisions, lines and assistant thread.
export async function deleteQuote(quoteId: string): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (profile.role !== "admin") return { error: "Only an admin can delete quotes." };
  const supabase = createServiceClient();
  const { data: quote } = await supabase
    .from("quotes")
    .select("number")
    .eq("id", quoteId)
    .maybeSingle();
  if (!quote) return { error: "Quote not found" };
  const { data: revisions } = await supabase.from("quotes").select("id").eq("number", quote.number);
  const ids = (revisions ?? []).map((r) => r.id);
  const { error } = await supabase.from("quotes").delete().in("id", ids);
  if (error) return { error: error.message };
  redirect("/quotes");
}

// Deleting a client removes the client, their sites, and every quote of theirs.
export async function deleteClient(clientId: string): Promise<{ error?: string }> {
  const profile = await getProfile();
  if (profile.role !== "admin") return { error: "Only an admin can delete clients." };
  const supabase = createServiceClient();
  const { error: qErr } = await supabase.from("quotes").delete().eq("client_id", clientId);
  if (qErr) return { error: qErr.message };
  const { error: sErr } = await supabase.from("sites").delete().eq("client_id", clientId);
  if (sErr) return { error: sErr.message };
  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) return { error: error.message };
  redirect("/quotes");
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
