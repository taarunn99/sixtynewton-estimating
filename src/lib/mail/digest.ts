// Weekly digest: what moved in the last seven days, what needs eyes. Internal
// mail to the app's users only. Your-price totals and counts, never our-cost
// build-ups and never anything from the labour reference. No em or en dashes.
import type { SupabaseClient } from "@supabase/supabase-js";

export interface DigestData {
  windowDays: number;
  issued: { number: string; revision: number; client: string; totalQuoted: number | null }[];
  draftsTouched: { number: string; revision: number; client: string; belowCostLines: number }[];
  staleDrafts: { number: string; revision: number; client: string; ageDays: number }[];
  newProducts: number;
  reviewQueue: number;
  stagesWithHistory: number;
  stagesTotal: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export async function collectDigestData(
  supabase: SupabaseClient,
  computeBelowCost: (quoteId: string) => Promise<number>,
  windowDays = 7
): Promise<DigestData> {
  const since = new Date(Date.now() - windowDays * 86400000).toISOString();
  const staleBefore = new Date(Date.now() - 14 * 86400000).toISOString();

  const [{ data: issuedRows }, { data: draftRows }, { data: staleRows }, prodCount, queueCount, { data: stages }, { data: imp }, { data: iss }] =
    await Promise.all([
      supabase
        .from("quotes")
        .select("id, number, revision, totals, clients(name)")
        .eq("status", "issued")
        .gte("issued_at", since),
      supabase
        .from("quotes")
        .select("id, number, revision, clients(name)")
        .eq("status", "draft")
        .gte("updated_at", since),
      supabase
        .from("quotes")
        .select("id, number, revision, created_at, clients(name)")
        .eq("status", "draft")
        .lt("created_at", staleBefore),
      supabase.from("products").select("*", { count: "exact", head: true }).gte("created_at", since),
      supabase.from("sync_review_queue").select("*", { count: "exact", head: true }),
      supabase.from("stages").select("id"),
      supabase.from("imported_quotes").select("stage_id").not("rate", "is", null),
      supabase
        .from("quote_lines")
        .select("stage_id, quotes!inner(status)")
        .in("quotes.status", ["issued", "revised", "won"])
        .not("unit_price", "is", null)
        .not("stage_id", "is", null),
    ]);

  const covered = new Set<string>();
  for (const r of [...(imp ?? []), ...(iss ?? [])]) if (r.stage_id) covered.add(r.stage_id);

  const clientName = (row: { clients: unknown }) =>
    ((row.clients as { name?: string } | null)?.name ?? "No client");

  const draftsTouched = [];
  for (const d of draftRows ?? []) {
    draftsTouched.push({
      number: d.number,
      revision: d.revision,
      client: clientName(d),
      belowCostLines: await computeBelowCost(d.id),
    });
  }

  return {
    windowDays,
    issued: (issuedRows ?? []).map((q) => ({
      number: q.number,
      revision: q.revision,
      client: clientName(q),
      totalQuoted: (q.totals as { totalQuoted?: number } | null)?.totalQuoted ?? null,
    })),
    draftsTouched,
    staleDrafts: (staleRows ?? []).map((q) => ({
      number: q.number,
      revision: q.revision,
      client: clientName(q),
      ageDays: Math.floor((Date.now() - Date.parse(q.created_at)) / 86400000),
    })),
    newProducts: prodCount.count ?? 0,
    reviewQueue: queueCount.count ?? 0,
    stagesWithHistory: covered.size,
    stagesTotal: (stages ?? []).length,
  };
}

export function renderDigest(d: DigestData): { subject: string; html: string; text: string } {
  const subject = `Sixty Newton quoting digest: ${d.issued.length} issued, ${d.draftsTouched.length} drafts in motion`;

  const issuedRows = d.issued.length
    ? d.issued
        .map(
          (q) =>
            `<tr><td style="padding:4px 10px 4px 0">${q.number} R${q.revision}</td><td style="padding:4px 10px 4px 0">${q.client}</td><td style="padding:4px 0;text-align:right;font-variant-numeric:tabular-nums">${q.totalQuoted !== null ? "AED " + fmt(q.totalQuoted) : ""}</td></tr>`
        )
        .join("")
    : `<tr><td style="padding:4px 0" colspan="3">Nothing issued this week.</td></tr>`;

  const draftRows = d.draftsTouched.length
    ? d.draftsTouched
        .map(
          (q) =>
            `<tr><td style="padding:4px 10px 4px 0">${q.number} R${q.revision}</td><td style="padding:4px 10px 4px 0">${q.client}</td><td style="padding:4px 0">${q.belowCostLines > 0 ? `${q.belowCostLines} line${q.belowCostLines === 1 ? "" : "s"} below our cost` : "clean"}</td></tr>`
        )
        .join("")
    : `<tr><td style="padding:4px 0" colspan="3">No drafts touched this week.</td></tr>`;

  const staleBlock = d.staleDrafts.length
    ? `<h3 style="margin:18px 0 6px;font-size:14px;color:#96772B">Going stale</h3><p style="margin:0">${d.staleDrafts.map((q) => `${q.number} R${q.revision} (${q.client}, ${q.ageDays} days old)`).join("; ")}.</p>`
    : "";

  const html = `
  <div style="font-family:Georgia,serif;color:#1C1713;max-width:640px;margin:0 auto;padding:24px">
    <div style="border-bottom:2px solid #C2A05C;padding-bottom:10px;margin-bottom:16px">
      <div style="font-size:20px;font-weight:bold">Sixty Newton</div>
      <div style="font-size:12px;color:#96772B">Estimating digest, last ${d.windowDays} days</div>
    </div>
    <h3 style="margin:0 0 6px;font-size:14px;color:#96772B">Issued</h3>
    <table style="font-size:14px;border-collapse:collapse">${issuedRows}</table>
    <h3 style="margin:18px 0 6px;font-size:14px;color:#96772B">Drafts in motion</h3>
    <table style="font-size:14px;border-collapse:collapse">${draftRows}</table>
    ${staleBlock}
    <h3 style="margin:18px 0 6px;font-size:14px;color:#96772B">Housekeeping</h3>
    <p style="margin:0;font-size:14px">
      Zoho sync added ${d.newProducts} products this week; ${fmt(d.reviewQueue)} items sit in the review queue.
      Past-quote evidence backs ${d.stagesWithHistory} of ${d.stagesTotal} stages; the rest price from the engine alone.
    </p>
    <p style="margin:18px 0 0;font-size:12px;color:#8A7E68">
      Internal mail from the estimating workbench. Figures are your-price totals; open the app for the full ledger.
    </p>
  </div>`;

  const text = [
    `Sixty Newton estimating digest, last ${d.windowDays} days`,
    "",
    "Issued:",
    ...(d.issued.length
      ? d.issued.map((q) => `  ${q.number} R${q.revision}, ${q.client}${q.totalQuoted !== null ? ", AED " + fmt(q.totalQuoted) : ""}`)
      : ["  Nothing issued this week."]),
    "",
    "Drafts in motion:",
    ...(d.draftsTouched.length
      ? d.draftsTouched.map((q) => `  ${q.number} R${q.revision}, ${q.client}, ${q.belowCostLines > 0 ? q.belowCostLines + " lines below our cost" : "clean"}`)
      : ["  No drafts touched this week."]),
    ...(d.staleDrafts.length
      ? ["", "Going stale:", ...d.staleDrafts.map((q) => `  ${q.number} R${q.revision}, ${q.client}, ${q.ageDays} days old`)]
      : []),
    "",
    `Zoho sync added ${d.newProducts} products this week; ${fmt(d.reviewQueue)} items in the review queue.`,
    `Past-quote evidence backs ${d.stagesWithHistory} of ${d.stagesTotal} stages.`,
  ].join("\n");

  return { subject, html, text };
}
