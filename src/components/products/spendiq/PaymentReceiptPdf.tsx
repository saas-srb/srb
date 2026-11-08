import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { Payment } from "@/lib/products/spendiq/payments";
import type { Invoice } from "@/lib/products/spendiq/invoices";
import type { CompanyIdentity } from "@/lib/products/spendiq/settings";
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

function ReceiptDoc({ payment, invoice, company }: { payment: Payment; invoice: Invoice; company: CompanyIdentity }) {
  return (
    <Document title={`Payment Receipt ${payment.paymentCode}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title="PAYMENT RECEIPT"
          reference={`${payment.paymentCode}\n${fmtDate(payment.paymentDate.toISOString().slice(0, 10))}`}
          registrations={company.gstin ? [`GSTIN: ${company.gstin}`] : undefined}
        />

        <Text style={s.label}>Paid to</Text>
        <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 2 }}>{payment.vendorName}</Text>

        <Text style={s.label}>Against invoice</Text>
        <View style={s.row}><Text style={s.small}>Our invoice ref</Text><Text>{invoice.invoiceNumber}</Text></View>
        <View style={s.row}><Text style={s.small}>Vendor invoice</Text><Text>{invoice.vendorInvoiceNumber ?? "—"}</Text></View>
        <View style={s.row}><Text style={s.small}>Invoice net payable</Text><Text>{money(invoice.netPayable, invoice.currency)}</Text></View>

        <Text style={s.label}>Payment</Text>
        <View style={s.row}><Text style={s.small}>Method</Text><Text style={{ textTransform: "capitalize" }}>{payment.method.replace(/_/g, " ")}</Text></View>
        <View style={s.row}><Text style={s.small}>Transaction reference</Text><Text>{payment.transactionReference ?? "—"}</Text></View>
        {payment.tdsDeducted > 0 && <View style={s.row}><Text style={s.small}>TDS deducted</Text><Text>{money(payment.tdsDeducted, invoice.currency)}</Text></View>}
        <View style={s.grand}><Text>Amount paid</Text><Text>{money(payment.amount, invoice.currency)}</Text></View>

        <PdfFooter note="System-generated payment receipt." />
      </Page>
    </Document>
  );
}

export async function renderPaymentReceiptPdf(payment: Payment, invoice: Invoice, company: CompanyIdentity): Promise<Buffer> {
  return renderPdf(<ReceiptDoc payment={payment} invoice={invoice} company={company} />);
}
