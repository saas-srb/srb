import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { PurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import type { CompanyIdentity } from "@/lib/products/spendiq/settings";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

const C = PDF_COLORS;

function money(n: number, currency: string): string {
  return `${currency} ${(Math.round((n || 0) * 100) / 100).toLocaleString("en-IN")}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
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
  sigWrap: { marginTop: 44, flexDirection: "row", justifyContent: "flex-end" },
}));

function PoDocument({ po, company }: { po: PurchaseOrder; company: CompanyIdentity }) {
  const issued = po.issuedAt ? po.issuedAt.toISOString().slice(0, 10) : po.createdAt.toISOString().slice(0, 10);
  return (
    <Document title={`Purchase Order ${po.poNumber}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title="PURCHASE ORDER"
          reference={`${po.poNumber}\n${fmtDate(issued)}`}
          registrations={[
            company.gstin ? `GSTIN: ${company.gstin}` : "",
            company.pan ? `PAN: ${company.pan}` : "",
          ].filter(Boolean)}
        />

        <View style={s.cols}>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Vendor</Text>
            <Text style={s.value}>{po.vendorName}</Text>
          </View>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Deliver to</Text>
            <Text style={s.value}>{po.deliveryAddress || company.addressLine || "—"}</Text>
            <Text style={s.small}>Expected: {fmtDate(po.deliveryDate)}</Text>
            <Text style={s.small}>Terms: {po.paymentTerms || "—"}</Text>
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={{ flex: 1 }}>Description</Text>
          <Text style={{ width: 55, textAlign: "right" }}>Qty</Text>
          <Text style={{ width: 70, textAlign: "right" }}>Unit</Text>
          <Text style={{ width: 40, textAlign: "right" }}>GST</Text>
          <Text style={{ width: 75, textAlign: "right" }}>Amount</Text>
        </View>
        {po.items.map((it, i) => (
          <View key={i} style={s.tRow}>
            <Text style={{ flex: 1 }}>{it.description}</Text>
            <Text style={{ width: 55, textAlign: "right" }}>{it.quantity} {it.uom}</Text>
            <Text style={{ width: 70, textAlign: "right" }}>{money(it.unitPrice, po.currency)}</Text>
            <Text style={{ width: 40, textAlign: "right" }}>{it.gstRate}%</Text>
            <Text style={{ width: 75, textAlign: "right" }}>{money(it.lineTotal, po.currency)}</Text>
          </View>
        ))}

        <View style={pdfSheet.totalsBox}>
          <View style={pdfSheet.totalsRow}><Text style={s.small}>Subtotal</Text><Text>{money(po.subtotal, po.currency)}</Text></View>
          {po.discount > 0 && <View style={pdfSheet.totalsRow}><Text style={s.small}>Discount</Text><Text>- {money(po.discount, po.currency)}</Text></View>}
          <View style={pdfSheet.totalsRow}><Text style={s.small}>GST</Text><Text>{money(po.gstAmount, po.currency)}</Text></View>
          <View style={pdfSheet.grandRow}><Text>Total</Text><Text>{money(po.totalAmount, po.currency)}</Text></View>
        </View>

        {po.notes ? <Text style={[s.small, { marginTop: 16 }]}>Notes: {po.notes}</Text> : null}

        <View style={s.sigWrap}>
          <View style={{ width: 180, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 4 }}>
            <Text style={s.small}>{company.signatoryName || "Authorised Signatory"}</Text>
            <Text style={s.small}>{company.signatoryTitle || ""}</Text>
          </View>
        </View>

        <PdfFooter note="System-generated purchase order." />
      </Page>
    </Document>
  );
}

export async function renderPurchaseOrderPdf(po: PurchaseOrder, company: CompanyIdentity): Promise<Buffer> {
  return renderPdf(<PoDocument po={po} company={company} />);
}
