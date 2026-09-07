// Acceptance demo for the internal cash strip (section 7): QT-000299 R2 with
// its real material load, and a synthetic supply-heavy small quote where the
// advance falls short of material.
import { computeQuote, type LineInput } from "../src/lib/engine";
import { loadLiveQuote } from "./live-helpers";

function strip(label: string, totalQuoted: number, material: number, split: number[]) {
  const advance = (split[0] / 100) * totalQuoted;
  const names = ["Advance", "Interim", "Final"];
  console.log("\n" + label);
  console.log(
    " ",
    split.map((p, i) => `${names[i]} ${p}%: ${Math.round((p / 100) * totalQuoted).toLocaleString()}`).join("  ")
  );
  const pct = totalQuoted > 0 ? Math.round((material / (totalQuoted / 1.05)) * 100) : 0;
  console.log(
    `  Material cost ${Math.round(material).toLocaleString()}. Material is ${pct}% of the quote. Advance covers material: ` +
      (advance >= material ? "yes" : `no, short by ${Math.round(material - advance).toLocaleString()} AED`)
  );
}

async function main() {
  const r2 = await loadLiveQuote("QT-000299", 2, { includeAll: true });
  const t2 = computeQuote(r2.quoteInput, r2.ref, r2.history);
  strip("QT-000299 R2, all lines, terms 50/40/10", t2.totalQuoted, t2.materialSubtotal, [50, 40, 10]);

  // Small supply-heavy quote: tile supply bought in, material dominates
  const { ref, quoteInput } = await loadLiveQuote("QT-000299", 1, {});
  const ultraplan = [...ref.familiesById.values()].find((f) => /Ultraplan Maxi \(25/i.test(f.name))!;
  const sl = [...ref.stagesById.values()].find((s) => /Self-levelling compound/i.test(s.name))!;
  const thin = [...ref.tiersById.values()].find((t) => /thin/i.test(t.name))!;
  const line: LineInput = {
    id: "d1",
    description: "SL 18 mm supply and apply",
    qty: 120,
    unit: "sqm",
    included: true,
    quotedRate: 95,
    inputs: { thicknessMm: 18 },
    stageId: sl.id,
    familyId: ultraplan.id,
    tierId: thin.id,
  };
  const small = computeQuote({ ...quoteInput, lines: [line] }, ref);
  strip("Small quote, SL 18 mm at your price 95, terms 50/40/10", small.totalQuoted, small.materialSubtotal, [50, 40, 10]);
}
main();
