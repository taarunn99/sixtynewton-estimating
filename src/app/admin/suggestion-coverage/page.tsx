import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export default async function SuggestionCoveragePage() {
  await requireAdmin();
  const supabase = createServiceClient();
  const [{ data: stages }, { data: imported }, { data: issued }] = await Promise.all([
    supabase.from("stages").select("id, discipline, name").order("sort_order"),
    supabase.from("imported_quotes").select("stage_id, rate").not("rate", "is", null),
    supabase
      .from("quote_lines")
      .select("stage_id, unit_price, quotes!inner(status)")
      .in("quotes.status", ["issued", "revised", "won"])
      .not("unit_price", "is", null)
      .not("stage_id", "is", null),
  ]);

  const byStage = new Map<string, number[]>();
  for (const r of imported ?? []) {
    if (!r.stage_id) continue;
    byStage.set(r.stage_id, [...(byStage.get(r.stage_id) ?? []), Number(r.rate)]);
  }
  for (const r of issued ?? []) {
    byStage.set(r.stage_id, [...(byStage.get(r.stage_id) ?? []), Number(r.unit_price)]);
  }

  const rows = (stages ?? []).map((s) => {
    const points = byStage.get(s.id) ?? [];
    return { ...s, count: points.length, median: points.length ? median(points) : null };
  });
  const zero = rows.filter((r) => r.count === 0).length;

  let currentDiscipline = "";
  return (
    <div>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold">Suggestion coverage</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          How many past quote rates back each stage's suggestions. Stages at zero run on the
          engine build-up alone; every imported quote thickens this. {zero} of {rows.length}{" "}
          stages currently have no history points.
        </p>
      </div>
      <div className="max-w-3xl overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Stage</th>
              <th className="px-3 py-2 text-right font-normal">History points</th>
              <th className="px-3 py-2 text-right font-normal">Median rate</th>
              <th className="px-3 py-2 font-normal">Suggestion source</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const header =
                r.discipline !== currentDiscipline ? (
                  <tr key={`${r.id}-h`} className="border-b border-neutral-200 bg-neutral-50">
                    <td colSpan={4} className="px-3 py-1.5 font-serif text-sm">
                      {r.discipline}
                    </td>
                  </tr>
                ) : null;
              currentDiscipline = r.discipline;
              return (
                <>
                  {header}
                  <tr key={r.id} className="border-b border-neutral-100">
                    <td className="px-3 py-1.5">{r.name}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${r.count === 0 ? "text-red-700" : ""}`}>
                      {r.count}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {r.median !== null ? Math.round(r.median * 10) / 10 : ""}
                    </td>
                    <td className="px-3 py-1.5 text-xs text-neutral-500">
                      {r.count >= 2 ? "past quotes lead" : r.count === 1 ? "engine leads, 1 point noted" : "engine only"}
                    </td>
                  </tr>
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
