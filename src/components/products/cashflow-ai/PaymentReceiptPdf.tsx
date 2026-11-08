import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";
import type { PublicReceipt } from "@/lib/products/cashflow-ai/payments/public-receipt";

const C = PDF_COLORS;
const money = (n: number, c: string) => `${c} ${(Math.round((n || 0) * 100) / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line },
  label: { ...pdfSheet.label, marginTop: 16 },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.ink, fontFamily: "Helvetica-Bold", fontSize: 12 },
}));

function Doc({ r }: { r: PublicReceipt }) {
  return (
    <Document title={`Receipt ${r.number}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead title="PAYMENT RECEIPT" reference={`${r.number}\n${when(r.paidAt)}`} />

        <Text style={s.label}>Received from</Text>
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{r.customerName}</Text>
        {r.customerEmail ? <Text style={s.small}>{r.customerEmail}</Text> : null}

        <Text style={s.label}>Payment</Text>
        <View style={s.row}><Text style={s.small}>For</Text><Text>{r.title}</Text></View>
        <View style={s.row}><Text style={s.small}>Payment method</Text><Text>{r.method}</Text></View>
        <View style={s.row}><Text style={s.small}>Payment reference</Text><Text>{r.paymentNumber}</Text></View>
        {r.gatewayPaymentId ? <View style={s.row}><Text style={s.small}>Razorpay payment id</Text><Text>{r.gatewayPaymentId}</Text></View> : null}
        {r.utr ? <View style={s.row}><Text style={s.small}>Bank reference (UTR / RRN)</Text><Text>{r.utr}</Text></View> : null}
        <View style={s.row}><Text style={s.small}>Status</Text><Text>Paid</Text></View>

        <View style={s.grand}><Text>Amount received</Text><Text>{money(r.amount, r.currency)}</Text></View>

        <PdfFooter note="This is a computer-generated receipt and does not need a signature." />
      </Page>
    </Document>
  );
}

export async function renderPublicReceiptPdf(r: PublicReceipt): Promise<Buffer> {
  return renderPdf(<Doc r={r} />);
}
