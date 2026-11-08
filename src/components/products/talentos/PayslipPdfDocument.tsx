import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { PayslipPdfData, PayLine } from "@/lib/products/talentos/payslip-pdf";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter } from "@/lib/pdf/layout";
import { renderPdf } from "@/lib/pdf/identity";

/**
 * Server-only. Renders a professional A4 payslip PDF with @react-pdf/renderer.
 * Uses the shared letterhead (`src/lib/pdf/layout.tsx`) so it matches every
 * other generated document. Never import this from a client component.
 */

const C = PDF_COLORS;

const inr = (n: number) => `Rs. ${Math.round(n || 0).toLocaleString("en-IN")}`;
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDay(day: string | null): string {
  return fmtDate(day ? `${day}T00:00:00Z` : null);
}

const s = lazyStyles(() => ({
  page: { paddingTop: 30, paddingHorizontal: 34, paddingBottom: 42, fontFamily: "Helvetica", fontSize: 8.5, color: C.ink, lineHeight: 1.35 },

  sectionTitle: { fontSize: 8, fontFamily: "Helvetica-Bold", color: C.navy, textTransform: "uppercase", letterSpacing: 1, marginTop: 12, marginBottom: 5 },

  grid: { flexDirection: "row", flexWrap: "wrap", borderWidth: 0.7, borderColor: C.line, borderRadius: 3 },
  cell: { width: "33.333%", paddingVertical: 4, paddingHorizontal: 7, borderBottomWidth: 0.7, borderRightWidth: 0.7, borderColor: C.line },
  cellLabel: { fontSize: 6.8, color: C.mute, textTransform: "uppercase", letterSpacing: 0.5 },
  cellValue: { fontSize: 8.5, color: C.ink, marginTop: 1 },

  strip: { flexDirection: "row", backgroundColor: C.soft, borderRadius: 3, paddingVertical: 6, marginTop: 4 },
  stripCell: { flex: 1, alignItems: "center" },
  stripLabel: { fontSize: 6.8, color: C.mute, textTransform: "uppercase", letterSpacing: 0.5 },
  stripValue: { fontSize: 9.5, color: C.ink, fontFamily: "Helvetica-Bold", marginTop: 1 },

  tablesRow: { flexDirection: "row", gap: 12, marginTop: 12 },
  tableCol: { flex: 1, borderWidth: 0.7, borderColor: C.line, borderRadius: 3 },
  thead: { flexDirection: "row", backgroundColor: C.navy, paddingVertical: 4, paddingHorizontal: 7 },
  th: { fontSize: 7, color: C.white, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5 },
  tr: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 7, borderBottomWidth: 0.6, borderColor: C.line },
  tdName: { flex: 1, fontSize: 8 },
  tdNum: { width: 62, fontSize: 8, textAlign: "right" },
  totalRow: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 7, backgroundColor: C.soft },
  totalName: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold" },
  totalNum: { width: 62, fontSize: 8, textAlign: "right", fontFamily: "Helvetica-Bold" },

  netBox: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: C.navy, borderRadius: 4, paddingVertical: 10, paddingHorizontal: 14, marginTop: 12 },
  netLabel: { fontSize: 8, color: "#c9d6f0", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1.5 },
  netWords: { fontSize: 7.5, color: "#eef2fb", marginTop: 2, maxWidth: 360 },
  netAmount: { fontSize: 16, color: C.white, fontFamily: "Helvetica-Bold" },

  smallNote: { fontSize: 7, color: C.mute, marginTop: 8 },

  authRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginTop: 22, borderTopWidth: 0.7, borderColor: C.line, paddingTop: 10 },
  sigBlock: { width: 190 },
  sigLine: { borderBottomWidth: 0.8, borderColor: C.ink, height: 24 },
  sigName: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 3 },
  sigRole: { fontSize: 7, color: C.mute },
  authNote: { flex: 1, alignItems: "flex-end", marginLeft: 24 },
  footNote: { fontSize: 6.8, color: C.mute, textAlign: "right", marginTop: 1 },

  watermark: { position: "absolute", top: 320, left: 70, fontSize: 82, color: "#ed6a4d", opacity: 0.12, fontFamily: "Helvetica-Bold", transform: "rotate(-32deg)", letterSpacing: 6 },
}));

function Cell({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={s.cell}>
      <Text style={s.cellLabel}>{label}</Text>
      <Text style={s.cellValue}>{value === "" || value === null || value === undefined ? "—" : String(value)}</Text>
    </View>
  );
}

function LineRows({ rows }: { rows: PayLine[] }) {
  return (
    <>
      {rows.length === 0 && (
        <View style={s.tr}>
          <Text style={s.tdName}>—</Text>
          <Text style={s.tdNum}>—</Text>
          <Text style={s.tdNum}>—</Text>
        </View>
      )}
      {rows.map((r, i) => (
        <View style={s.tr} key={i}>
          <Text style={s.tdName}>{r.name}{r.fixed !== undefined ? ` (of ${inr(r.fixed)})` : ""}</Text>
          <Text style={s.tdNum}>{inr(r.amount)}</Text>
          <Text style={s.tdNum}>{inr(r.ytd)}</Text>
        </View>
      ))}
    </>
  );
}

function PayslipDocument({ data }: { data: PayslipPdfData }) {
  const c = data.company;
  const e = data.employee;
  const registrations = c.registrations.map((r) => `${r.label}: ${r.value}`);
  const state = data.isProvisional ? `Provisional (run ${data.runStatus})` : "Confidential";

  return (
    <Document title={`Payslip ${e.code} ${data.month}`} author={c.name}>
      <Page size="A4" style={s.page}>
        {data.isProvisional && <Text style={s.watermark} fixed>PROVISIONAL</Text>}

        <PdfLetterhead
          title="PAYSLIP"
          reference={`${data.monthLabel}\n${state}`}
          registrations={registrations}
        />

        <Text style={s.sectionTitle}>Employee</Text>
        <View style={s.grid}>
          <Cell label="Name" value={e.name} />
          <Cell label="Employee code" value={e.code} />
          <Cell label="Designation" value={e.designation} />
          <Cell label="Department" value={e.department} />
          <Cell label="Team" value={e.team} />
          <Cell label="Location" value={e.location} />
          <Cell label="Employment type" value={e.employmentType} />
          <Cell label="Date of joining" value={fmtDay(e.joiningDate)} />
          <Cell label="Date of birth" value={fmtDay(e.dateOfBirth)} />
          <Cell label="PAN" value={e.pan} />
          <Cell label="UAN" value={e.uan} />
          <Cell label="PF / ESI No." value={[e.pfNumber, e.esiNumber].filter(Boolean).join(" / ")} />
        </View>

        <View style={s.strip}>
          <View style={s.stripCell}><Text style={s.stripLabel}>Pay period</Text><Text style={s.stripValue}>{data.monthLabel}</Text></View>
          <View style={s.stripCell}><Text style={s.stripLabel}>Pay date</Text><Text style={s.stripValue}>{fmtDate(data.period.payDate)}</Text></View>
          <View style={s.stripCell}><Text style={s.stripLabel}>{data.period.monthDays ? "Days in month" : "Working days"}</Text><Text style={s.stripValue}>{data.period.monthDays ?? data.period.workingDays}</Text></View>
          <View style={s.stripCell}><Text style={s.stripLabel}>LOP days</Text><Text style={s.stripValue}>{data.period.lopDays}</Text></View>
          <View style={s.stripCell}><Text style={s.stripLabel}>Days paid</Text><Text style={s.stripValue}>{data.period.daysPaid}</Text></View>
        </View>
        {data.period.notes.length > 0 ? <Text style={s.smallNote}>{data.period.notes.join(" ")}</Text> : null}

        <View style={s.tablesRow}>
          <View style={s.tableCol}>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 1 }]}>Earnings</Text>
              <Text style={[s.th, { width: 62, textAlign: "right" }]}>Month</Text>
              <Text style={[s.th, { width: 62, textAlign: "right" }]}>YTD</Text>
            </View>
            <LineRows rows={data.earnings} />
            <View style={s.totalRow}>
              <Text style={s.totalName}>Gross Earnings</Text>
              <Text style={s.totalNum}>{inr(data.grossPay)}</Text>
              <Text style={s.totalNum}>{inr(data.ytd.gross)}</Text>
            </View>
          </View>
          <View style={s.tableCol}>
            <View style={s.thead}>
              <Text style={[s.th, { flex: 1 }]}>Deductions</Text>
              <Text style={[s.th, { width: 62, textAlign: "right" }]}>Month</Text>
              <Text style={[s.th, { width: 62, textAlign: "right" }]}>YTD</Text>
            </View>
            <LineRows rows={data.deductions} />
            <View style={s.totalRow}>
              <Text style={s.totalName}>Total Deductions</Text>
              <Text style={s.totalNum}>{inr(data.totalDeductions)}</Text>
              <Text style={s.totalNum}>{inr(data.ytd.deductions)}</Text>
            </View>
          </View>
        </View>

        <View style={s.netBox}>
          <View>
            <Text style={s.netLabel}>Net Pay</Text>
            <Text style={s.netWords}>{data.netInWords}</Text>
          </View>
          <Text style={s.netAmount}>{inr(data.netPay)}</Text>
        </View>

        {data.tax ? (
          <Text style={s.smallNote}>
            Income tax ({data.tax.regime === "new" ? "new" : "old"} regime, FY {data.tax.fy}): estimated taxable income for the year {inr(data.tax.taxableIncome)}, tax for the year {inr(data.tax.yearTax)}, deducted this month {inr(data.tax.thisMonth)}, deducted so far this year {inr(data.tax.deductedSoFar)}.
          </Text>
        ) : null}

        <Text style={s.smallNote}>
          Employer contributions (not deducted from pay):{" "}
          {data.employerContributions.map((x) => `${x.name} ${inr(x.amount)}`).join("   ·   ")}   ·   Total cost to company {inr(data.employerCost)}
        </Text>

        <Text style={s.sectionTitle}>Payment details</Text>
        <View style={s.grid}>
          <Cell label="Payment mode" value={data.payment?.mode ?? "—"} />
          <Cell label="Status" value={data.payment ? data.payment.status : "—"} />
          <Cell label="Bank" value={data.payment?.bankName ?? "—"} />
          <Cell label="Account" value={data.payment?.accountMasked ?? "—"} />
          <Cell label="IFSC" value={data.payment?.ifsc ?? "—"} />
          <Cell label="UTR / Reference" value={data.payment?.utr ?? "—"} />
          <Cell label="Paid on" value={fmtDate(data.payment?.paidOn ?? null)} />
        </View>

        <View style={s.authRow}>
          <View style={s.sigBlock}>
            <View style={s.sigLine} />
            <Text style={s.sigName}>{c.signatoryName || " "}</Text>
            <Text style={s.sigRole}>{[c.signatoryDesignation, c.name].filter(Boolean).join(", ")}</Text>
          </View>
          <View style={s.authNote}>
            <Text style={s.footNote}>This is a computer-generated payslip and does not require a signature.</Text>
            {c.note ? <Text style={s.footNote}>{c.note}</Text> : null}
          </View>
        </View>

        <PdfFooter note={`Payslip ${data.employee.code} ${data.monthLabel} · generated ${fmtDate(data.generatedAt)}`} />
      </Page>
    </Document>
  );
}

export function renderPayslipPdf(data: PayslipPdfData): Promise<Buffer> {
  return renderPdf(<PayslipDocument data={data} />);
}
