import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { Invoice } from "@/lib/products/cashflow-ai/invoices";
import { invoiceBalance } from "@/lib/products/cashflow-ai/invoices";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

const C = PDF_COLORS;

function money(n: number, currency: string): string {
  return `${currency} ${(Math.round((n || 0) * 100) / 100).toLocaleString("en-IN")}`;
}
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  cols: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  label: pdfSheet.label,
  value: pdfSheet.value,
  tHead: { ...pdfSheet.tHead, marginTop: 16 },
  tRow: pdfSheet.tRow,
}));

function InvoiceDocument({ invoice }: { invoice: Invoice }) {
  const balance = invoiceBalance(invoice);
  return (
    <Document title={`Invoice ${invoice.invoiceNumber}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead title="INVOICE" reference={`${invoice.invoiceNumber}\n${fmtDate(invoice.invoiceDate)}`} />

        <View style={s.cols}>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Billed to</Text>
            <Text style={s.value}>{invoice.customerName}</Text>
          </View>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Due date</Text>
            <Text style={s.value}>{fmtDate(invoice.dueDate)}</Text>
            {invoice.paymentTerms ? <Text style={s.small}>Terms: {invoice.paymentTerms}</Text> : null}
            {invoice.poNumber ? <Text style={s.small}>PO: {invoice.poNumber}</Text> : null}
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={{ flex: 1 }}>Description</Text>
          <Text style={{ width: 45, textAlign: "right" }}>Qty</Text>
          <Text style={{ width: 70, textAlign: "right" }}>Unit</Text>
          <Text style={{ width: 40, textAlign: "right" }}>Tax</Text>
          <Text style={{ width: 75, textAlign: "right" }}>Amount</Text>
        </View>
        {invoice.items.map((it, i) => (
          <View key={i} style={s.tRow}>
            <Text style={{ flex: 1 }}>{it.description}{it.hsnSac ? `  (HSN/SAC ${it.hsnSac})` : ""}</Text>
            <Text style={{ width: 45, textAlign: "right" }}>{it.quantity}</Text>
            <Text style={{ width: 70, textAlign: "right" }}>{money(it.unitPrice, invoice.currency)}</Text>
            <Text style={{ width: 40, textAlign: "right" }}>{it.taxRate}%</Text>
            <Text style={{ width: 75, textAlign: "right" }}>{money(it.lineTotal, invoice.currency)}</Text>
          </View>
        ))}

        <View style={pdfSheet.totalsBox}>
          <View style={pdfSheet.totalsRow}><Text style={s.small}>Subtotal</Text><Text>{money(invoice.subtotal, invoice.currency)}</Text></View>
          {invoice.discount > 0 && <View style={pdfSheet.totalsRow}><Text style={s.small}>Discount</Text><Text>- {money(invoice.discount, invoice.currency)}</Text></View>}
          <View style={pdfSheet.totalsRow}><Text style={s.small}>Tax</Text><Text>{money(invoice.taxAmount, invoice.currency)}</Text></View>
          <View style={pdfSheet.grandRow}><Text>Total</Text><Text>{money(invoice.totalAmount, invoice.currency)}</Text></View>
          {invoice.amountPaid > 0 && <View style={pdfSheet.totalsRow}><Text style={s.small}>Paid</Text><Text>- {money(invoice.amountPaid, invoice.currency)}</Text></View>}
          {invoice.amountCredited > 0 && <View style={pdfSheet.totalsRow}><Text style={s.small}>Credited</Text><Text>- {money(invoice.amountCredited, invoice.currency)}</Text></View>}
          <View style={pdfSheet.grandRow}><Text>Balance Due</Text><Text>{money(balance, invoice.currency)}</Text></View>
        </View>

        {invoice.notes ? <Text style={[s.small, { marginTop: 16 }]}>Notes: {invoice.notes}</Text> : null}

        <PdfFooter note="System-generated invoice." />
      </Page>
    </Document>
  );
}

export async function renderInvoicePdf(invoice: Invoice): Promise<Buffer> {
  return renderPdf(<InvoiceDocument invoice={invoice} />);
}
