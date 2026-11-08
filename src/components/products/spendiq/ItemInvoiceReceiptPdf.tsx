import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { CompanyIdentity } from "@/lib/products/spendiq/settings";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

const C = PDF_COLORS;

export interface PdfItemDetails {
  id: string;
  code: string;
  type: "procurement" | "po" | "expense" | "subscription" | "asset" | "generic";
  title: string;
  vendorName?: string;
  requesterName?: string;
  category?: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  taxAmount?: number;
  subtotal?: number;
  paymentMethod?: string;
  transactionRef?: string;
  lineItems?: Array<{ description: string; quantity?: number; unitPrice?: number; total: number }>;
  notes?: string;
}

function money(n: number, c: string) {
  return `${c || "INR"} ${(Math.round((n || 0) * 100) / 100).toLocaleString("en-IN")}`;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  cols: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  label: pdfSheet.label,
  value: pdfSheet.value,
  tHead: { ...pdfSheet.tHead, marginTop: 16 },
  tRow: pdfSheet.tRow,
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: C.line },
  sigWrap: { marginTop: 40, flexDirection: "row", justifyContent: "flex-end" },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.ink, fontFamily: "Helvetica-Bold", fontSize: 12 },
}));

function InvoicePdfDocument({ item, company }: { item: PdfItemDetails; company: CompanyIdentity }) {
  const subtotal = item.subtotal ?? item.amount;
  const tax = item.taxAmount ?? 0;

  return (
    <Document title={`Invoice - ${item.code}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title="TAX INVOICE"
          reference={`Invoice No: INV-${item.code}\nDate: ${fmtDate(item.date)}`}
          registrations={[
            company.gstin ? `GSTIN: ${company.gstin}` : "",
            company.pan ? `PAN: ${company.pan}` : "",
          ].filter(Boolean)}
        />

        <View style={s.cols}>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Billed To</Text>
            <Text style={s.value}>{company.name}</Text>
            <Text style={s.small}>{company.addressLine || "Corporate Office"}</Text>
            {company.email && <Text style={s.small}>Email: {company.email}</Text>}
          </View>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Vendor / Beneficiary</Text>
            <Text style={s.value}>{item.vendorName || item.requesterName || "—"}</Text>
            <Text style={s.small}>Category: {item.category || item.type.toUpperCase()}</Text>
            <Text style={s.small}>Ref Code: {item.code}</Text>
            <Text style={s.small}>Status: {item.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={{ flex: 1 }}>Item Description</Text>
          <Text style={{ width: 60, textAlign: "right" }}>Qty</Text>
          <Text style={{ width: 80, textAlign: "right" }}>Rate</Text>
          <Text style={{ width: 90, textAlign: "right" }}>Amount</Text>
        </View>

        {item.lineItems && item.lineItems.length > 0 ? (
          item.lineItems.map((li, i) => (
            <View key={i} style={s.tRow}>
              <Text style={{ flex: 1 }}>{li.description}</Text>
              <Text style={{ width: 60, textAlign: "right" }}>{li.quantity ?? 1}</Text>
              <Text style={{ width: 80, textAlign: "right" }}>{money(li.unitPrice ?? li.total, item.currency)}</Text>
              <Text style={{ width: 90, textAlign: "right" }}>{money(li.total, item.currency)}</Text>
            </View>
          ))
        ) : (
          <View style={s.tRow}>
            <Text style={{ flex: 1 }}>{item.title}</Text>
            <Text style={{ width: 60, textAlign: "right" }}>1</Text>
            <Text style={{ width: 80, textAlign: "right" }}>{money(subtotal, item.currency)}</Text>
            <Text style={{ width: 90, textAlign: "right" }}>{money(subtotal, item.currency)}</Text>
          </View>
        )}

        <View style={pdfSheet.totalsBox}>
          <View style={pdfSheet.totalsRow}>
            <Text style={s.small}>Subtotal</Text>
            <Text>{money(subtotal, item.currency)}</Text>
          </View>
          {tax > 0 && (
            <View style={pdfSheet.totalsRow}>
              <Text style={s.small}>Tax / GST</Text>
              <Text>{money(tax, item.currency)}</Text>
            </View>
          )}
          <View style={pdfSheet.grandRow}>
            <Text>Total Payable</Text>
            <Text>{money(item.amount, item.currency)}</Text>
          </View>
        </View>

        {item.notes ? <Text style={[s.small, { marginTop: 16 }]}>Notes: {item.notes}</Text> : null}

        <View style={s.sigWrap}>
          <View style={{ width: 180, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 4 }}>
            <Text style={s.small}>{company.signatoryName || "Authorised Signatory"}</Text>
            <Text style={s.small}>{company.name} Finance & Accounts</Text>
          </View>
        </View>

        <PdfFooter note="Computer generated tax invoice. Valid without physical signature." />
      </Page>
    </Document>
  );
}

function ReceiptPdfDocument({ item, company }: { item: PdfItemDetails; company: CompanyIdentity }) {
  return (
    <Document title={`Receipt - ${item.code}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title="PAYMENT RECEIPT"
          reference={`Receipt Ref: REC-${item.code}\nDate: ${fmtDate(item.date)}`}
          registrations={[company.gstin ? `GSTIN: ${company.gstin}` : ""].filter(Boolean)}
        />

        <Text style={s.label}>Payment Summary</Text>
        <View style={s.row}>
          <Text style={s.small}>Item / Service</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{item.title}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Reference Code</Text>
          <Text>{item.code}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Paid To / Vendor</Text>
          <Text>{item.vendorName || item.requesterName || "—"}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Category / Module</Text>
          <Text style={{ textTransform: "uppercase" }}>{item.category || item.type}</Text>
        </View>

        <Text style={s.label}>Transaction Details</Text>
        <View style={s.row}>
          <Text style={s.small}>Payment Status</Text>
          <Text style={{ textTransform: "uppercase", color: "#059669" }}>{item.status || "COMPLETED"}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Payment Method</Text>
          <Text style={{ textTransform: "capitalize" }}>{(item.paymentMethod || "Bank Transfer / UPI").replace(/_/g, " ")}</Text>
        </View>
        {item.transactionRef && (
          <View style={s.row}>
            <Text style={s.small}>Transaction Ref / UTR</Text>
            <Text>{item.transactionRef}</Text>
          </View>
        )}

        <View style={s.grand}>
          <Text>Total Amount Paid</Text>
          <Text>{money(item.amount, item.currency)}</Text>
        </View>

        {item.notes ? <Text style={[s.small, { marginTop: 16 }]}>Notes: {item.notes}</Text> : null}

        <View style={s.sigWrap}>
          <View style={{ width: 180, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 4 }}>
            <Text style={s.small}>{company.signatoryName || "Authorised Signatory"}</Text>
            <Text style={s.small}>{company.name} Treasury & Settlement</Text>
          </View>
        </View>

        <PdfFooter note={`System-generated payment receipt for ${company.name}.`} />
      </Page>
    </Document>
  );
}

export async function renderItemInvoicePdf(item: PdfItemDetails, company: CompanyIdentity): Promise<Buffer> {
  return renderPdf(<InvoicePdfDocument item={item} company={company} />);
}

export async function renderItemReceiptPdf(item: PdfItemDetails, company: CompanyIdentity): Promise<Buffer> {
  return renderPdf(<ReceiptPdfDocument item={item} company={company} />);
}
