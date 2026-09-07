// Structured quote history search and labour proposals for the assistant
// (UPDATE_VARIABLES_CASH.md section 5). Pure over a Supabase client so tests
// can drive it directly; the model composes answers from these results only.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface HistorySearchParams {
  // Free text matched against client, site, stage, description and notes
  query?: string;
  unit?: string;
  from?: string;
  to?: string;
  limit?: number;
}

export interface HistoryHit {
  quoteNumber: string;
  date: string;
  client: string;
  line: string;
  rate: number;
  unit: string;
  qtyNote: string | null;
  source: "imported" | "issued";
}

export async function searchHistory(
  supabase: SupabaseClient,
  params: HistorySearchParams
): Promise<HistoryHit[]> {
  const [{ data: imported }, { data: lines }] = await Promise.all([
    supabase
      .from("imported_quotes")
      .select("quote_number, client_site, stage_name, rate, unit, quote_date_text, quote_date, notes")
      .not("rate", "is", null),
    supabase
      .from("quote_lines")
      .select("description, unit, unit_price, qty, quotes!inner(number, quote_date, status, clients(name), sites(name))")
      .in("quotes.status", ["issued", "revised", "won"])
      .not("unit_price", "is", null),
  ]);

  const hits: HistoryHit[] = [
    ...(imported ?? []).map((r) => ({
      quoteNumber: r.quote_number ?? "",
      date: r.quote_date_text ?? "",
      client: r.client_site ?? "",
      line: r.stage_name ?? "",
      rate: Number(r.rate),
      unit: r.unit ?? "sqm",
      qtyNote: r.notes ?? null,
      source: "imported" as const,
    })),
    ...(lines ?? []).map((r) => {
      const q = r.quotes as unknown as {
        number: string;
        quote_date: string;
        clients: { name: string } | null;
        sites: { name: string } | null;
      };
      return {
        quoteNumber: q.number,
        date: q.quote_date ?? "",
        client: [q.clients?.name, q.sites?.name].filter(Boolean).join(", "),
        line: r.description,
        rate: Number(r.unit_price),
        unit: r.unit ?? "sqm",
        qtyNote: r.qty ? `${r.qty} ${r.unit ?? "sqm"}` : null,
        source: "issued" as const,
      };
    }),
  ];

  const terms = (params.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const filtered = hits.filter((h) => {
    if (params.unit && h.unit !== params.unit) return false;
    if (terms.length) {
      const text = `${h.quoteNumber} ${h.client} ${h.line} ${h.qtyNote ?? ""}`.toLowerCase();
      if (!terms.every((t) => text.includes(t))) return false;
    }
    if (params.from || params.to) {
      const d = Date.parse(h.date);
      if (Number.isFinite(d)) {
        if (params.from && d < Date.parse(params.from)) return false;
        if (params.to && d > Date.parse(params.to)) return false;
      }
    }
    return true;
  });
  return filtered.slice(0, Math.min(params.limit ?? 25, 50));
}

// One-paragraph labour recommendation from the engine's suggestion and the
// matching history. Proposals never auto-apply; the user accepts first.
export function composeLabourProposal(args: {
  description: string;
  unit: string;
  labourSuggested: number;
  labourSource: string;
  labourCurrent: number;
  historyQuotes: { quoteNumber: string; rate: number; date: string }[];
  historyMedian: number | null;
  enginePrice: number;
}): string {
  const s = args;
  const cite = s.historyQuotes.length
    ? ` Past quotes for this work: ${s.historyQuotes.map((q) => `${q.quoteNumber} at ${q.rate}`).join(", ")}${s.historyMedian !== null ? `, median ${Math.round(s.historyMedian * 10) / 10}` : ""}.`
    : " No matching past quotes yet.";
  const crew = " A 5 person crew runs about 480 to 530 per day, near 19 to 21 per sqm at 25 sqm a day.";
  return (
    `For ${s.description}: I suggest labour of ${Math.round(s.labourSuggested * 10) / 10} per ${s.unit}, from the ${s.labourSource}.` +
    cite +
    crew +
    ` If you accept, I will write it into the line's labour field; it stays yours to change.`
  );
}
