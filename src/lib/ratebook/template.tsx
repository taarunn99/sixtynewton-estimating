// The Sixty Newton Rate Book, A4 landscape, INTERNAL on every page. Pure
// presentation over collectRateBook data; nothing computed here.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { RateBookData, RateBookRow } from "./data";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const r1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("en-US");

const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 28, fontSize: 7, fontFamily: "Helvetica", color: "#1C1713" },
  internal: { position: "absolute", top: 12, right: 28, fontSize: 8, color: "#A83232", fontFamily: "Helvetica-Bold" },
  footer: { position: "absolute", bottom: 16, left: 28, right: 28, fontSize: 7, color: "#8A7E68", flexDirection: "row", justifyContent: "space-between" },
  h1: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  h2: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 4, color: "#96772B" },
  disc: { fontSize: 11, fontFamily: "Helvetica-Bold", backgroundColor: "#F4F1EA", padding: 4, marginTop: 8, marginBottom: 2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#DDD6C7", paddingVertical: 3, alignItems: "flex-start" },
  trReview: { backgroundColor: "#FBF1E0" },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: "#5B636E" },
  cStage: { width: 90, paddingRight: 4 },
  cProduct: { width: 120, paddingRight: 4 },
  cCoverage: { width: 100, paddingRight: 4 },
  cMaterial: { width: 90, paddingRight: 4 },
  cLabour: { width: 130, paddingRight: 4 },
  cRates: { width: 80, paddingRight: 4 },
  cEvidence: { width: 105, paddingRight: 4 },
  cCorrection: { flex: 1, borderLeftWidth: 0.5, borderLeftColor: "#DDD6C7", paddingLeft: 4, minHeight: 22 },
  dim: { color: "#8A7E68" },
  small: { fontSize: 6.2 },
  cover: { fontSize: 10, lineHeight: 1.5, marginTop: 6 },
});

function Row({ row }: { row: RateBookRow }) {
  return (
    <View style={[s.tr, ...(row.review ? [s.trReview] : [])]} wrap={false}>
      <View style={s.cStage}>
        <Text>{row.stage}</Text>
        {row.review ? <Text style={{ color: "#A83232", fontFamily: "Helvetica-Bold" }}>review</Text> : null}
      </View>
      <View style={s.cProduct}>
        <Text>{row.family ?? "labour only"}</Text>
        {row.repItem ? <Text style={[s.dim, s.small]}>{row.brand ? row.brand + ", " : ""}{row.repItem}</Text> : null}
        {row.pack && row.snCostPerPack !== null ? (
          <Text style={s.small}>
            {row.pack} at {fmt(row.snCostPerPack)}/pack{row.snCostPerUnit !== null ? `, ${r1(row.snCostPerUnit)}/unit` : ""}
          </Text>
        ) : null}
      </View>
      <View style={s.cCoverage}>
        <Text>{row.coverage}</Text>
        <Text style={[s.dim, s.small]}>{row.defaults}; {row.source || "no source"} {row.confidence}</Text>
      </View>
      <View style={s.cMaterial}>
        <Text>{row.materialPerUnit > 0 ? `${r1(row.materialPerUnit)}/${row.unit}` : "0"}</Text>
        <Text style={[s.dim, s.small]}>{row.materialDerivation}</Text>
        {row.thicknessSweep ? (
          <Text style={s.small}>{row.thicknessSweep.map((t) => `${t.label}: ${r1(t.material)}`).join("  ")}</Text>
        ) : null}
      </View>
      <View style={s.cLabour}>
        {row.labourHistory ? (
          <Text>
            history {r1(row.labourHistory.median)} ({row.labourHistory.count} quotes: {row.labourHistory.quotes.map((q) => q.quoteNumber).join(", ")})
          </Text>
        ) : (
          <Text style={s.dim}>no past quotes</Text>
        )}
        <Text style={s.small}>engine {r1(row.labourEngine)}; {row.labourLeads} leads</Text>
      </View>
      <View style={s.cRates}>
        <Text>S+A {fmt(row.supplyRate)}/{row.unit}</Text>
        <Text>App only {fmt(row.applicationOnlyRate)}</Text>
        {row.thicknessSweep ? (
          <Text style={s.small}>{row.thicknessSweep.map((t) => `${t.label}: ${fmt(t.supply)}`).join("  ")}</Text>
        ) : null}
      </View>
      <View style={s.cEvidence}>
        {row.evidence.length ? (
          row.evidence.map((e, i) => (
            <Text key={i} style={s.small}>
              {e.quoteNumber} {e.date} {fmt(e.rate)}{e.client ? `, ${e.client}` : ""}
            </Text>
          ))
        ) : (
          <Text style={[s.dim, s.small]}>engine only</Text>
        )}
      </View>
      <View style={s.cCorrection}>
        <Text style={[s.dim, s.small]}> </Text>
      </View>
    </View>
  );
}

function Head() {
  return (
    <View style={s.tr}>
      <Text style={[s.th, s.cStage]}>Stage</Text>
      <Text style={[s.th, s.cProduct]}>Product and pack</Text>
      <Text style={[s.th, s.cCoverage]}>Coverage and defaults</Text>
      <Text style={[s.th, s.cMaterial]}>Material per unit</Text>
      <Text style={[s.th, s.cLabour]}>Labour, history vs engine</Text>
      <Text style={[s.th, s.cRates]}>Rates</Text>
      <Text style={[s.th, s.cEvidence]}>Evidence</Text>
      <Text style={[s.th, s.cCorrection]}>Contractor correction</Text>
    </View>
  );
}

const chrome = (generated: string) => [
  <Text key="internal" style={s.internal} fixed>
    INTERNAL
  </Text>,
  <View key="footer" style={s.footer} fixed>
    <Text>SixtyNewton internal rate book, generated {generated}</Text>
    <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
  </View>,
];

export function RateBookPdf({ data }: { data: RateBookData }) {
  const disciplines: string[] = [];
  for (const r of data.rows) if (!disciplines.includes(r.discipline)) disciplines.push(r.discipline);
  const zero = data.coverage.filter((c) => c.points === 0);
  const some = data.coverage.filter((c) => c.points > 0).sort((a, b) => b.points - a.points);

  return (
    <Document title={`Sixty Newton rate book ${data.generated}`}>
      <Page size="A4" orientation="landscape" style={s.page}>
        {chrome(data.generated)}
        <Text style={s.h1}>The Sixty Newton Rate Book</Text>
        <Text style={{ fontSize: 11, color: "#96772B" }}>Every number the estimating system holds, for line by line review. Generated {data.generated}.</Text>
        <Text style={s.h2}>Data sources</Text>
        <Text style={s.cover}>{data.syncNote}.</Text>
        <Text style={s.h2}>Settings in force</Text>
        <Text style={s.cover}>
          Intercompany factor {data.settings.intercompany} on Books costs. Overhead {data.settings.overheadPct}% on material. Margin {data.settings.marginPct}% on supply and application prices. VAT {data.settings.vatPct}%, always exclusive.
        </Text>
        <Text style={s.h2}>For the contractor reviewing this</Text>
        <Text style={s.cover}>
          1. Correct any number that is wrong, in the blank column.{"\n"}
          2. Cross out work we never do.{"\n"}
          3. Add missing work in the margin of the page.{"\n"}
          4. Shaded rows marked review are where past quotes and the cost build-up disagree by more than a quarter: check those hardest.{"\n"}
          5. Rates marked engine only have no past quotation behind them yet.
        </Text>
      </Page>

      {disciplines.map((d) => (
        <Page key={d} size="A4" orientation="landscape" style={s.page}>
          {chrome(data.generated)}
          <Text style={s.disc}>{d}</Text>
          <Head />
          {data.rows.filter((r) => r.discipline === d).map((r, i) => (
            <Row key={i} row={r} />
          ))}
          {d === "Tiling & marble" && data.tilingLadder.length ? (
            <View style={{ marginTop: 8 }}>
              <Text style={s.h2}>Tiling labour ladder, AED per sqm, application labour</Text>
              <View style={s.tr}>
                <Text style={[s.th, { width: 80 }]}>Tile size</Text>
                {data.tilingLadder.map((l) => (
                  <Text key={l.size} style={[s.th, { width: 60 }]}>{l.size}</Text>
                ))}
              </View>
              <View style={s.tr}>
                <Text style={{ width: 80 }}>Floor</Text>
                {data.tilingLadder.map((l) => (
                  <Text key={l.size} style={{ width: 60 }}>{r1(l.floor)}</Text>
                ))}
              </View>
              <View style={s.tr}>
                <Text style={{ width: 80 }}>Wall</Text>
                {data.tilingLadder.map((l) => (
                  <Text key={l.size} style={{ width: 60 }}>{r1(l.wall)}</Text>
                ))}
              </View>
            </View>
          ) : null}
        </Page>
      ))}

      <Page size="A4" orientation="landscape" style={s.page}>
        {chrome(data.generated)}
        <Text style={s.h1}>Variables and adjustments</Text>
        <Text style={s.h2}>Programme compression, worked example</Text>
        <Text style={s.cover}>
          30 crew-days at 8 hours is 240 crew-hours. A site allowing 6 hours a day on a 6 day week over 15 calendar days gives 77 hours per crew, so 4 crews run at once: congestion adds 30% on the works, mobilisation and tools go times 4, and supervision runs all 15 days.
        </Text>
        <Text style={s.h2}>Occupied building</Text>
        <Text style={s.cover}>Productivity factor 0.85: suggested rates on affected lines rise about 18%. Never applied to figures typed by the estimator.</Text>
        <Text style={s.h2}>Night work</Text>
        <Text style={s.cover}>Prefilled at 10% on the works subtotal, editable per quote.</Text>
        <Text style={s.h2}>Upper floor or roof</Text>
        <Text style={s.cover}>Multiplies affected line prices by 1.15, editable up to 1.20.</Text>
        <Text style={s.h2}>Island logistics, Al Maya reference</Text>
        <Text style={s.cover}>
          Trucks of 4 tons at 2,000 AED each; island sites add a barge at 200 AED per ton. The Al Maya Island 2026 job: 80 tons, 16,000 AED barge. Under 1 ton goes by pickup.
        </Text>
      </Page>

      <Page size="A4" orientation="landscape" style={s.page}>
        {chrome(data.generated)}
        <Text style={s.h1}>Suggestion coverage</Text>
        <Text style={s.h2}>These numbers are engine-only, check hardest here ({zero.length} stages)</Text>
        <Text style={s.cover}>
          {zero.map((c) => `${c.discipline}: ${c.stage}`).join("  |  ")}
        </Text>
        <Text style={s.h2}>Backed by past quotations ({some.length} stages)</Text>
        {some.map((c) => (
          <View key={c.stage + c.discipline} style={s.tr}>
            <Text style={{ width: 300 }}>{c.discipline}: {c.stage}</Text>
            <Text style={{ width: 80 }}>{c.points} points</Text>
            <Text style={{ width: 100 }}>median {c.median !== null ? fmt(c.median) : ""}</Text>
          </View>
        ))}
      </Page>

      <Page size="A4" orientation="landscape" style={s.page}>
        {chrome(data.generated)}
        <Text style={[s.h1, { color: "#A83232" }]}>Confidential, internal only</Text>
        <Text style={s.cover}>
          This page never leaves the company. It is what we pay, not what we charge.
        </Text>
        {data.confidential.map((c, i) => (
          <Text key={i} style={[s.cover, { marginTop: 4 }]}>{c}</Text>
        ))}
      </Page>
    </Document>
  );
}
