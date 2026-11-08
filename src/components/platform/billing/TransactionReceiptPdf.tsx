import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";
import { rupeesInWords } from "@/lib/number-to-words";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { TYPE_LABEL, type TransactionView } from "@/lib/platform/billing/transactions-rule";

/**
 * Receipt for one subscription payment or refund: who paid whom, for what, how, and when. It is NOT the tax invoice (that is the GST document,
 * linked by number on the receipt); it is what a person files for "I paid this".
 */

const C = PDF_COLORS;

function money(paise: number, currency: string): string {
  const v = (paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === "INR" ? `Rs. ${v}` : `${currency} ${v}`;
}
const fmt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) + " IST";

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  small: { fontSize: 8, color: C.mute },
  label: pdfSheet.label,
  value: pdfSheet.value,
  line: { fontSize: 9, marginTop: 2 },
  cols: { flexDirection: "row", justifyContent: "space-between", marginTop: 16 },
  amountBox: { marginTop: 22, padding: 14, backgroundColor: C.soft, borderRadius: 4, alignItems: "center" },
  amountLabel: { fontSize: 8, color: C.mute, letterSpacing: 1.2 },
  amount: { fontSize: 24, fontFamily: "Helvetica-Bold", marginTop: 4 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: "#d9dee7", borderBottomStyle: "solid", fontSize: 9 },
  words: { marginTop: 10, fontSize: 8.5 },
  note: { marginTop: 18, padding: 8, backgroundColor: C.soft, fontSize: 8, color: C.mute },
}));

export interface ReceiptData extends TransactionView {
  payer: { name: string; email: string | null; gstin: string | null } | null;
  planName: string | null;
  interval: string | null;
}

function Receipt({ t, seller }: { t: ReceiptData; seller: { registrations: string[] } }) {
  const refund = t.type === "refund";
  return (
    <Document title={`${refund ? "Refund receipt" : "Payment receipt"} ${t.receiptNumber}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead title={refund ? "REFUND RECEIPT" : "PAYMENT RECEIPT"} subtitle={refund ? "Money returned to you" : "Acknowledgement of payment received"} reference={`${t.receiptNumber}\n${fmt(t.at)}`} registrations={seller.registrations} />

        <View style={s.amountBox}>
          <Text style={s.amountLabel}>{refund ? "AMOUNT REFUNDED" : "AMOUNT PAID"}</Text>
          <Text style={s.amount}>{money(t.amount, t.currency)}</Text>
          <Text style={[s.small, { marginTop: 4 }]}>{TYPE_LABEL[t.type]} · {t.status === "success" ? "Successful" : "Failed"}</Text>
        </View>

        <View style={s.cols}>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>{refund ? "Refunded to" : "Received from"}</Text>
            <Text style={s.value}>{t.payer?.name ?? "—"}</Text>
            {t.payer?.email ? <Text style={s.line}>{t.payer.email}</Text> : null}
            {t.payer?.gstin ? <Text style={s.line}>GSTIN: {t.payer.gstin}</Text> : null}
          </View>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>For</Text>
            <Text style={s.value}>{t.description}</Text>
            {t.planName ? <Text style={s.line}>{t.planName}{t.interval ? ` · ${t.interval === "yearly" ? "Yearly" : "Monthly"}` : ""}</Text> : null}
          </View>
        </View>

        <View style={{ marginTop: 18 }}>
          <View style={s.row}><Text style={s.small}>Receipt number</Text><Text>{t.receiptNumber}</Text></View>
          <View style={s.row}><Text style={s.small}>Date and time</Text><Text>{fmt(t.at)}</Text></View>
          <View style={s.row}><Text style={s.small}>Payment method</Text><Text>{t.method ?? "—"}</Text></View>
          {t.reference ? <View style={s.row}><Text style={s.small}>Payment reference</Text><Text>{t.reference}</Text></View> : null}
          {t.refundReference ? <View style={s.row}><Text style={s.small}>Refund reference</Text><Text>{t.refundReference}</Text></View> : null}
          {t.invoiceNumber ? <View style={s.row}><Text style={s.small}>Tax invoice</Text><Text>{t.invoiceNumber}</Text></View> : null}
          <View style={s.row}><Text style={s.small}>Amount (incl. taxes)</Text><Text>{money(t.amount, t.currency)}</Text></View>
        </View>

        {t.currency === "INR" ? <Text style={s.words}>Amount in words: {rupeesInWords(t.amount / 100)}</Text> : null}
        <Text style={s.note}>
          {refund
            ? "This refund goes back to the original payment method and reaches your account in 5 to 7 working days, depending on your bank."
            : t.invoiceNumber
              ? `This is a receipt for the payment above. The GST tax invoice for it is ${t.invoiceNumber}; use that for tax purposes.`
              : "This is a receipt for the payment above. The GST tax invoice for it is issued separately and appears under Invoices."}
        </Text>
        <PdfFooter />
      </Page>
    </Document>
  );
}

/** Rendered with the platform's own letterhead (the company that is paid), whichever host it is downloaded from. */
export async function renderTransactionReceiptPdf(t: ReceiptData): Promise<Buffer> {
  const ownerId = await getPlatformOwnerCompanyId();
  if (!ownerId) throw new Error("No platform owner company");
  const { seller } = await getBillingSettings();
  const registrations = [seller.gstin ? `GSTIN: ${seller.gstin}` : "", seller.pan ? `PAN: ${seller.pan}` : ""].filter(Boolean);
  return runAsCompany(ownerId, () =>
    renderPdf(<Receipt t={t} seller={{ registrations }} />, {
      name: seller.tradeName || seller.legalName,
      legalName: seller.legalName,
      addressLine: seller.address,
      cityLine: "",
      contactLine: [seller.email, seller.phone].filter(Boolean).join("  ·  "),
    }),
  );
}
