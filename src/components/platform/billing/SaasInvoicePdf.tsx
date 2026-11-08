import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { SaasInvoice, SaasInvoiceParty } from "@/lib/platform/billing/invoices";
import { gstPercentLabel } from "@/lib/platform/billing/gst";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";
import { rupeesInWords } from "@/lib/number-to-words";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";

/**
 * GST tax invoice / credit note for a SaaS subscription. The seller block is
 * the PLATFORM's billing settings as snapshotted on the document (never the
 * downloading tenant's brand); the logo is the platform owner's.
 */

const C = PDF_COLORS;

function money(paise: number, currency: string): string {
  const v = (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "INR" ? `Rs. ${v}` : `${currency} ${v}`;
}
function fmtDate(d: Date): string {
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

const STAMP: Record<string, { text: string; color: string }> = {
  paid: { text: "PAID", color: "#15803d" },
  void: { text: "VOID", color: "#b91c1c" },
  unpaid: { text: "UNPAID", color: "#b45309" },
};

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  cols: { flexDirection: "row", justifyContent: "space-between", marginTop: 14 },
  label: pdfSheet.label,
  value: pdfSheet.value,
  line: { fontSize: 8.5, marginTop: 1 },
  tHead: { ...pdfSheet.tHead, marginTop: 16 },
  tRow: pdfSheet.tRow,
  stamp: {
    position: "absolute",
    top: 190,
    right: 60,
    borderWidth: 2.5,
    borderStyle: "solid",
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 14,
    transform: "rotate(-12deg)",
    alignItems: "center",
  },
  stampText: { fontSize: 22, fontFamily: "Helvetica-Bold", letterSpacing: 3 },
  stampSub: { fontSize: 7 },
  words: { marginTop: 10, fontSize: 8.5 },
  note: { marginTop: 14, padding: 8, backgroundColor: C.soft, fontSize: 8, color: C.mute },
}));

function Party({ title, party }: { title: string; party: SaasInvoiceParty }) {
  return (
    <View style={{ width: "48%" }}>
      <Text style={s.label}>{title}</Text>
      <Text style={s.value}>{party.legalName}</Text>
      {party.address ? <Text style={s.line}>{party.address}</Text> : null}
      <Text style={s.line}>GSTIN: {party.gstin ?? "Unregistered"}</Text>
      {party.state ? <Text style={s.line}>State: {party.state}{party.stateCode ? ` (${party.stateCode})` : ""}</Text> : null}
      {party.email ? <Text style={s.small}>{party.email}</Text> : null}
    </View>
  );
}

function SaasInvoiceDocument({ invoice }: { invoice: SaasInvoice }) {
  const cur = invoice.currency;
  const isCredit = invoice.kind === "credit_note";
  const half = gstPercentLabel(invoice.taxRatePercent / 2);
  const seller = invoice.seller;
  const registrations = [seller.gstin ? `GSTIN: ${seller.gstin}` : "", seller.pan ? `PAN: ${seller.pan}` : "", seller.state ? `State: ${seller.state} (${seller.stateCode})` : ""];
  const stamp = isCredit ? null : STAMP[invoice.status];
  const paid = invoice.status === "paid";
  return (
    <Document title={`${isCredit ? "Credit Note" : "Tax Invoice"} ${invoice.number}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title={isCredit ? "CREDIT NOTE" : "TAX INVOICE"}
          subtitle={isCredit ? `Against tax invoice ${invoice.original?.number} dated ${invoice.original ? fmtDate(invoice.original.issuedAt) : ""}` : paid ? "Invoice-cum-receipt · Original for recipient" : "Original for recipient"}
          reference={`${invoice.number}\n${fmtDate(invoice.issuedAt)}`}
          registrations={registrations}
        />

        {stamp ? (
          <View style={[s.stamp, { borderColor: stamp.color }]}>
            <Text style={[s.stampText, { color: stamp.color }]}>{stamp.text}</Text>
            {paid && invoice.paidAt ? <Text style={[s.stampSub, { color: stamp.color }]}>{fmtDate(invoice.paidAt)}</Text> : null}
          </View>
        ) : null}

        <View style={s.cols}>
          <Party title={isCredit ? "Issued to" : "Billed to"} party={invoice.buyer} />
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Place of supply</Text>
            <Text style={s.value}>{invoice.placeOfSupply ? `${invoice.placeOfSupply.name} (${invoice.placeOfSupply.code})` : "—"}</Text>
            {invoice.planName ? (
              <>
                <Text style={[s.label, { marginTop: 6 }]}>Subscription</Text>
                <Text style={s.line}>
                  {invoice.planName}
                  {invoice.interval ? ` · ${invoice.interval === "yearly" ? "Yearly" : "Monthly"}` : ""}
                </Text>
                {invoice.periodStart && invoice.periodEnd ? (
                  <Text style={s.line}>
                    {fmtDate(invoice.periodStart)} to {fmtDate(invoice.periodEnd)}
                  </Text>
                ) : null}
              </>
            ) : null}
            {isCredit ? (
              <>
                <Text style={[s.label, { marginTop: 6 }]}>Reason</Text>
                <Text style={s.line}>{invoice.reason}</Text>
                {invoice.refundRef ? <Text style={s.small}>Refund ref: {invoice.refundRef}</Text> : null}
              </>
            ) : paid ? (
              <>
                <Text style={[s.label, { marginTop: 6 }]}>Payment</Text>
                <Text style={s.line}>Received {invoice.paidAt ? fmtDate(invoice.paidAt) : ""}</Text>
                {invoice.paymentRef ? <Text style={s.small}>Ref: {invoice.paymentRef}</Text> : null}
              </>
            ) : null}
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={{ width: 20 }}>#</Text>
          <Text style={{ flex: 1 }}>Description</Text>
          <Text style={{ width: 50, textAlign: "right" }}>SAC</Text>
          <Text style={{ width: 30, textAlign: "right" }}>Qty</Text>
          <Text style={{ width: 90, textAlign: "right" }}>Taxable value</Text>
        </View>
        {invoice.items.map((it, i) => (
          <View key={i} style={s.tRow}>
            <Text style={{ width: 20 }}>{i + 1}</Text>
            <Text style={{ flex: 1 }}>{it.description}</Text>
            <Text style={{ width: 50, textAlign: "right" }}>{it.sac}</Text>
            <Text style={{ width: 30, textAlign: "right" }}>{it.quantity}</Text>
            <Text style={{ width: 90, textAlign: "right" }}>{money(it.taxable, cur)}</Text>
          </View>
        ))}

        <View style={pdfSheet.totalsBox}>
          <View style={pdfSheet.totalsRow}><Text style={s.small}>Taxable value</Text><Text>{money(invoice.taxable, cur)}</Text></View>
          {invoice.supplyType === "intra" ? (
            <>
              <View style={pdfSheet.totalsRow}><Text style={s.small}>CGST @ {half}</Text><Text>{money(invoice.cgst, cur)}</Text></View>
              <View style={pdfSheet.totalsRow}><Text style={s.small}>SGST @ {half}</Text><Text>{money(invoice.sgst, cur)}</Text></View>
            </>
          ) : (
            <View style={pdfSheet.totalsRow}><Text style={s.small}>IGST @ {gstPercentLabel(invoice.taxRatePercent)}</Text><Text>{money(invoice.igst, cur)}</Text></View>
          )}
          <View style={pdfSheet.grandRow}><Text>{isCredit ? "Total credited" : "Total"}</Text><Text>{money(invoice.total, cur)}</Text></View>
          {!isCredit && invoice.status !== "void" ? (
            <>
              <View style={pdfSheet.totalsRow}><Text style={s.small}>Amount paid</Text><Text>{money(paid ? invoice.total : 0, cur)}</Text></View>
              <View style={pdfSheet.totalsRow}><Text style={s.small}>Balance due</Text><Text>{money(paid ? 0 : invoice.total, cur)}</Text></View>
            </>
          ) : null}
        </View>

        {cur === "INR" ? <Text style={s.words}>Amount in words: {rupeesInWords(invoice.total / 100)}</Text> : null}

        <Text style={s.note}>
          {isCredit
            ? `This credit note reduces the value of tax invoice ${invoice.original?.number} by the amount above, including the tax on it.`
            : paid
              ? "This tax invoice also serves as the receipt for the payment above, received in full."
              : invoice.status === "void"
                ? `This invoice has been voided${invoice.reason ? `: ${invoice.reason}` : ""}. Nothing is payable on it.`
                : "Payment is due on this invoice."}{" "}
          Supply of services under SAC {invoice.sac}
          {invoice.supplyType === "intra" ? " (intra-state: CGST + SGST)" : " (inter-state: IGST)"}. Tax is not payable on reverse charge basis.
          {invoice.terms ? `\n\n${invoice.terms}` : ""}
        </Text>

        <PdfFooter note={invoice.footerNote || undefined} />
      </Page>
    </Document>
  );
}

/** Renders with the platform owner's logo and the seller details snapshotted on the invoice, whichever host it's downloaded from. */
export async function renderSaasInvoicePdf(invoice: SaasInvoice): Promise<Buffer> {
  const ownerId = await getPlatformOwnerCompanyId();
  if (!ownerId) throw new Error("No platform owner company");
  const seller = invoice.seller;
  return runAsCompany(ownerId, () =>
    renderPdf(<SaasInvoiceDocument invoice={invoice} />, {
      name: seller.name || seller.legalName,
      legalName: seller.legalName,
      addressLine: seller.address,
      cityLine: "",
      contactLine: [seller.email, seller.phone].filter(Boolean).join("  ·  "),
    }),
  );
}
