// Assistant tools, spec section 6. The model proposes; these executors apply
// through the same rules as the UI server actions: drafts only, issued quotes
// are immutable. Every executor returns a compact JSON result for the model.
import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { computeLedger } from "@/lib/engine-server";

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: "recalc",
    description: "Recompute the quote through the engine and return the totals and nudges.",
    input_schema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "add_line",
    description:
      "Add a line from the stage catalogue. The stage's default product family and labour tier price it immediately.",
    input_schema: {
      type: "object",
      properties: {
        stage_id: { type: "string", description: "Stage id from the catalogue in the context packet" },
        qty: { type: "number" },
        family_id: { type: "string", description: "Optional product family id to override the stage default" },
      },
      required: ["stage_id", "qty"],
      additionalProperties: false,
    },
  },
  {
    name: "update_line",
    description:
      "Update a line: qty, quoted rate (null clears it), included, family_id, upper_floor_or_roof.",
    input_schema: {
      type: "object",
      properties: {
        line_id: { type: "string" },
        qty: { type: "number" },
        quoted: { type: ["number", "null"] },
        included: { type: "boolean" },
        family_id: { type: ["string", "null"] },
        upper_floor_or_roof: { type: "boolean" },
      },
      required: ["line_id"],
      additionalProperties: false,
    },
  },
  {
    name: "remove_line",
    description: "Remove a line from the draft.",
    input_schema: {
      type: "object",
      properties: { line_id: { type: "string" } },
      required: ["line_id"],
      additionalProperties: false,
    },
  },
  {
    name: "set_programme",
    description: "Set the requested programme: calendar days and site hours per day. Null clears.",
    input_schema: {
      type: "object",
      properties: {
        days_requested: { type: ["number", "null"] },
        hours_per_day: { type: ["number", "null"] },
      },
      required: ["days_requested"],
      additionalProperties: false,
    },
  },
  {
    name: "set_site_profile",
    description: "Change the site profile of the quote's site by profile id or name.",
    input_schema: {
      type: "object",
      properties: { site_profile: { type: "string", description: "Profile id or exact name" } },
      required: ["site_profile"],
      additionalProperties: false,
    },
  },
  {
    name: "lookup_history",
    description: "Look up observed rates from past quotes by stage and optionally family.",
    input_schema: {
      type: "object",
      properties: {
        stage_id: { type: "string" },
        family_id: { type: "string" },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "lookup_family",
    description: "Search product families by name fragment. Returns id, name, discipline, driver.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "draft_note",
    description:
      "Hand over client-facing text you have written for the quote notes. The user pastes or accepts it; it is not applied automatically.",
    input_schema: {
      type: "object",
      properties: {
        purpose: { type: "string", description: "What the note is for, one line" },
        text: { type: "string", description: "The drafted note text" },
      },
      required: ["purpose", "text"],
      additionalProperties: false,
    },
  },
];

type ToolResult = Record<string, unknown>;

async function draftGuard(quoteId: string): Promise<string | null> {
  const supabase = createServiceClient();
  const { data: quote } = await supabase.from("quotes").select("status").eq("id", quoteId).maybeSingle();
  if (!quote) return "Quote not found";
  if (quote.status !== "draft") return "Issued quotes are immutable. Create a new revision.";
  return null;
}

async function totalsSummary(quoteId: string): Promise<ToolResult> {
  const ledger = await computeLedger(quoteId);
  if (!ledger) return { error: "Quote not found" };
  return {
    totals: ledger.totals,
    nudges: [
      ...ledger.lines.flatMap((l) => l.nudges.map((n) => `${n.severity}: ${n.message}`)),
      ...ledger.quoteNudges.map((n) => `${n.severity}: ${n.message}`),
    ],
  };
}

export async function executeTool(
  quoteId: string,
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  const supabase = createServiceClient();

  switch (name) {
    case "recalc":
      return totalsSummary(quoteId);

    case "add_line": {
      const guard = await draftGuard(quoteId);
      if (guard) return { error: guard };
      const { data: stage } = await supabase
        .from("stages")
        .select("id, name, unit_of_sale, default_family_id, labour_tier_id")
        .eq("id", String(input.stage_id))
        .maybeSingle();
      if (!stage) return { error: "Stage not found" };
      const { data: last } = await supabase
        .from("quote_lines")
        .select("sort")
        .eq("quote_id", quoteId)
        .order("sort", { ascending: false })
        .limit(1);
      const { data: inserted, error } = await supabase
        .from("quote_lines")
        .insert({
          quote_id: quoteId,
          sort: (last?.[0]?.sort ?? 0) + 1,
          stage_id: stage.id,
          family_id: (input.family_id as string | undefined) ?? stage.default_family_id,
          description: stage.name,
          qty: Number(input.qty),
          unit: stage.unit_of_sale ?? "sqm",
          included: true,
          unit_price: null,
          inputs: { tierId: stage.labour_tier_id },
        })
        .select("id")
        .single();
      if (error) return { error: error.message };
      return { ok: true, line_id: inserted.id, ...(await totalsSummary(quoteId)) };
    }

    case "update_line": {
      const guard = await draftGuard(quoteId);
      if (guard) return { error: guard };
      const { data: line } = await supabase
        .from("quote_lines")
        .select("id, quote_id, inputs")
        .eq("id", String(input.line_id))
        .eq("quote_id", quoteId)
        .maybeSingle();
      if (!line) return { error: "Line not found on this quote" };
      const row: Record<string, unknown> = {};
      if (input.qty !== undefined) row.qty = input.qty;
      if (input.quoted !== undefined) row.unit_price = input.quoted;
      if (input.included !== undefined) row.included = input.included;
      if (input.family_id !== undefined) row.family_id = input.family_id;
      if (input.upper_floor_or_roof !== undefined) {
        row.inputs = { ...(line.inputs ?? {}), upperFloorOrRoof: input.upper_floor_or_roof };
      }
      const { error } = await supabase.from("quote_lines").update(row).eq("id", line.id);
      if (error) return { error: error.message };
      return { ok: true, ...(await totalsSummary(quoteId)) };
    }

    case "remove_line": {
      const guard = await draftGuard(quoteId);
      if (guard) return { error: guard };
      const { error } = await supabase
        .from("quote_lines")
        .delete()
        .eq("id", String(input.line_id))
        .eq("quote_id", quoteId);
      if (error) return { error: error.message };
      return { ok: true, ...(await totalsSummary(quoteId)) };
    }

    case "set_programme": {
      const guard = await draftGuard(quoteId);
      if (guard) return { error: guard };
      const { error } = await supabase
        .from("quotes")
        .update({
          programme_days_requested: input.days_requested,
          ...(input.hours_per_day !== undefined
            ? { programme_hours_per_day: input.hours_per_day }
            : {}),
        })
        .eq("id", quoteId);
      if (error) return { error: error.message };
      const ledger = await computeLedger(quoteId);
      return {
        ok: true,
        programme: ledger
          ? {
              uplift: ledger.totals.programmeUplift,
              infeasible: ledger.totals.programmeInfeasible,
              explanation: ledger.totals.programmeExplanation,
            }
          : null,
        totals: ledger?.totals ?? null,
      };
    }

    case "set_site_profile": {
      const guard = await draftGuard(quoteId);
      if (guard) return { error: guard };
      const key = String(input.site_profile);
      const { data: profile } = await supabase
        .from("site_profiles")
        .select("id, name")
        .or(`id.eq.${key},name.eq.${key}`)
        .maybeSingle();
      if (!profile) return { error: "Site profile not found" };
      const { data: quote } = await supabase.from("quotes").select("site_id").eq("id", quoteId).single();
      const { error } = await supabase
        .from("sites")
        .update({ site_profile_id: profile.id })
        .eq("id", quote!.site_id);
      if (error) return { error: error.message };
      return { ok: true, profile: profile.name, ...(await totalsSummary(quoteId)) };
    }

    case "lookup_history": {
      let q = supabase
        .from("imported_quotes")
        .select("stage_id, family_id, rate, qty, quote_number, quote_date_text")
        .not("rate", "is", null)
        .limit(Math.min(Number(input.limit ?? 10), 25));
      if (input.stage_id) q = q.eq("stage_id", String(input.stage_id));
      if (input.family_id) q = q.eq("family_id", String(input.family_id));
      const { data, error } = await q;
      if (error) return { error: error.message };
      return { rates: data };
    }

    case "lookup_family": {
      const { data, error } = await supabase
        .from("product_families")
        .select("id, name, discipline, driver, coverage_value, coverage_unit")
        .ilike("name", `%${String(input.query)}%`)
        .limit(15);
      if (error) return { error: error.message };
      return { families: data };
    }

    case "draft_note":
      // The text is shown to the user in the thread; nothing is applied.
      return { ok: true, delivered: true };

    default:
      return { error: `Unknown tool ${name}` };
  }
}

// Tools that change the quote, so the client refreshes the ledger after them.
export const MUTATING_TOOLS = new Set([
  "add_line",
  "update_line",
  "remove_line",
  "set_programme",
  "set_site_profile",
]);
