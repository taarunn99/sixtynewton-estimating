"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { LedgerResult, LedgerLine } from "@/lib/engine-server";
import { addStageLine, removeLine, updateLine, updateQuoteVariables } from "@/app/quotes/actions";

export type StageOption = {
  id: string;
  name: string;
  discipline: string;
  unit: string;
  hasDefaultProduct: boolean;
};
export type FamilyOption = { id: string; name: string; discipline: string; brand: string };

// Product families offered for a stage stay inside that stage's discipline:
// waterproofing stages never offer tile adhesives. Aliases bridge the two
// naming schemes in the workbook; cross-discipline items always qualify.
const DISCIPLINE_ALIASES: Record<string, string[]> = {
  "Design concrete": ["Decorative concrete", "Microtopping"],
  Microtopping: ["Decorative concrete", "Design concrete"],
  Polishing: ["Decorative concrete", "Design concrete"],
  "Bitumen WP": ["Waterproofing"],
  Waterproofing: ["Bitumen WP"],
};

export function familiesForDiscipline(discipline: string, families: FamilyOption[]): FamilyOption[] {
  const accepted = new Set([discipline, ...(DISCIPLINE_ALIASES[discipline] ?? []), "Cross-discipline"]);
  const filtered = families.filter((f) => accepted.has(f.discipline));
  return filtered.length ? filtered : families;
}

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtRate = (n: number) => (Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 }));

declare global {
  interface Window {
    __snFocusedQuotedLine?: string;
  }
}

function Flag({ line }: { line: LedgerLine }) {
  if (line.quoted === null || !line.included) return <span className="w-[18px]" />;
  const below = line.nudges.find((n) => n.rule === "below_cost_floor" || n.rule === "below_calculated");
  if (!below) return <span className="w-[18px]" />;
  const red = below.rule === "below_cost_floor";
  return (
    <span
      title={below.message}
      className={`grid h-[18px] w-[18px] place-items-center rounded-full text-[11px] font-semibold ${
        red ? "bg-[#F9E7E7] text-[#A83232]" : "bg-[#FBF1E0] text-[#B8741A]"
      }`}
    >
      !
    </span>
  );
}

function AddStageDialog({
  quoteId,
  discipline,
  stages,
  defaultQty,
}: {
  quoteId: string;
  discipline: string | null;
  stages: StageOption[];
  defaultQty: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const pool = discipline ? stages.filter((s) => s.discipline === discipline) : stages;
  const results = pool.filter((s) =>
    `${s.name} ${s.discipline}`.toLowerCase().includes(query.toLowerCase())
  );

  const pick = (stage: StageOption) =>
    startTransition(async () => {
      await addStageLine(quoteId, stage.id, stage.unit === "lump" ? 1 : defaultQty);
      setOpen(false);
      setQuery("");
    });

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 py-2 text-sm text-[#8A929C] transition-colors hover:text-[#1F2328]"
      >
        + Add a stage{discipline ? ` from ${discipline}` : " from any discipline"}
      </button>
    );
  }
  return (
    <div className="my-2 rounded-lg border border-[#CFD4DA] bg-white shadow-sm">
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && results[0]) pick(results[0]);
        }}
        placeholder={`Search ${discipline ?? "all"} stages`}
        className="w-full border-b border-[#E2E5E9] bg-transparent px-3 py-2 text-sm outline-none"
      />
      <div className={`max-h-56 overflow-auto ${pending ? "opacity-50" : ""}`}>
        {results.slice(0, 30).map((s) => (
          <button
            key={s.id}
            onClick={() => pick(s)}
            className="grid w-full grid-cols-[1fr_auto_auto] items-baseline gap-3 px-3 py-1.5 text-left text-sm transition-colors hover:bg-[#F6F0DF]"
          >
            <span className="truncate">{s.name}</span>
            {!discipline ? <span className="text-xs text-[#8A929C]">{s.discipline}</span> : <span />}
            <span className="text-xs text-[#8A929C]">
              {s.unit}
              {s.hasDefaultProduct ? " · product set" : ""}
            </span>
          </button>
        ))}
        {results.length === 0 ? (
          <p className="px-3 py-2 text-xs text-[#8A929C]">No stages match.</p>
        ) : null}
      </div>
      <button
        onClick={() => setOpen(false)}
        className="w-full border-t border-[#E2E5E9] px-3 py-1.5 text-left text-xs text-[#8A929C] hover:text-[#1F2328]"
      >
        Close (Esc)
      </button>
    </div>
  );
}

function LineRow({
  line,
  editable,
  familyOptions,
}: {
  line: LedgerLine;
  editable: boolean;
  familyOptions: FamilyOption[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState(String(line.qty));
  const [quoted, setQuoted] = useState(line.quoted === null ? "" : String(line.quoted));
  const [pending, startTransition] = useTransition();
  const isLump = line.unit === "lump";

  useEffect(() => setQty(String(line.qty)), [line.qty]);
  useEffect(() => setQuoted(line.quoted === null ? "" : String(line.quoted)), [line.quoted]);

  const save = (patch: Parameters<typeof updateLine>[1]) =>
    startTransition(async () => {
      await updateLine(line.id, patch);
    });

  const displayFloor = isLump ? line.floor : line.floor;
  const displayCalc = line.calculated;

  return (
    <>
      <div
        className={`grid grid-cols-[28px_1fr_88px_44px_92px_92px_92px_26px] items-center gap-2 border-b border-[#E2E5E9] py-1.5 ${
          line.included ? "" : "text-[#8A929C]"
        } ${pending ? "opacity-60" : ""}`}
      >
        <button
          aria-label="include"
          disabled={!editable}
          onClick={() => save({ included: !line.included })}
          className={`grid h-[18px] w-[18px] place-items-center rounded border-[1.5px] ${
            line.included ? "border-[#1F2328] bg-[#1F2328]" : "border-[#CFD4DA] bg-white"
          }`}
        >
          {line.included ? <span className="mb-0.5 h-[9px] w-[5px] rotate-45 border-b-2 border-r-2 border-white" /> : null}
        </button>
        <button className="text-left" onClick={() => setExpanded(!expanded)}>
          <span className="block text-sm font-medium">{line.description}</span>
          {line.detail ? <span className="block text-xs text-[#8A929C]">{line.detail}</span> : null}
        </button>
        <input
          className="w-[80px] rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm tabular-nums hover:border-[#CFD4DA] focus:border-[#CFD4DA] focus:bg-white focus:outline-none"
          value={qty}
          disabled={!editable}
          onChange={(e) => setQty(e.target.value)}
          onBlur={() => {
            const n = parseFloat(qty.replace(/,/g, ""));
            if (Number.isFinite(n) && n !== line.qty) save({ qty: n });
          }}
        />
        <span className="text-xs text-[#8A929C]">{line.unit}</span>
        <span className="text-right text-sm font-medium tabular-nums text-[#4A6B8A]">
          {fmt(isLump ? displayFloor : displayFloor)}
        </span>
        <span className="text-right text-sm font-medium tabular-nums">{fmt(displayCalc)}</span>
        <input
          className="w-[88px] rounded border border-transparent bg-transparent px-1.5 py-0.5 text-right text-sm font-medium tabular-nums text-[#B8953F] hover:border-[#B8953F] focus:border-[#B8953F] focus:bg-[#F6F0DF] focus:outline-none"
          value={quoted}
          disabled={!editable}
          onFocus={() => {
            window.__snFocusedQuotedLine = line.id;
          }}
          onChange={(e) => setQuoted(e.target.value)}
          onBlur={() => {
            const n = quoted === "" ? null : parseFloat(quoted.replace(/,/g, ""));
            if (n === null || Number.isFinite(n)) {
              if (n !== line.quoted) save({ quoted: n });
            }
          }}
          data-quoted-line={line.id}
        />
        <Flag line={line} />
      </div>
      {expanded ? (
        <div className="grid grid-cols-[28px_1fr] border-b border-[#E2E5E9] bg-[#FAFAFB] py-2.5 text-xs text-[#5B636E]">
          <span />
          <div className="flex flex-col gap-2 pr-2">
            <div className="flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
              <span>Material {fmtRate(line.breakdown.material)}</span>
              <span>Labour {fmtRate(line.breakdown.labour)}</span>
              <span>Consumables {fmtRate(line.breakdown.consumables)}</span>
              <span>Equipment {fmtRate(line.breakdown.equipment)}</span>
              <span className="font-medium">Cost {fmtRate(line.breakdown.cost)}</span>
              <span className="text-[#4A6B8A]">Floor is cost plus overhead</span>
              {line.breakdown.crewCostReference !== null ? (
                <span className="text-[#8A929C]">
                  Crew cost reference: {fmtRate(line.breakdown.crewCostReference)} per sqm, never applied to the price
                </span>
              ) : null}
            </div>
            {line.nudges.length ? (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {line.nudges.map((n, i) => (
                  <span key={i} className={n.severity === "block" ? "text-[#A83232]" : n.severity === "warn" ? "text-[#B8741A]" : "text-[#4A6B8A]"}>
                    {n.message}
                  </span>
                ))}
              </div>
            ) : null}
            {editable ? (
              <div className="flex items-center gap-3">
                <label className="text-[#8A929C]">Product</label>
                <select
                  className="max-w-96 rounded border border-[#CFD4DA] bg-white px-2 py-1 text-xs focus:border-[#B8953F] focus:outline-none"
                  value={line.familyId ?? ""}
                  onChange={(e) => save({ familyId: e.target.value || null })}
                >
                  <option value="">No product, labour only</option>
                  {familiesForDiscipline(line.discipline, familyOptions).map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <span className="text-[#8A929C]">{line.discipline} products only</span>
                <button
                  onClick={() =>
                    startTransition(async () => {
                      await removeLine(line.id);
                    })
                  }
                  className="ml-auto text-[#A83232] hover:underline"
                >
                  Remove line
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function VarInput({ label, value, suffix, onSave, editable }: { label: string; value: number | null; suffix?: string; onSave: (n: number | null) => void; editable: boolean }) {
  const [v, setV] = useState(value === null ? "" : String(value));
  useEffect(() => setV(value === null ? "" : String(value)), [value]);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[#CFD4DA] bg-white px-2.5 py-1.5">
      <label className="text-[13px] text-[#5B636E]">{label}</label>
      <input
        type="number"
        className="w-14 border-b border-[#CFD4DA] bg-transparent px-0.5 text-right text-sm tabular-nums focus:border-[#B8953F] focus:outline-none"
        value={v}
        disabled={!editable}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          const n = v === "" ? null : Number(v);
          if ((n === null || Number.isFinite(n)) && n !== value) onSave(n);
        }}
      />
      {suffix ? <span className="text-xs text-[#8A929C]">{suffix}</span> : null}
    </div>
  );
}

export function Ledger({
  data,
  stageOptions,
  familyOptions,
}: {
  data: LedgerResult;
  stageOptions: StageOption[];
  familyOptions: FamilyOption[];
}) {
  const { quote, lines, totals } = data;
  const editable = quote.status === "draft";
  const [, startTransition] = useTransition();

  // Group by discipline, preserving line order
  const groups = useMemo(() => {
    const order: string[] = [];
    const byDisc = new Map<string, LedgerLine[]>();
    for (const l of lines) {
      if (!byDisc.has(l.discipline)) {
        byDisc.set(l.discipline, []);
        order.push(l.discipline);
      }
      byDisc.get(l.discipline)!.push(l);
    }
    return order.map((d) => ({ discipline: d, lines: byDisc.get(d)! }));
  }, [lines]);

  // Calculator "Use as quoted rate"
  useEffect(() => {
    const handler = (e: Event) => {
      const value = (e as CustomEvent<number>).detail;
      const target =
        window.__snFocusedQuotedLine ?? lines.find((l) => l.included)?.id;
      if (target && editable) {
        startTransition(async () => {
          await updateLine(target, { quoted: value });
        });
      }
    };
    window.addEventListener("sn-use-quoted", handler);
    return () => window.removeEventListener("sn-use-quoted", handler);
  }, [lines, editable, startTransition]);

  const saveVar = (patch: Parameters<typeof updateQuoteVariables>[1]) =>
    startTransition(async () => {
      await updateQuoteVariables(quote.id, patch);
    });

  const deltaPct = totals.calculatedSubtotal
    ? ((totals.quotedSubtotal - totals.calculatedSubtotal) / totals.calculatedSubtotal) * 100
    : 0;
  const overFloorPct = totals.floorSubtotal
    ? ((totals.quotedSubtotal - totals.floorSubtotal) / totals.floorSubtotal) * 100
    : 0;

  return (
    <div className="mx-auto max-w-[980px] rounded-xl border border-[#CFD4DA] bg-white">
      <div className="flex items-start justify-between gap-5 px-7 pt-5">
        <div>
          <h1 className="font-serif text-[22px] font-semibold">
            {quote.number} R{quote.revision} &nbsp;{quote.clientName}: {quote.siteName}
          </h1>
          <div className="text-sm text-[#5B636E]">
            Bill to {quote.clientName} &middot; Site {quote.siteName} &middot; {quote.quoteDate}, valid {quote.validDays} days
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#B8953F] bg-[#F6F0DF] px-2.5 py-0.5 text-xs text-[#B8953F]">
              Site profile: {quote.siteProfileName}
            </span>
            <span className="rounded-full border border-[#CFD4DA] px-2.5 py-0.5 text-xs text-[#5B636E]">
              Labour multiplier {quote.labourMultiplier}
            </span>
            {quote.noiseRestricted ? (
              <span className="rounded-full border border-[#CFD4DA] px-2.5 py-0.5 text-xs text-[#5B636E]">
                Noise restricted, +8% labour
              </span>
            ) : null}
            <span className="rounded-full border border-[#CFD4DA] px-2.5 py-0.5 text-xs text-[#5B636E]">Tax exclusive 5%</span>
            <span className="rounded-full border border-[#CFD4DA] px-2.5 py-0.5 text-xs text-[#5B636E]">
              Status: {quote.status}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="rounded-lg border border-[#CFD4DA] px-3 py-2 text-sm font-medium hover:border-[#5B636E]">
            Preview PDF
          </button>
          <button className="rounded-lg bg-[#1F2328] px-3 py-2 text-sm font-medium text-white hover:bg-black">
            Issue R{quote.revision}
          </button>
        </div>
      </div>

      <div className="sticky top-0 z-10 mt-3.5 grid grid-cols-[28px_1fr_88px_44px_92px_92px_92px_26px] gap-2 border-y border-[#E2E5E9] bg-white px-7 py-1.5 text-xs text-[#8A929C]">
        <span />
        <span>Stage and product</span>
        <span className="text-right">Qty</span>
        <span />
        <span className="text-right text-[#4A6B8A]">Cost floor</span>
        <span className="text-right">Calculated</span>
        <span className="text-right text-[#B8953F]">Quoted</span>
        <span />
      </div>

      <div className="px-7">
        {groups.map((g) => (
          <section key={g.discipline}>
            <h2 className="mb-1 mt-4 flex items-baseline justify-between font-serif text-[15px]">
              {g.discipline}
              <span className="font-sans text-xs font-normal text-[#8A929C]">
                {g.lines.filter((l) => l.included).length} of {g.lines.length} stages
              </span>
            </h2>
            {g.lines.map((l) => (
              <LineRow key={l.id} line={l} editable={editable} familyOptions={familyOptions} />
            ))}
            {editable ? (
              <AddStageDialog
                quoteId={quote.id}
                discipline={g.discipline}
                stages={stageOptions}
                defaultQty={g.lines.find((l) => l.unit === "sqm")?.qty ?? 1}
              />
            ) : null}
          </section>
        ))}
        {editable ? (
          <AddStageDialog
            quoteId={quote.id}
            discipline={null}
            stages={stageOptions}
            defaultQty={lines.find((l) => l.unit === "sqm")?.qty ?? 1}
          />
        ) : null}
      </div>

      <div className="mx-7 mt-4 rounded-lg border border-dashed border-[#CFD4DA] px-4 py-3">
        <h3 className="mb-2 flex justify-between text-[13px] font-semibold">
          Variables on this quote
          <span className="font-normal text-[#8A929C]">each one changes the calculated column</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <VarInput label="Site hours per day" value={quote.programmeHoursPerDay} editable={editable} onSave={(n) => saveVar({ programme_hours_per_day: n })} />
          <VarInput label="Deadline, calendar days" value={quote.programmeDaysRequested} editable={editable} onSave={(n) => saveVar({ programme_days_requested: n })} />
          <VarInput label="Base programme, crew-days" value={quote.programmeBaseCrewDays} editable={editable} onSave={(n) => saveVar({ programme_base_crew_days: n })} />
          <VarInput
            label="Margin"
            value={Math.round(quote.marginPct * 100)}
            suffix="%"
            editable={editable}
            onSave={(n) => saveVar({ margin_pct: n === null ? null : n / 100 })}
          />
        </div>
      </div>

      <div className="mx-7 mt-4 border-t-2 border-[#1F2328] pt-2.5 pb-6">
        <div className="grid grid-cols-[1fr_92px_92px_92px_26px] items-baseline gap-2 py-1">
          <span className="text-sm text-[#5B636E]">Included stages, base programme</span>
          <span className="text-right text-sm font-medium tabular-nums text-[#4A6B8A]">{fmt(totals.floorSubtotal)}</span>
          <span className="text-right text-sm font-medium tabular-nums">{fmt(totals.calculatedSubtotal)}</span>
          <span className="text-right text-sm font-medium tabular-nums text-[#B8953F]">{fmt(totals.quotedSubtotal)}</span>
          <span />
        </div>
        {totals.programmeUplift > 0 || totals.programmeInfeasible ? (
          <>
            <div className="grid grid-cols-[1fr_92px_92px_92px_26px] items-baseline gap-2 py-1">
              <span className="text-sm text-[#5B636E]">Programme compression</span>
              <span className="text-right text-sm font-medium tabular-nums text-[#4A6B8A]">{fmt(totals.programmeUplift)}</span>
              <span className="text-right text-sm font-medium tabular-nums">{fmt(totals.programmeUplift)}</span>
              <span className="text-right text-sm tabular-nums text-[#8A929C]">in rates</span>
              <span />
            </div>
            <p className={`py-0.5 text-xs ${totals.programmeInfeasible ? "text-[#A83232]" : "text-[#8A929C]"}`}>
              {totals.programmeExplanation}
            </p>
          </>
        ) : null}
        <div className="grid grid-cols-[1fr_92px_92px_92px_26px] items-baseline gap-2 py-1">
          <span className="text-sm text-[#5B636E]">VAT 5%</span>
          <span className="text-right text-sm font-medium tabular-nums text-[#4A6B8A]">{fmt(totals.vatFloor)}</span>
          <span className="text-right text-sm font-medium tabular-nums">{fmt(totals.vatCalculated)}</span>
          <span className="text-right text-sm font-medium tabular-nums text-[#B8953F]">{fmt(totals.vatQuoted)}</span>
          <span />
        </div>
        <div className="mt-1 grid grid-cols-[1fr_92px_92px_92px_26px] items-baseline gap-2 border-t border-[#E2E5E9] py-2 text-[15px]">
          <span className="font-semibold">Total AED</span>
          <span className="text-right font-medium tabular-nums text-[#4A6B8A]">{fmt(totals.totalFloor)}</span>
          <span className="text-right font-medium tabular-nums">{fmt(totals.totalCalculated)}</span>
          <span className="text-right font-medium tabular-nums text-[#B8953F]">{fmt(totals.totalQuoted)}</span>
          <span />
        </div>
        <p className="pt-1 text-xs text-[#8A929C]">
          Quoted sits {deltaPct >= 0 ? "+" : ""}
          {deltaPct.toFixed(1)}% against calculated and {overFloorPct >= 0 ? "+" : ""}
          {overFloorPct.toFixed(1)}% over the cost floor.
        </p>
      </div>

      <div className="mx-7 mb-6 border-t border-[#E2E5E9] pt-3.5">
        <h3 className="mb-2 font-serif text-[15px]">Before and after on this quote</h3>
        <div className="grid grid-cols-[110px_1fr_92px] gap-2 border-b border-[#E2E5E9] py-1.5 text-xs text-[#8A929C]">
          <span>Version</span>
          <span>Status</span>
          <span className="text-right text-[#B8953F]">Quoted</span>
        </div>
        {data.revisions.map((r) => (
          <div key={r.revision} className="grid grid-cols-[110px_1fr_92px] gap-2 border-b border-[#E2E5E9] py-1.5 text-sm text-[#5B636E] last:border-b-0">
            <span>R{r.revision}</span>
            <span>{r.changed}</span>
            <span className="text-right font-medium tabular-nums text-[#B8953F]">
              {r.revision === quote.revision ? fmt(totals.totalQuoted) : r.quotedTotal === null ? "." : fmt(r.quotedTotal)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
