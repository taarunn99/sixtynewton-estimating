// One-off acceptance demonstration for docs/UPDATE_LABOUR_MODEL.md section 6,
// run against live reference data. Prints the three required scenarios.
import { computeLine, computeQuote, type LineInput } from "../src/lib/engine";
import { loadLiveQuote } from "./live-helpers";

async function main() {
  // Live reference data via R1's loader; synthetic demo lines
  const { ref, quoteInput } = await loadLiveQuote("QT-000299", 1, {});
  const stages = [...ref.stagesById.values()];
  const sl = stages.find((s) => s.discipline === "SL & screed" && /level/i.test(s.name))!;
  const tiling = stages.find((s) => s.discipline === "Tiling & marble" && /adhesive/i.test(s.name))!;
  const ultraplan = [...ref.familiesById.values()].find((f) => /Ultraplan Eco 20/i.test(f.name))!;
  const keraflex = [...ref.familiesById.values()].find((f) => /Keraflex Maxi/i.test(f.name))!;
  const thinTier = [...ref.tiersById.values()].find((t) => /thin/i.test(t.name))!;
  const heavyTier = [...ref.tiersById.values()].find((t) => /heavy/i.test(t.name))!;

  let n = 0;
  const mk = (over: Partial<LineInput>): LineInput => ({
    id: `demo${++n}`,
    description: "demo",
    qty: 100,
    unit: "sqm",
    included: true,
    inputs: {},
    ...over,
  });
  const show = (label: string, b: ReturnType<typeof computeLine>) =>
    console.log(
      label.padEnd(30),
      `material ${b.materialPerUnit.toFixed(1)}`.padEnd(15),
      `labour ${b.labourPerUnit.toFixed(1)} (${b.labourSource})`.padEnd(30),
      `our cost ${b.floorPerUnit}`.padEnd(14),
      `suggested ${b.calculatedPerUnit}`
    );

  const q = { ...quoteInput, lines: [] as LineInput[] };
  console.log("Site profile: island x" + quoteInput.siteProfile.labourMultiplier);
  console.log("\n1. SL line, Ultraplan Eco 20, 2 mm vs 10 mm");
  show("  2 mm", computeLine(mk({ familyId: ultraplan.id, tierId: thinTier.id, stageId: sl.id, inputs: { thicknessMm: 2 } }), q, ref));
  show("  10 mm", computeLine(mk({ familyId: ultraplan.id, tierId: thinTier.id, stageId: sl.id, inputs: { thicknessMm: 10 } }), q, ref));

  console.log("\n2. Tiling line, Keraflex, 60x60 floor vs 120x120 wall");
  show("  60x60 floor", computeLine(mk({ familyId: keraflex.id, tierId: heavyTier.id, stageId: tiling.id, inputs: { tileWidthMm: 600, tileLengthMm: 600 } }), q, ref));
  show("  120x120 wall", computeLine(mk({ familyId: keraflex.id, tierId: heavyTier.id, stageId: tiling.id, inputs: { tileWidthMm: 1200, tileLengthMm: 1200, wallInstallation: true } }), q, ref));

  console.log("\n3. Job total labour box: two lines, suggestions equal weights 100 and 300 sqm, job total 20,000");
  const a = mk({ familyId: ultraplan.id, tierId: thinTier.id, stageId: sl.id, qty: 100, inputs: { thicknessMm: 4 } });
  const b = mk({ familyId: ultraplan.id, tierId: thinTier.id, stageId: sl.id, qty: 300, inputs: { thicknessMm: 4 } });
  const totals = computeQuote({ ...q, lines: [a, b], labourJobTotal: 20000 }, ref);
  console.log("  suggested total (greyed):", Math.round(totals.labourSuggestedTotal));
  console.log("  line A labour/unit:", totals.lines[0].labourPerUnit.toFixed(2), `(${totals.lines[0].labourSource})`, "line total", Math.round(totals.lines[0].labourPerUnit * 100));
  console.log("  line B labour/unit:", totals.lines[1].labourPerUnit.toFixed(2), `(${totals.lines[1].labourSource})`, "line total", Math.round(totals.lines[1].labourPerUnit * 300));
  const bOver = { ...b, inputs: { ...b.inputs, labourOverride: 30 } };
  const t2 = computeQuote({ ...q, lines: [a, bOver], labourJobTotal: 20000 }, ref);
  console.log("  after editing line B to 30:", t2.lines[1].labourPerUnit, `(${t2.lines[1].labourSource})`, "; line A stays", t2.lines[0].labourPerUnit.toFixed(2), `(${t2.lines[0].labourSource})`);
}
main();
