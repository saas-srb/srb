import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { Receipt } from "@/lib/products/cashflow-ai/receipts";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

const C = PDF_COLORS;

function money(n: number, c: string) {
  return `${c} ${(Math.round((n || 0) * 100) / 100).toLocaleString("en-IN")}`;
}
function fmtDate(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line },
  label: { ...pdfSheet.label, marginTop: 16 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.ink, fontFamily: "Helvetica-Bold", fontSize: 12 },
}));

function ReceiptDoc({ receipt }: { receipt: Receipt }) {
  return (
    <Document title={`Receipt ${receipt.receiptNumber}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead title="PAYMENT RECEIPT" reference={`${receipt.receiptNumber}\n${fmtDate(receipt.receiptDate.toISOString().slice(0, 10))}`} />

        <Text style={s.label}>Received from</Text>
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{receipt.customerName}</Text>

        <Text style={s.label}>Payment</Text>
        <View style={s.row}><Text style={s.small}>Method</Text><Text style={{ textTransform: "capitalize" }}>{receipt.method.replace(/_/g, " ")}</Text></View>
        <View style={s.row}><Text style={s.small}>Transaction reference</Text><Text>{receipt.transactionReference ?? "—"}</Text></View>

        {receipt.allocations.length > 0 && (
          <>
            <Text style={s.label}>Applied against</Text>
            {receipt.allocations.map((a) => (
              <View key={a.invoiceId} style={s.row}>
                <Text style={s.small}>{a.invoiceNumber}</Text>
                <Text>{money(a.amount, receipt.currency)}</Text>
              </View>
            ))}
          </>
        )}
        {receipt.advanceAmount > 0.01 && (
          <View style={s.row}><Text style={s.small}>Unapplied advance</Text><Text>{money(receipt.advanceAmount, receipt.currency)}</Text></View>
        )}

        <View style={s.grand}><Text>Amount received</Text><Text>{money(receipt.amount, receipt.currency)}</Text></View>

        <PdfFooter note="System-generated payment receipt." />
      </Page>
    </Document>
  );
}

export async function renderReceiptPdf(receipt: Receipt): Promise<Buffer> {
  return renderPdf(<ReceiptDoc receipt={receipt} />);
}
