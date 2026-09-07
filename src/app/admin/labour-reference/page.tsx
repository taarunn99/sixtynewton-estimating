import { requireAdmin } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { EditableCell } from "@/components/admin/editable-cell";

export default async function LabourReferencePage() {
  await requireAdmin();
  const supabase = createServiceClient();
  const [{ data: rows }, { data: anchors }] = await Promise.all([
    supabase.from("labour_reference").select("id, item, detail, confidential, flag_note").order("sort"),
    supabase
      .from("tile_labour_anchors")
      .select("id, tile_area_sqm, labour_per_sqm, band_note, flag_note, confidence")
      .order("tile_area_sqm"),
  ]);

  return (
    <div>
      <div className="mb-4">
        <h1 className="font-serif text-xl font-semibold">Labour cost reference</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-500">
          Internal only, source Tarun Sep 2026. Rows marked confidential never appear on any
          client-facing screen, in the assistant, or on a PDF. These figures inform the labour
          suggestions; they are never a price.
        </p>
      </div>
      <div className="mb-8 max-w-3xl rounded-lg border border-neutral-300 bg-white">
        {(rows ?? []).map((r) => (
          <div key={r.id} className="border-b border-neutral-100 px-4 py-2.5 last:border-b-0">
            <div className="flex items-baseline gap-2 text-sm">
              <span className="font-medium">{r.item}</span>
              {r.confidential ? (
                <span className="rounded-full bg-red-50 px-2 text-[11px] text-red-700">confidential</span>
              ) : null}
            </div>
            <div className="mt-0.5 text-sm text-neutral-600">
              <EditableCell table="labour_reference" id={r.id} column="detail" value={r.detail} kind="text" width="w-full" />
            </div>
            {r.flag_note ? (
              <div className="mt-1 text-xs text-amber-700">Flag: {r.flag_note}</div>
            ) : null}
          </div>
        ))}
      </div>

      <h2 className="mb-2 font-serif text-lg font-semibold">Tile labour ladder</h2>
      <p className="mb-3 max-w-2xl text-sm text-neutral-500">
        Application labour per sqm for floor installation, interpolated linearly on tile area
        between anchors. Wall installation adds the uplift from settings (10). Confidence M.
      </p>
      <div className="max-w-2xl overflow-x-auto rounded-lg border border-neutral-300 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
              <th className="px-3 py-2 font-normal">Tile area sqm</th>
              <th className="px-3 py-2 text-right font-normal">Labour AED per sqm</th>
              <th className="px-3 py-2 font-normal">Band</th>
              <th className="px-3 py-2 font-normal">Conf</th>
            </tr>
          </thead>
          <tbody>
            {(anchors ?? []).map((a) => (
              <tr key={a.id} className="border-b border-neutral-100 align-top">
                <td className="px-3 py-1.5">
                  <EditableCell table="tile_labour_anchors" id={a.id} column="tile_area_sqm" value={a.tile_area_sqm} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5 text-right">
                  <EditableCell table="tile_labour_anchors" id={a.id} column="labour_per_sqm" value={a.labour_per_sqm} kind="number" width="w-16" />
                </td>
                <td className="px-3 py-1.5 text-xs text-neutral-500">
                  {a.band_note}
                  {a.flag_note ? <div className="text-amber-700">Flag: {a.flag_note}</div> : null}
                </td>
                <td className="px-3 py-1.5 text-xs">{a.confidence}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
