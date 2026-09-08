// Generates the How to Quote recipe book PDF. Static content, checked against
// the live stage catalogue names. Run via: npm run howto
import { Document, Page, StyleSheet, Text, View, renderToFile } from "@react-pdf/renderer";

interface Step {
  n: string;
  note?: string;
  optional?: boolean;
}
interface Recipe {
  title: string;
  when: string;
  steps: Step[];
  close?: string;
}

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 44, paddingHorizontal: 42, fontSize: 9.5, fontFamily: "Helvetica", color: "#1C1713" },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  sub: { fontSize: 10, color: "#96772B", marginBottom: 10 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#96772B", marginTop: 14, marginBottom: 2 },
  when: { fontSize: 8.5, color: "#8A7E68", marginBottom: 4 },
  step: { flexDirection: "row", marginBottom: 2.5, paddingLeft: 2 },
  num: { width: 18, fontFamily: "Helvetica-Bold", color: "#5B636E" },
  stage: { flex: 1 },
  opt: { color: "#8A7E68" },
  note: { color: "#5B636E", fontSize: 8.5 },
  close: { fontSize: 8.5, color: "#96772B", marginTop: 3, paddingLeft: 20 },
  box: { borderWidth: 1, borderColor: "#C2A05C", borderRadius: 6, padding: 10, marginTop: 8, backgroundColor: "#FAF7EF" },
  footer: { position: "absolute", bottom: 20, left: 42, right: 42, fontSize: 7.5, color: "#8A7E68", flexDirection: "row", justifyContent: "space-between" },
});

const RECIPES: Recipe[] = [
  {
    title: "Waterproofing, liquid or cementitious (wet areas, roofs, tanks)",
    when: "Mapelastic, Purtop, CM210 and similar brush, roller or spray systems.",
    steps: [
      { n: "Demolition and removal (Cross-discipline)", note: "[sqm] renovation only", optional: true },
      { n: "Site survey and moisture test", note: "[lump]", optional: true },
      { n: "Substrate preparation (grind, repair, dust extraction)", note: "[sqm] skip on a new clean slab; its labour auto-absorbs when a coat line is present", optional: true },
      { n: "Primer", note: "[sqm]" },
      { n: "Membrane coat 1 (brush or roller)", note: "[sqm] pick the product; set coats, or thickness mm for sprayed Purtop" },
      { n: "Reinforcement mesh embed", note: "[sqm] systems with mesh, e.g. Mapelastic Smart with Mapenet", optional: true },
      { n: "Membrane coat 2", note: "[sqm] use either this line or coats 2 on coat 1, never both", optional: true },
      { n: "Detailing (corners, penetrations, upstands)", note: "[lm]" },
      { n: "Cure and flood test", note: "[lump] price 0 is fine, always show it" },
      { n: "Protection screed (≥ 50 mm)", note: "[sqm] trafficked roofs", optional: true },
      { n: "Handover IR and documentation", note: "[lump]", optional: true },
    ],
    close: "Then the standard close-out on the last page.",
  },
  {
    title: "Bitumen torch membrane (roofs, podiums, planters)",
    when: "Awazel and similar torch-applied SBS rolls.",
    steps: [
      { n: "Bituminous primer", note: "[sqm]" },
      { n: "Torch-applied membrane layer 1 (4 mm)", note: "[sqm]" },
      { n: "Membrane layer 2 offset 50% (where 4+4)", note: "[sqm] 4+4 spec only", optional: true },
      { n: "Anti-root membrane", note: "[sqm] planters and green roofs", optional: true },
      { n: "Geotextile separator 300 gsm", note: "[sqm]", optional: true },
      { n: "Protection board", note: "[sqm] the calculator warns if a torch membrane has no protection" },
      { n: "Flood test and IR", note: "[lump]" },
    ],
  },
  {
    title: "Tiling and marble",
    when: "Floor and wall tile, porcelain, slabs, marble.",
    steps: [
      { n: "Substrate flatness verdict SR1/SR2/SR3", note: "[sqm] SR2/SR3 means add an SL line from SL & screed first", optional: true },
      { n: "Grout removal (regrout jobs)", note: "[sqm] regrout only", optional: true },
      { n: "Adhesive (notched + back-butter ≥ 95%)", note: "[sqm] this is the install line: set tile size W x H cm (drives adhesive, grout and the labour ladder), tick Wall if wall, tick Material by client if client tiles" },
      { n: "Tile or stone supply", note: "[sqm] only when we supply the tile, bought-in cost", optional: true },
      { n: "Levelling clips and wedges", note: "[sqm] large format", optional: true },
      { n: "Cementitious grout OR Epoxy grout", note: "[sqm] pick one; tile size drives consumption" },
      { n: "Perimeter and movement joint sealant", note: "[lm]" },
      { n: "Marble pre-seal and impregnator", note: "[sqm] marble only", optional: true },
      { n: "Sound test", note: "[sqm]", optional: true },
    ],
  },
  {
    title: "Epoxy flooring",
    when: "Warehouses, parking, F&B. Mapefloor and similar.",
    steps: [
      { n: "Moisture test and survey", note: "[lump]", optional: true },
      { n: "Shotblast or grind and vacuum", note: "[sqm] the calculator nags any resin floor without preparation" },
      { n: "Crack and joint repair", note: "[lm]", optional: true },
      { n: "Primer", note: "[sqm]" },
      { n: "Body coat self-levelling 2 to 3 mm", note: "[sqm] set thickness mm and coats" },
      { n: "Broadcast quartz or flake", note: "[sqm] anti-slip or decorative", optional: true },
      { n: "Top sealer × 2 coats (UV-stable PU)", note: "[sqm]", optional: true },
      { n: "PU-cement heavy duty 6 to 9 mm (F&B, cold rooms)", note: "[sqm] replaces primer + body coat for heavy duty", optional: true },
      { n: "Coving", note: "[lm] F&B and washdown areas", optional: true },
      { n: "Cure schedule", note: "[sqm] no charge, shows the client the programme is real", optional: true },
    ],
  },
  {
    title: "Self-levelling and screed",
    when: "Ultraplan, Topcem, Vetotop. Thickness drives material one to one.",
    steps: [
      { n: "Edge banding and dams", note: "[lm]", optional: true },
      { n: "Substrate primer", note: "[sqm]" },
      { n: "Self-levelling compound 3 to 50 mm", note: "[sqm] set the thickness in mm; 10 mm carries five times the material of 2 mm" },
      { n: "Cementitious screed 20 to 100 mm", note: "[sqm] use instead of SL for thick builds; thickness in cm", optional: true },
      { n: "Flatness check and handover", note: "[lump]", optional: true },
    ],
  },
  {
    title: "Microtopping and microcement",
    when: "Ultratop Loft, Kerakoll decorative systems.",
    steps: [
      { n: "Bond test and bonding primer", note: "[sqm]" },
      { n: "Base coat 1 with fibreglass mesh", note: "[sqm] set base mm and number of base coats on the line" },
      { n: "Base coat 2", note: "[sqm] when the system needs a separate second base", optional: true },
      { n: "Finish coat (tonal trowel)", note: "[sqm] set finish mm" },
      { n: "Sand and clean", note: "[sqm]" },
      { n: "PU sealer × 2 (matte, satin, gloss)", note: "[sqm] set sealer coats" },
    ],
  },
  {
    title: "Vinyl flooring",
    when: "LVT planks and sheet.",
    steps: [
      { n: "SL skim to SR1", note: "[sqm]" },
      { n: "Moisture barrier", note: "[sqm]", optional: true },
      { n: "Adhesive (glue-down)", note: "[sqm]" },
      { n: "Planks or sheet", note: "[sqm] supply, bought-in cost" },
      { n: "Thresholds, skirting, scotia", note: "[lm]" },
    ],
  },
  {
    title: "Design concrete and polishing",
    when: "Ultratop pours, stamped, polished concrete.",
    steps: [
      { n: "SL screed if needed", note: "[sqm]", optional: true },
      { n: "Ultratop design pour", note: "[sqm]" },
      { n: "Stamp or colour-harden", note: "[sqm]", optional: true },
      { n: "Wet cure under fleece", note: "[sqm]" },
      { n: "Grind and hone ladder", note: "[sqm]" },
      { n: "Densifier", note: "[sqm]" },
      { n: "UV-stable PU sealer × 2", note: "[sqm]" },
      { n: "For polish-only jobs: Grind, hone, polish grit ladder 30 to 3000 + Crystallise or seal (Polishing)", note: "[sqm]" },
    ],
  },
  {
    title: "Sealants and joints",
    when: "Expansion joints, perimeter joints. Priced per lm.",
    steps: [
      { n: "Joint geometry survey", note: "[lm]", optional: true },
      { n: "Backer rod", note: "[lm]" },
      { n: "Masking", note: "[lm]", optional: true },
      { n: "Primer (where required)", note: "[lm]", optional: true },
      { n: "Sealant gun-applied and tooled", note: "[lm] set joint width and depth mm on the line" },
    ],
  },
  {
    title: "Repair and restoration",
    when: "Concrete repair, injection, strengthening.",
    steps: [
      { n: "Site survey and NDT (crack width, half-cell, carbonation, cover)", note: "[lump]" },
      { n: "Root-cause report and method statement", note: "[lump]", optional: true },
      { n: "Chip back, clean, treat rebar", note: "[sqm]" },
      { n: "Crack injection epoxy or PU", note: "[lm]", optional: true },
      { n: "Repair mortar (spalls)", note: "[sqm]" },
      { n: "Leak plugging", note: "[nos]", optional: true },
      { n: "CFRP strengthening", note: "[lm] engineer specified", optional: true },
      { n: "Surface restoration to match", note: "[sqm]" },
    ],
  },
  {
    title: "Painting",
    when: "Internal decorative painting.",
    steps: [
      { n: "Surface inspection and repair", note: "[sqm]" },
      { n: "Stucco putty 1 to 2 coats, sanded", note: "[sqm]", optional: true },
      { n: "Primer", note: "[sqm]" },
      { n: "Topcoat × 2 with light sand between", note: "[sqm] set coats" },
      { n: "Snag, clean-up, handover", note: "[lump]", optional: true },
    ],
  },
  {
    title: "Insulation",
    when: "Roofs and walls.",
    steps: [
      { n: "Spray PU foam closed cell OR EPS / XPS / mineral wool boards", note: "[sqm] pick the system" },
      { n: "Board adhesive and mechanical fixings", note: "[sqm] board systems", optional: true },
      { n: "Detailing and UV topcoat or cladding", note: "[sqm]", optional: true },
    ],
  },
];

const CLOSE_OUT: Step[] = [
  { n: "Demolition and removal", note: "[sqm] renovation jobs, from Cross-discipline", optional: true },
  { n: "Garbage disposal and protection", note: "[lump] type your price, it passes through" },
  { n: "Scaffolding and access", note: "[lump] height or facade work", optional: true },
  { n: "Mobilisation and transport", note: "[lump] islands and remote sites; the logistics suggestion helps", optional: true },
  { n: "Permits, gate pass, NOC", note: "[lump] hotels, malls, gated areas", optional: true },
];

const FLOW: Step[] = [
  { n: "New quote: client, site, site profile (island, hotel, villa: this one choice multiplies all labour)" },
  { n: "Add the discipline recipe lines from this book, in order, skipping the ones marked optional that do not apply" },
  { n: "Type the quantity on every line; set the line inputs named in brackets (thickness, tile size, coats, joint size)" },
  { n: "Check labour: the grey suggestion per line, or type the head contractor total in the gold box and it spreads itself" },
  { n: "Variables panel: deadline and site hours if the client gave a programme; occupied building; night work" },
  { n: "Type Your price in the gold column per line; red flag means below our cost, amber means below suggestion" },
  { n: "Internal strip: check the advance covers material" },
  { n: "Preview PDF, then Issue. Changes after issue become R2" },
];

function StepRow({ step, i }: { step: Step; i: number }) {
  return (
    <View style={s.step} wrap={false}>
      <Text style={s.num}>{i + 1}.</Text>
      <Text style={s.stage}>
        {step.n}
        {step.optional ? <Text style={s.opt}> (optional)</Text> : null}
        {step.note ? <Text style={s.note}>  {step.note}</Text> : null}
      </Text>
    </View>
  );
}

const chrome = (gen: string) => [
  <View key="f" style={s.footer} fixed>
    <Text>Sixty Newton, how to quote, {gen}</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>,
];

function HowTo({ generated }: { generated: string }) {
  return (
    <Document title="Sixty Newton, how to quote">
      <Page size="A4" style={s.page}>
        {chrome(generated)}
        <Text style={s.h1}>How to quote, discipline by discipline</Text>
        <Text style={s.sub}>The recipe book: which lines to add, in order, and which inputs to set. Stage names match the picker exactly.</Text>
        <View style={s.box}>
          <Text style={[s.h2, { marginTop: 0 }]}>Every quote, the same eight moves</Text>
          {FLOW.map((f, i) => (
            <StepRow key={i} step={f} i={i} />
          ))}
        </View>
        <View style={s.box}>
          <Text style={[s.h2, { marginTop: 0 }]}>Every quote ends with the close-out lines</Text>
          {CLOSE_OUT.map((f, i) => (
            <StepRow key={i} step={f} i={i} />
          ))}
          <Text style={[s.note, { marginTop: 4 }]}>
            Lumps have no engine price: whatever you type passes through. Put the basis in the description (21 days scaffolding, 6 skips) so the next person understands the number.
          </Text>
        </View>
      </Page>
      {RECIPES.map((r) => (
        <Page key={r.title} size="A4" style={s.page}>
          {chrome(generated)}
          <Text style={s.h2}>{r.title}</Text>
          <Text style={s.when}>{r.when}</Text>
          {r.steps.map((st, i) => (
            <StepRow key={i} step={st} i={i} />
          ))}
          <Text style={s.close}>{r.close ?? "Then the close-out lines and the eight moves from page 1."}</Text>
        </Page>
      ))}
    </Document>
  );
}

async function main() {
  const generated = new Date().toISOString().slice(0, 10);
  await renderToFile(HowTo({ generated }), "docs/HowToQuote.pdf");
  console.log("docs/HowToQuote.pdf written");
}
main();
