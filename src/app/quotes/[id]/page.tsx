import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { computeLedger } from "@/lib/engine-server";
import { Ledger } from "./ledger";
import { SidePanel } from "./side-panel";

export default async function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getProfile();
  const ledger = await computeLedger(id);
  if (!ledger) notFound();

  const supabase = await createClient();
  const [{ data: allQuotes }, { data: stageOptions }, { data: familyOptions }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, revision, status, quote_date, clients(name)")
      .order("quote_date", { ascending: false })
      .order("revision", { ascending: false }),
    supabase
      .from("stages")
      .select("id, name, discipline, unit_of_sale, default_family_id")
      .order("sort_order"),
    supabase.from("product_families").select("id, name, discipline, brand").order("name"),
  ]);

  const byClient = new Map<string, NonNullable<typeof allQuotes>>();
  for (const q of allQuotes ?? []) {
    const name = (q.clients as { name?: string } | null)?.name ?? "No client";
    if (!byClient.has(name)) byClient.set(name, []);
    byClient.get(name)!.push(q);
  }

  const STATUS_LABEL: Record<string, string> = {
    draft: "Draft",
    issued: "Issued",
    revised: "Revised",
    won: "Won",
    lost: "Lost",
  };

  return (
    <div className="grid h-screen min-w-[1180px] grid-cols-[260px_1fr_380px] bg-[#F4F1EA]">
      <aside className="flex flex-col overflow-hidden bg-[#1C1713] text-[#EDE6D6]">
        <div className="flex items-center gap-2 px-4 pb-3 pt-4">
          <div>
            <div className="font-serif text-base font-semibold text-[#F4EEDE]">SixtyNewton</div>
            <div className="text-[11px] tracking-wide text-[#C2A05C]">Estimating</div>
          </div>
        </div>
        <Link
          href="/quotes/new"
          className="mx-3 mb-2 flex items-center justify-between rounded-lg border border-[#C2A05C] bg-[#C2A05C] px-3 py-2 text-left text-sm font-medium text-[#1C1713] hover:bg-[#D0B172]"
        >
          New quote <kbd className="rounded border border-[#1C1713]/30 px-1 text-[11px]">N</kbd>
        </Link>
        <div className="flex-1 overflow-auto px-2 pb-4">
          {[...byClient.entries()].map(([client, quotes]) => (
            <div key={client} className="mt-2">
              <div className="flex justify-between px-2 py-1 text-sm text-[#EDE6D6]">
                <span>{client}</span>
                <span className="text-xs text-[#9A8E77]">{quotes.length}</span>
              </div>
              <ul className="pl-2">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/quotes/${q.id}`}
                      className={`grid grid-cols-[1fr_auto] gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                        q.id === ledger.quote.id
                          ? "bg-[#2B231B] text-[#F4EEDE] shadow-[inset_3px_0_0_#C2A05C]"
                          : "text-[#B9AE99] hover:bg-[#2B231B] hover:text-[#EDE6D6]"
                      }`}
                    >
                      <span className="truncate">
                        {q.number} R{q.revision}
                      </span>
                      <span
                        className={`self-center rounded-full px-1.5 text-[11px] ${
                          q.status === "won"
                            ? "bg-[#2E4633] text-[#9FCE8F]"
                            : q.status === "draft"
                              ? "bg-[#3A3128] text-[#C2A05C]"
                              : "bg-[#2B231B] text-[#9A8E77]"
                        }`}
                      >
                        {STATUS_LABEL[q.status] ?? q.status}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-[#3A3128] px-4 py-2.5 text-xs text-[#9A8E77]">
          <span>{profile.full_name ?? "Signed in"}</span>
          <Link href="/admin/products" className="hover:text-[#EDE6D6]">
            Admin
          </Link>
        </div>
      </aside>

      <main className="overflow-auto px-6 pb-16 pt-4">
        <Ledger
          data={ledger}
          stageOptions={(stageOptions ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            discipline: s.discipline,
            unit: s.unit_of_sale ?? "sqm",
            hasDefaultProduct: !!s.default_family_id,
          }))}
          familyOptions={(familyOptions ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            discipline: f.discipline ?? "Other",
            brand: f.brand ?? "",
          }))}
        />
      </main>

      <SidePanel
        quoteId={ledger.quote.id}
        openingNudges={[
          ...ledger.lines.flatMap((l) =>
            l.nudges.map((n) => ({ severity: n.severity, message: n.message }))
          ),
          ...ledger.quoteNudges.map((n) => ({ severity: n.severity, message: n.message })),
        ]}
      />
    </div>
  );
}
