import "server-only";
import { Document, Page, View, Text } from "@react-pdf/renderer";
import { lazyStyles } from "@/lib/pdf/lazy-styles";
import type { ProjectReport } from "@/lib/products/sprintos/reports";
import { PDF_COLORS } from "@/lib/pdf/brand";
import { PdfLetterhead, PdfFooter, pdfSheet } from "@/lib/pdf/layout";
import { getCompanyBrand } from "@/lib/platform/branding";
import { renderPdf } from "@/lib/pdf/identity";

/** Server-only. A4 project report PDF. Never import from a client component. */

const C = PDF_COLORS;

function money(n: number, currency: string): string {
  return `${currency} ${Math.round(n || 0).toLocaleString("en-IN")}`;
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const s = lazyStyles(() => ({
  page: pdfSheet.pagePortrait,
  section: pdfSheet.sectionTitle,
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", flexDirection: "row", paddingVertical: 2 },
  key: { width: 120, color: C.mute },
  val: { flex: 1, fontFamily: "Helvetica-Bold" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  kpi: { width: "25%", padding: 4 },
  kpiBox: pdfSheet.kpiBox,
  kpiLabel: pdfSheet.kpiLabel,
  kpiValue: pdfSheet.kpiValue,
  tHead: pdfSheet.tHead,
  tRow: pdfSheet.tRow,
}));

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.cell}>
      <Text style={s.key}>{k}</Text>
      <Text style={s.val}>{v}</Text>
    </View>
  );
}
function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.kpi}>
      <View style={s.kpiBox}>
        <Text style={s.kpiLabel}>{label}</Text>
        <Text style={s.kpiValue}>{value}</Text>
      </View>
    </View>
  );
}

function ReportDocument({ report, brandName }: { report: ProjectReport; brandName: string }) {
  const { summary: sm, financials: f } = report;
  const m = (n: number) => money(n, sm.currency);
  const subtitle = [
    `${sm.projectCode} · ${sm.client} · ${sm.statusLabel}`,
    report.range.dateFrom ? `${report.range.dateFrom} to ${report.range.dateTo}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Document title={`${sm.projectCode} — Project Report`}>
      <Page size="A4" style={s.page}>
        <PdfLetterhead
          title={sm.name}
          subtitle={subtitle}
          reference={`Generated ${fmtDate(report.generatedAt)}`}
        />

        <Text style={s.section}>Project Summary</Text>
        <View style={s.grid}>
          <Row k="Client" v={sm.client} />
          <Row k="Project Manager" v={sm.manager} />
          <Row k="Priority" v={sm.priority} />
          <Row k="Progress" v={`${sm.progressPercent}%`} />
          <Row k="Start Date" v={fmtDate(sm.startDate)} />
          <Row k="End Date" v={fmtDate(sm.endDate)} />
          <Row k="Tasks" v={`${report.doneTasks} / ${report.totalTasks} done`} />
          <Row k="Currency" v={sm.currency} />
        </View>

        <Text style={s.section}>Financials</Text>
        <View style={s.kpiRow}>
          <Kpi label="Contract Value" value={m(f.contractValue)} />
          <Kpi label="Estimated Cost" value={m(f.estimatedCost)} />
          <Kpi label="Actual Cost" value={m(f.actualCost)} />
          <Kpi label="Revenue" value={m(f.revenue)} />
          <Kpi label="Resource Cost" value={m(f.resourceCost)} />
          <Kpi label="Other Costs" value={m(f.otherCosts)} />
          <Kpi label={f.profit > 0 ? "Profit" : "Loss"} value={m(f.profit > 0 ? f.profit : f.loss)} />
          <Kpi label="Profit Margin" value={`${f.profitMargin}%`} />
          <Kpi label="Estimated Hours" value={String(f.estimatedHours)} />
          <Kpi label="Logged Hours" value={String(f.actualHours)} />
          <Kpi label="Billable Hours" value={String(f.billableHours)} />
          <Kpi label="Remaining Budget" value={m(f.remainingBudget)} />
        </View>

        <Text style={s.section}>Task Progress</Text>
        <View style={s.tHead}>
          {report.taskProgress.map((t) => (
            <Text key={t.status} style={{ width: `${100 / report.taskProgress.length}%` }}>{t.label}</Text>
          ))}
        </View>
        <View style={s.tRow}>
          {report.taskProgress.map((t) => (
            <Text key={t.status} style={{ width: `${100 / report.taskProgress.length}%` }}>{t.count}</Text>
          ))}
        </View>

        <Text style={s.section}>Employee Contributions</Text>
        <View style={s.tHead}>
          <Text style={{ width: "28%" }}>Employee</Text>
          <Text style={{ width: "16%" }}>Role</Text>
          <Text style={{ width: "12%" }}>Hours</Text>
          <Text style={{ width: "14%" }}>Billable</Text>
          <Text style={{ width: "15%" }}>Cost</Text>
          <Text style={{ width: "15%" }}>Revenue</Text>
        </View>
        {report.contributions.length === 0 ? (
          <View style={s.tRow}><Text style={{ color: C.mute }}>No logged hours in this range.</Text></View>
        ) : (
          report.contributions.map((c) => (
            <View key={c.employeeId} style={s.tRow}>
              <Text style={{ width: "28%" }}>{c.name}</Text>
              <Text style={{ width: "16%" }}>{c.role}</Text>
              <Text style={{ width: "12%" }}>{c.hours}</Text>
              <Text style={{ width: "14%" }}>{c.billableHours}</Text>
              <Text style={{ width: "15%" }}>{m(c.cost)}</Text>
              <Text style={{ width: "15%" }}>{m(c.revenue)}</Text>
            </View>
          ))
        )}

        <PdfFooter note={`${sm.name} · ${sm.projectCode} — ${brandName} SprintOS`} />
      </Page>
    </Document>
  );
}

export async function renderProjectReportPdf(report: ProjectReport): Promise<Buffer> {
  const { name } = await getCompanyBrand();
  return renderPdf(<ReportDocument report={report} brandName={name} />);
}
