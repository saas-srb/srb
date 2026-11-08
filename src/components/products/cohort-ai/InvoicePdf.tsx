import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

/** Server-only. A4 fee receipt. Never import from a client component. */

const C = PDF_COLORS;

export interface InvoicePdfData {
  invoiceNumber: string;
  paidOn: string;
  method: string;
  transactionId: string | null;
  amount: number;
  currency: string;
  totalFees: number;
  discount: number;
  paidToDate: number;
  pending: number;
  studentName: string;
  studentCode: string | null;
  programName: string;
  batchName: string | null;
  institute: {
    name: string;
    addressLine: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
  };
}

function money(n: number, currency: string): string {
  return `${currency} ${Math.round(n || 0).toLocaleString("en-IN")}`;
}
function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  section: { marginTop: 16 },
  label: pdfSheet.label,
  value: pdfSheet.value,
  tHead: { ...pdfSheet.tHead, marginTop: 18 },
  tRow: pdfSheet.tRow,
}));

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  return (
    <Document title={`Receipt ${data.invoiceNumber}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead title="FEE RECEIPT" reference={`${data.invoiceNumber}\n${fmtDate(data.paidOn)}`} />

        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={s.section}>
            <Text style={s.label}>Billed to</Text>
            <Text style={s.value}>{data.studentName}</Text>
            {data.studentCode ? <Text style={s.small}>{data.studentCode}</Text> : null}
          </View>
          <View style={s.section}>
            <Text style={s.label}>Payment method</Text>
            <Text style={s.value}>{data.method}</Text>
            {data.transactionId ? <Text style={s.small}>Txn: {data.transactionId}</Text> : null}
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={{ flex: 1 }}>Description</Text>
          <Text style={{ width: 100, textAlign: "right" }}>Amount</Text>
        </View>
        <View style={s.tRow}>
          <Text style={{ flex: 1 }}>
            {data.programName}
            {data.batchName ? ` — ${data.batchName}` : ""} (fee payment)
          </Text>
          <Text style={{ width: 100, textAlign: "right" }}>{money(data.amount, data.currency)}</Text>
        </View>

        <View style={pdfSheet.totalsBox}>
          <View style={pdfSheet.totalsRow}>
            <Text style={s.small}>Total course fees</Text>
            <Text style={s.small}>{money(data.totalFees, data.currency)}</Text>
          </View>
          {data.discount > 0 && (
            <View style={pdfSheet.totalsRow}>
              <Text style={s.small}>Discount</Text>
              <Text style={s.small}>- {money(data.discount, data.currency)}</Text>
            </View>
          )}
          <View style={pdfSheet.totalsRow}>
            <Text style={s.small}>Paid to date</Text>
            <Text style={s.small}>{money(data.paidToDate, data.currency)}</Text>
          </View>
          <View style={pdfSheet.grandRow}>
            <Text>This receipt</Text>
            <Text>{money(data.amount, data.currency)}</Text>
          </View>
          <View style={[pdfSheet.totalsRow, { marginTop: 4 }]}>
            <Text style={s.small}>Balance pending</Text>
            <Text style={s.small}>{money(data.pending, data.currency)}</Text>
          </View>
        </View>

        <PdfFooter note="Computer-generated receipt — thank you." />
      </Page>
    </Document>
  );
}

export function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  return renderPdf(<InvoiceDocument data={data} />) as Promise<Buffer>;
}
