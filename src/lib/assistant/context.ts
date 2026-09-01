// Context packet for the assistant, spec section 6. Assembled server side on
// each turn, target under 6k tokens: quote header, site profile, programme,
// compact lines with breakdowns and nudges, history matches, stage catalogue,
// relevant settings. The model never calculates; it reads this and proposes.
import { createServiceClient } from "@/lib/supabase/server";
import { computeLedger, type LedgerResult } from "@/lib/engine-server";

const r2 = (n: number | null): number | null =>
  n === null ? null : Math.round(n * 100) / 100;

export async function buildContextPacket(
  quoteId: string
): Promise<{ packet: string; ledger: LedgerResult } | null> {
  const ledger = await computeLedger(quoteId);
  if (!ledger) return null;
  const supabase = createServiceClient();

  const [{ data: stages }, { data: settings }, { data: rates }] = await Promise.all([
    supabase.from("stages").select("id, discipline, name, unit_of_sale").order("sort_order"),
    supabase.from("settings").select("default_margin, default_overhead, vat_rate, intercompany_factor, baseline_productivity_sqm_per_crew_day, upper_floor_factor").single(),
    supabase
      .from("imported_quotes")
      .select("stage_id, rate, qty, quote_number, quote_date_text")
      .not("rate", "is", null),
  ]);

  const historyByStage = new Map<string, { rate: number; quote: string; date: string }[]>();
  for (const r of rates ?? []) {
    if (!r.stage_id) continue;
    const arr = historyByStage.get(r.stage_id) ?? [];
    if (arr.length < 3) {
      arr.push({ rate: Number(r.rate), quote: r.quote_number ?? "", date: r.quote_date_text ?? "" });
      historyByStage.set(r.stage_id, arr);
    }
  }

  const packet = {
    quote: {
      id: ledger.quote.id,
      number: ledger.quote.number,
      revision: ledger.quote.revision,
      status: ledger.quote.status,
      client: ledger.quote.clientName,
      site: ledger.quote.siteName,
      siteProfile: ledger.quote.siteProfileName,
      labourMultiplier: ledger.quote.labourMultiplier,
      noiseRestricted: ledger.quote.noiseRestricted,
      programmeDaysRequested: ledger.quote.programmeDaysRequested,
      programmeHoursPerDay: ledger.quote.programmeHoursPerDay,
      programmeBaseCrewDays: ledger.quote.programmeBaseCrewDays,
      marginPct: ledger.quote.marginPct,
    },
    lines: ledger.lines.map((l) => ({
      id: l.id,
      description: l.description,
      discipline: l.discipline,
      family: l.familyName,
      qty: l.qty,
      unit: l.unit,
      included: l.included,
      rateOnly: l.isRateOnly,
      floor: l.floor,
      calculated: l.calculated,
      quoted: l.quoted,
      breakdown: {
        material: r2(l.breakdown.material),
        labour: r2(l.breakdown.labour),
        crewCostReference: r2(l.breakdown.crewCostReference),
      },
      nudges: l.nudges.map((n) => `${n.severity}: ${n.message}`),
    })),
    totals: ledger.totals,
    quoteNudges: ledger.quoteNudges.map((n) => `${n.severity}: ${n.message}`),
    historyByStage: Object.fromEntries(historyByStage),
    stageCatalogue: (stages ?? []).map((s) => ({
      id: s.id,
      discipline: s.discipline,
      name: s.name,
      unit: s.unit_of_sale,
    })),
    settings,
  };

  return { packet: JSON.stringify(packet), ledger };
}

export const SYSTEM_PROMPT = `You are the estimating assistant for Sixty Newton Technical Services, a UAE specialist applicator. You never calculate prices yourself; you read the engine's breakdown and history in the context packet and explain, compare, flag and propose. When the user asks for a change, call a tool; do not state a new number as if applied. The engine recomputes after every tool call and the result comes back to you. Be direct. Flag problems before praise. Use AED with thousands separators. No em or en dashes anywhere, use commas, colons or full stops. Sentence case only. When writing client-facing text, keep Sixty Newton's register: brand-certified, spec-driven, plain English. Crew cost figures are reference only and are never a price. Tax is always exclusive; refuse tax-inclusive input. Quoted rates below the cost floor lose money: say so plainly.`;
