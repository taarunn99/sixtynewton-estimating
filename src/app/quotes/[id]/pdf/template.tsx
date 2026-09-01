// PDF layout, spec section 9. Pure presentation: every number comes from the
// engine's ledger result, nothing is calculated here.
import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { LedgerResult } from "@/lib/engine-server";

const TRN = "104670113000003";

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");
const fmtRate = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 2 });

const styles = StyleSheet.create({
  page: { paddingTop: 42, paddingBottom: 56, paddingHorizontal: 46, fontSize: 9, fontFamily: "Helvetica", color: "#1F2328" },
  wordmark: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 8, color: "#5B636E", marginTop: 2 },
  headRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  h1: { fontSize: 13, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  meta: { fontSize: 9, color: "#5B636E", marginBottom: 1 },
  table: { marginTop: 12 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#CFD4DA", paddingVertical: 4, alignItems: "flex-start" },
  th: { fontSize: 8, color: "#5B636E", fontFamily: "Helvetica-Bold" },
  cNum: { width: 22 },
  cDesc: { flex: 1, paddingRight: 8 },
  cQty: { width: 52, textAlign: "right" },
  cUnit: { width: 34, textAlign: "right", color: "#5B636E" },
  cRate: { width: 58, textAlign: "right" },
  cAmount: { width: 70, textAlign: "right" },
  detail: { fontSize: 7.5, color: "#5B636E", marginTop: 1 },
  totals: { marginTop: 8, marginLeft: "auto", width: 240 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2.5 },
  grand: { borderTopWidth: 1, borderTopColor: "#1F2328", marginTop: 3, paddingTop: 4, fontFamily: "Helvetica-Bold", fontSize: 10.5 },
  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 16, marginBottom: 4 },
  note: { fontSize: 8.5, color: "#1F2328", marginBottom: 2, lineHeight: 1.35 },
  footer: { position: "absolute", bottom: 24, left: 46, right: 46, fontSize: 7.5, color: "#8A929C", textAlign: "center" },
});

export function QuotePdf({ ledger, companyAddress }: { ledger: LedgerResult; companyAddress: string }) {
  const { quote, lines, totals } = ledger;
  const included = lines.filter((l) => l.included);
  const rate = (l: (typeof lines)[number]) => l.quoted ?? l.calculated;
  // The subtotal is the sum of the printed amounts, so the document always
  // adds up for the client. Quoted rates absorb programme uplift (in rates).
  const subtotal = included.reduce((s, l) => s + (l.isRateOnly ? 0 : rate(l) * l.qty), 0);
  const notes: string[] = [];
  if (included.some((l) => l.isRateOnly)) {
    notes.push("Rates marked TBC apply to the final area measured after completion.");
  }
  if (totals.programmeUplift > 0) {
    notes.push("The programme allowance covers the compressed schedule requested for this site.");
  }
  notes.push(`This quotation is valid for ${quote.validDays} days from the date above.`);
  notes.push(`Payment terms: ${quote.paymentTerms}.`);

  return (
    <Document title={`${quote.number} R${quote.revision}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headRow}>
          <View>
            <Text style={styles.wordmark}>Sixty Newton</Text>
            <Text style={styles.sub}>Technical Services</Text>
            <Text style={styles.sub}>{companyAddress}</Text>
            <Text style={styles.sub}>TRN {TRN}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={styles.h1}>Quotation {quote.number} R{quote.revision}</Text>
            <Text style={styles.meta}>Date {quote.quoteDate}</Text>
            <Text style={styles.meta}>Bill to {quote.clientName}</Text>
            <Text style={styles.meta}>Site {quote.siteName}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={[styles.tr, { borderBottomColor: "#1F2328", borderBottomWidth: 1 }]}>
            <Text style={[styles.th, styles.cNum]}>#</Text>
            <Text style={[styles.th, styles.cDesc]}>Description</Text>
            <Text style={[styles.th, styles.cQty]}>Qty</Text>
            <Text style={[styles.th, styles.cUnit]}>Unit</Text>
            <Text style={[styles.th, styles.cRate]}>Rate</Text>
            <Text style={[styles.th, styles.cAmount]}>Amount</Text>
          </View>
          {included.map((l, i) => (
            <View key={l.id} style={styles.tr} wrap={false}>
              <Text style={styles.cNum}>{i + 1}</Text>
              <View style={styles.cDesc}>
                <Text>{l.description}</Text>
                {l.detail ? <Text style={styles.detail}>{l.detail}</Text> : null}
              </View>
              <Text style={styles.cQty}>{l.isRateOnly ? "TBC" : fmt(l.qty)}</Text>
              <Text style={styles.cUnit}>{l.unit}</Text>
              <Text style={styles.cRate}>{fmtRate(rate(l))}</Text>
              <Text style={styles.cAmount}>{l.isRateOnly ? "TBC" : fmt(rate(l) * l.qty)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Subtotal AED</Text>
            <Text>{fmt(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>VAT 5%</Text>
            <Text>{fmt(subtotal * 0.05)}</Text>
          </View>
          <View style={[styles.totalRow, styles.grand]}>
            <Text>Total AED</Text>
            <Text>{fmt(subtotal * 1.05)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notes</Text>
        {notes.map((n, i) => (
          <Text key={i} style={styles.note}>{i + 1}. {n}</Text>
        ))}

        <Text style={styles.sectionTitle}>Terms</Text>
        <Text style={styles.note}>
          1. Sixty Newton Technical Services shall not be liable for delays arising from Force Majeure events.
        </Text>
        <Text style={styles.note}>
          2. Any alteration to the scope after issue renders the affected rates null and void until revised in writing.
        </Text>
        <Text style={styles.note}>
          3. All prices are exclusive of VAT, charged at 5% as shown above.
        </Text>
        <Text style={styles.note}>
          4. Materials remain the property of Sixty Newton Technical Services until paid for in full.
        </Text>

        <Text style={styles.footer} fixed>
          Sixty Newton Technical Services, {companyAddress}, TRN {TRN}
        </Text>
      </Page>
    </Document>
  );
}
