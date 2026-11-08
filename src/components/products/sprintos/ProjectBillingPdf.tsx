import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { CompanyIdentity } from "@/lib/products/spendiq/settings";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

const C = PDF_COLORS;

export interface ProjectPdfBillingDetails {
  id: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  clientEmail?: string;
  billingModel: "fixed_cost" | "hourly" | "milestone" | "sprint";
  hourlyRate?: number;
  billableHours?: number;
  nonBillableHours?: number;
  totalBudget?: number;
  detectedDeductions?: number;
  deductionReason?: string;
  currency: string;
  status: string;
  date: string;
  milestones?: Array<{ title: string; amount: number; status: string }>;
  sprints?: Array<{ title: string; hours: number; amount: number }>;
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
  sigWrap: { marginTop: 36, flexDirection: "row", justifyContent: "flex-end" },
  grand: { flexDirection: "row", justifyContent: "space-between", marginTop: 12, paddingTop: 6, borderTopWidth: 1, borderTopColor: C.ink, fontFamily: "Helvetica-Bold", fontSize: 12 },
}));

function ProjectInvoiceDocument({ details, company }: { details: ProjectPdfBillingDetails; company: CompanyIdentity }) {
  let computedSubtotal = details.totalBudget || 0;
  if (details.billingModel === "hourly" && details.hourlyRate && details.billableHours) {
    computedSubtotal = details.hourlyRate * details.billableHours;
  }

  const deductions = details.detectedDeductions || 0;
  const netPayable = Math.max(computedSubtotal - deductions, 0);

  return (
    <Document title={`Project Invoice - ${details.projectCode}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title="PROJECT TAX INVOICE"
          reference={`Invoice Ref: PRJ-INV-${details.projectCode}\nDate: ${fmtDate(details.date)}`}
          registrations={[
            company.gstin ? `GSTIN: ${company.gstin}` : "",
            company.pan ? `PAN: ${company.pan}` : "",
          ].filter(Boolean)}
        />

        <View style={s.cols}>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Billed To (Client)</Text>
            <Text style={s.value}>{details.clientName || "Client Organization"}</Text>
            {details.clientEmail && <Text style={s.small}>Email: {details.clientEmail}</Text>}
            <Text style={s.small}>Project: {details.projectName}</Text>
            <Text style={s.small}>Code: {details.projectCode}</Text>
          </View>
          <View style={{ width: "48%" }}>
            <Text style={s.label}>Service Provider</Text>
            <Text style={s.value}>{company.name}</Text>
            <Text style={s.small}>{company.addressLine || "Software & AI Solutions"}</Text>
            <Text style={s.small}>Billing Model: {details.billingModel.toUpperCase().replace("_", " ")}</Text>
            <Text style={s.small}>Status: {details.status.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.tHead}>
          <Text style={{ flex: 1 }}>Deliverable / Service Description</Text>
          <Text style={{ width: 60, textAlign: "right" }}>Hours/Qty</Text>
          <Text style={{ width: 80, textAlign: "right" }}>Rate</Text>
          <Text style={{ width: 90, textAlign: "right" }}>Amount</Text>
        </View>

        {details.milestones && details.milestones.length > 0 ? (
          details.milestones.map((m, i) => (
            <View key={i} style={s.tRow}>
              <Text style={{ flex: 1 }}>Milestone {i + 1}: {m.title}</Text>
              <Text style={{ width: 60, textAlign: "right" }}>1</Text>
              <Text style={{ width: 80, textAlign: "right" }}>{money(m.amount, details.currency)}</Text>
              <Text style={{ width: 90, textAlign: "right" }}>{money(m.amount, details.currency)}</Text>
            </View>
          ))
        ) : details.sprints && details.sprints.length > 0 ? (
          details.sprints.map((sp, i) => (
            <View key={i} style={s.tRow}>
              <Text style={{ flex: 1 }}>Sprint {i + 1}: {sp.title}</Text>
              <Text style={{ width: 60, textAlign: "right" }}>{sp.hours} hrs</Text>
              <Text style={{ width: 80, textAlign: "right" }}>{money(sp.amount / (sp.hours || 1), details.currency)}</Text>
              <Text style={{ width: 90, textAlign: "right" }}>{money(sp.amount, details.currency)}</Text>
            </View>
          ))
        ) : details.billingModel === "hourly" ? (
          <View style={s.tRow}>
            <Text style={{ flex: 1 }}>Billable Software Engineering & Development Hours</Text>
            <Text style={{ width: 60, textAlign: "right" }}>{details.billableHours || 0} hrs</Text>
            <Text style={{ width: 80, textAlign: "right" }}>{money(details.hourlyRate || 0, details.currency)}/hr</Text>
            <Text style={{ width: 90, textAlign: "right" }}>{money(computedSubtotal, details.currency)}</Text>
          </View>
        ) : (
          <View style={s.tRow}>
            <Text style={{ flex: 1 }}>Fixed Cost Project Execution: {details.projectName}</Text>
            <Text style={{ width: 60, textAlign: "right" }}>1 Fixed</Text>
            <Text style={{ width: 80, textAlign: "right" }}>{money(computedSubtotal, details.currency)}</Text>
            <Text style={{ width: 90, textAlign: "right" }}>{money(computedSubtotal, details.currency)}</Text>
          </View>
        )}

        <View style={pdfSheet.totalsBox}>
          <View style={pdfSheet.totalsRow}>
            <Text style={s.small}>Gross Subtotal</Text>
            <Text>{money(computedSubtotal, details.currency)}</Text>
          </View>
          {deductions > 0 && (
            <View style={pdfSheet.totalsRow}>
              <Text style={s.small}>Deducted Cost ({details.deductionReason || "Penalty/Adjustment"})</Text>
              <Text style={{ color: "#dc2626" }}>- {money(deductions, details.currency)}</Text>
            </View>
          )}
          <View style={pdfSheet.grandRow}>
            <Text>Net Amount Payable</Text>
            <Text>{money(netPayable, details.currency)}</Text>
          </View>
        </View>

        {details.notes ? <Text style={[s.small, { marginTop: 16 }]}>Notes: {details.notes}</Text> : null}

        <View style={s.sigWrap}>
          <View style={{ width: 180, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 4 }}>
            <Text style={s.small}>{company.signatoryName || "Authorised Signatory"}</Text>
            <Text style={s.small}>{company.name} Project Management & Billing</Text>
          </View>
        </View>

        <PdfFooter note="System-generated project invoice. Valid without physical signature." />
      </Page>
    </Document>
  );
}

function ProjectReceiptDocument({ details, company }: { details: ProjectPdfBillingDetails; company: CompanyIdentity }) {
  let computedSubtotal = details.totalBudget || 0;
  if (details.billingModel === "hourly" && details.hourlyRate && details.billableHours) {
    computedSubtotal = details.hourlyRate * details.billableHours;
  }
  const deductions = details.detectedDeductions || 0;
  const netPaid = Math.max(computedSubtotal - deductions, 0);

  return (
    <Document title={`Project Receipt - ${details.projectCode}`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title="PROJECT PAYMENT RECEIPT"
          reference={`Receipt Ref: PRJ-REC-${details.projectCode}\nDate: ${fmtDate(details.date)}`}
          registrations={[company.gstin ? `GSTIN: ${company.gstin}` : ""].filter(Boolean)}
        />

        <Text style={s.label}>Project Payment Summary</Text>
        <View style={s.row}>
          <Text style={s.small}>Project Name</Text>
          <Text style={{ fontFamily: "Helvetica-Bold" }}>{details.projectName}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Project Code</Text>
          <Text>{details.projectCode}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Client Name</Text>
          <Text>{details.clientName || "Client Organization"}</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Billing Model</Text>
          <Text style={{ textTransform: "uppercase" }}>{details.billingModel.replace("_", " ")}</Text>
        </View>
        {details.billableHours ? (
          <View style={s.row}>
            <Text style={s.small}>Logged Hours (Billable / Non-Billable)</Text>
            <Text>{details.billableHours} hrs billable · {details.nonBillableHours || 0} hrs non-billable</Text>
          </View>
        ) : null}

        <Text style={s.label}>Settlement Details</Text>
        <View style={s.row}>
          <Text style={s.small}>Payment Status</Text>
          <Text style={{ textTransform: "uppercase", color: "#059669" }}>COMPLETED / SETTLED</Text>
        </View>
        <View style={s.row}>
          <Text style={s.small}>Gross Contract Value</Text>
          <Text>{money(computedSubtotal, details.currency)}</Text>
        </View>
        {deductions > 0 && (
          <View style={s.row}>
            <Text style={s.small}>Detected / Deducted Cost</Text>
            <Text style={{ color: "#dc2626" }}>- {money(deductions, details.currency)} ({details.deductionReason || "Adjustment"})</Text>
          </View>
        )}

        <View style={s.grand}>
          <Text>Total Amount Received</Text>
          <Text>{money(netPaid, details.currency)}</Text>
        </View>

        {details.notes ? <Text style={[s.small, { marginTop: 16 }]}>Notes: {details.notes}</Text> : null}

        <View style={s.sigWrap}>
          <View style={{ width: 180, borderTopWidth: 0.5, borderTopColor: C.ink, paddingTop: 4 }}>
            <Text style={s.small}>{company.signatoryName || "Authorised Signatory"}</Text>
            <Text style={s.small}>{company.name} Treasury & Project Settlement</Text>
          </View>
        </View>

        <PdfFooter note="System-generated project payment receipt." />
      </Page>
    </Document>
  );
}

export async function renderProjectInvoicePdf(details: ProjectPdfBillingDetails, company: CompanyIdentity): Promise<Buffer> {
  return renderPdf(<ProjectInvoiceDocument details={details} company={company} />);
}

export async function renderProjectReceiptPdf(details: ProjectPdfBillingDetails, company: CompanyIdentity): Promise<Buffer> {
  return renderPdf(<ProjectReceiptDocument details={details} company={company} />);
}
