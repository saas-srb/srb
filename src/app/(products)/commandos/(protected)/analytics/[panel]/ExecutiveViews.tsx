import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowUpRight,
  Landmark,
  Users,
  LayoutGrid,
  MessagesSquare,
  FolderKanban,
  Globe,
  ShoppingCart,
  GraduationCap,
  LayoutDashboard,
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Wallet,
  PiggyBank,
  Percent,
  ReceiptText,
  Target,
  CheckCircle2,
  Clock,
  Gauge,
  Award,
  Boxes,
  Server,
  CreditCard,
  MessageSquare,
  Building2,
  UserCheck,
  ShieldCheck,
  Activity,
  Briefcase,
  Hash,
  BarChart3,
  Users2,
  CalendarClock,
  Star,
  Zap,
  FileText,
  MapPin,
  Eye,
  BookOpen,
  DollarSign,
  Package,
  Ban,
  Timer,
  ArrowDownRight,
  UserPlus,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import {
  isPanelKey,
  PANEL_CONFIGS,
  getFmsAnalytics,
  getHrmsAnalytics,
  getLmsAnalytics,
  getMessengerAnalytics,
  getPmsAnalytics,
  getPortalAnalytics,
  getPrmsAnalytics,
  getTmsAnalytics,
  getWorkspaceAnalytics,
  type PanelKey,
  type PanelAnalyticsFilters,
} from "@/lib/products/commandos/panel-analytics";
import { getCareerDashboardStats } from "@/lib/career-applications";
import { getChatbotDashboardStats } from "@/lib/chatbot-analytics";
import { getPortfolioCosting } from "@/lib/products/sprintos/costing";
import { formatCurrency } from "@/lib/utils";

/* ─── Shared UI helpers ─────────────────────────────────── */

function AlertBanner({ alerts }: { alerts: { type: "warning" | "danger"; message: string }[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="space-y-2">
      {alerts.map((a, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
            a.type === "danger"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          }`}
        >
          {a.type === "danger" ? <AlertTriangle className="size-4 shrink-0" /> : <AlertCircle className="size-4 shrink-0" />}
          {a.message}
        </div>
      ))}
    </div>
  );
}

function DataTable({ columns, rows, emptyMsg = "No data available yet." }: {
  columns: { label: string; align?: "left" | "right" | "center" }[];
  rows: (string | number | React.ReactNode)[][];
  emptyMsg?: string;
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border/40">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/40 bg-muted/30">
            {columns.map((col, i) => (
              <th
                key={i}
                className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-muted-foreground">
                {emptyMsg}
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr key={i} className="border-b border-border/20 transition-colors hover:bg-muted/20 last:border-0">
                {row.map((cell, j) => (
                  <td
                    key={j}
                    className={`px-4 py-2.5 text-foreground ${
                      columns[j]?.align === "right" ? "text-right tabular-nums" : columns[j]?.align === "center" ? "text-center" : ""
                    }`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function BarList({
  data,
  format,
  title,
}: {
  data: { label: string; value: number }[];
  format?: "currency" | "percent" | "number";
  title?: string;
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-3">
      {title && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>}
      {data.slice(0, 12).map((d, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="w-36 shrink-0 truncate text-xs text-muted-foreground" title={d.label}>{d.label}</span>
          <div className="flex-1 h-2 rounded-full bg-muted/40 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[var(--color-brand-accent)] transition-all"
              style={{ width: `${Math.max((Math.abs(d.value) / max) * 100, 2)}%` }}
            />
          </div>
          <span className="w-24 shrink-0 text-right text-xs font-bold tabular-nums text-foreground">
            {format === "currency"
              ? formatCurrency(d.value)
              : format === "percent"
              ? `${d.value}%`
              : d.value.toLocaleString("en-IN")}
          </span>
        </div>
      ))}
      {data.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No data yet.</p>}
    </div>
  );
}

function StatRow({ items }: { items: { label: string; value: string | number; accent?: boolean }[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-muted/20 px-4 py-3 text-center">
          <div className={`text-xl font-black tabular-nums ${item.accent ? "bg-gradient-to-r from-primary to-[var(--color-brand-accent)] bg-clip-text text-transparent" : "text-foreground"}`}>
            {typeof item.value === "number" ? item.value.toLocaleString("en-IN") : item.value}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <div className="h-px flex-1 bg-border/40" />
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    completed: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    hired: "bg-emerald-500/15 text-emerald-600",
    new: "bg-primary/15 text-primary",
    in_progress: "bg-amber-500/15 text-amber-600",
    rejected: "bg-rose-500/15 text-rose-600",
    on_hold: "bg-orange-500/15 text-orange-600",
    cancelled: "bg-muted text-muted-foreground",
    running: "bg-emerald-500/15 text-emerald-600",
    upcoming: "bg-violet-500/15 text-violet-600",
    overdue: "bg-rose-500/15 text-rose-600",
  };
  const cls = map[status] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${cls}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────
   CashFlow View — Finance Management System
──────────────────────────────────────────────────────── */
async function FmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getFmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Core Financial KPIs">
        <KpiGrid>
          <KpiCard label="Total Revenue" value={d.kpis.totalRevenue} format="currency" accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="Total Expenses" value={d.kpis.totalExpenses} format="currency" icon={<ReceiptText className="size-4" />} />
          <KpiCard label="Net Profit" value={d.kpis.netProfit} format="currency" tone={d.kpis.netProfit >= 0 ? "up" : "down"} icon={<PiggyBank className="size-4" />} />
          <KpiCard label="Profit Margin" value={d.kpis.profitMargin} suffix="%" tone={d.kpis.profitMargin >= 0 ? "up" : "down"} icon={<Percent className="size-4" />} />
          <KpiCard label="Cash Balance" value={d.kpis.totalCash} format="currency" icon={<Wallet className="size-4" />} />
          <KpiCard label="Bank Balance" value={d.kpis.totalBankBalance} format="currency" icon={<Landmark className="size-4" />} />
          <KpiCard label="Accounts Receivable" value={d.kpis.accountsReceivable} format="currency" icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Accounts Payable" value={d.kpis.accountsPayable} format="currency" icon={<TrendingDown className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <ExecutiveSection title="Cash Flow & Liquidity">
        <KpiGrid>
          <KpiCard label="This Month Revenue" value={d.kpis.currentMonthRevenue} format="currency" accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="This Month Expenses" value={d.kpis.currentMonthExpenses} format="currency" icon={<ReceiptText className="size-4" />} />
          <KpiCard label="This Month Profit" value={d.kpis.currentMonthProfit} format="currency" tone={d.kpis.currentMonthProfit >= 0 ? "up" : "down"} icon={<PiggyBank className="size-4" />} />
          <KpiCard label="Outstanding Invoices" value={d.kpis.outstandingInvoices} icon={<ReceiptText className="size-4" />} />
          <KpiCard label="Overdue Invoices" value={d.kpis.overdueInvoices} tone={d.kpis.overdueInvoices > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Pending Approvals" value={d.kpis.pendingApprovals} tone={d.kpis.pendingApprovals > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
          <KpiCard label="Payroll Payable" value={d.kpis.payrollPayable} format="currency" icon={<Users className="size-4" />} />
          <KpiCard label="Tax Payable" value={d.kpis.taxPayable} format="currency" icon={<Hash className="size-4" />} />
          <KpiCard label="Training Revenue" value={d.kpis.trainingRevenue} format="currency" icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Subscription Cost" value={d.kpis.subscriptionCommitment} format="currency" icon={<CreditCard className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <ExecutiveSection title="Revenue & Expense Trends" description="Monthly comparison of income vs expenses.">
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Revenue Over Time</CardTitle><CardDescription>Monthly realized income</CardDescription></CardHeader>
            <CardContent><TimeSeriesChart data={d.charts.revenueVsExpenses.map((p) => ({ date: p.date, count: Math.round(p.revenue) }))} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Expenses Over Time</CardTitle><CardDescription>Monthly realized expenses</CardDescription></CardHeader>
            <CardContent><TimeSeriesChart data={d.charts.revenueVsExpenses.map((p) => ({ date: p.date, count: Math.round(p.expense) }))} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Monthly Profit / Loss</CardTitle><CardDescription>Net each period</CardDescription></CardHeader>
            <CardContent><TimeSeriesChart data={d.charts.monthlyProfitLoss.map((p) => ({ date: p.date, count: Math.round(p.revenue - p.expense) }))} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Revenue by Source</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={d.charts.revenueBySource} /></CardContent>
          </GlassCard>
        </div>
      </ExecutiveSection>

      <ExecutiveSection title="Expense Intelligence">
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
            <CardContent><BarList data={d.charts.expensesByCategory} format="currency" /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Project Profitability</CardTitle><CardDescription>Net profit per project from ledger</CardDescription></CardHeader>
            <CardContent><BarList data={d.charts.projectProfitability} format="currency" /></CardContent>
          </GlassCard>
        </div>
      </ExecutiveSection>

      <ExecutiveSection title="Receivables & Payables Aging" description="How long invoices have been outstanding.">
        <div className="grid gap-4 md:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Receivables Aging</CardTitle><CardDescription>Amount owed to company, by age</CardDescription></CardHeader>
            <CardContent><BarList data={d.charts.receivablesAging} format="currency" /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Payables Aging</CardTitle><CardDescription>Amount owed by company, by age</CardDescription></CardHeader>
            <CardContent><BarList data={d.charts.payablesAging} format="currency" /></CardContent>
          </GlassCard>
        </div>
      </ExecutiveSection>

      <ExecutiveSection title="Cross-Product Financial Summary" description="Finance exposure across linked products.">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "SpendIQ Payables", value: formatCurrency(d.panelSummary.prms.payables), sub: `${d.panelSummary.prms.pendingPaymentsCount} pending payments` },
            { label: "SprintOS Receivables", value: formatCurrency(d.panelSummary.pms.receivables), sub: `${d.panelSummary.pms.pendingPaymentsCount} pending invoices` },
            { label: "TalentOS Salary Payable", value: formatCurrency(d.panelSummary.hrms.salaryPayable), sub: `${d.panelSummary.hrms.reimbursementsCount} pending approvals` },
            { label: "Cohort AI Fee Receivables", value: formatCurrency(d.panelSummary.tms.receivables), sub: `${d.panelSummary.tms.pendingFeesCount} pending fees` },
          ].map((item) => (
            <GlassCard key={item.label}>
              <CardContent className="pt-5 pb-4 text-center">
                <p className="text-lg font-black tabular-nums text-foreground">{item.value}</p>
                <p className="text-xs font-medium text-muted-foreground mt-1">{item.label}</p>
                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{item.sub}</p>
              </CardContent>
            </GlassCard>
          ))}
        </div>
      </ExecutiveSection>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   TalentOS View — Human Resource Management
──────────────────────────────────────────────────────── */
async function HrmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getHrmsAnalytics(filters);
  const inactive = d.kpis.totalEmployees - d.kpis.activeEmployees;
  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Workforce KPIs">
        <KpiGrid>
          <KpiCard label="Total Employees" value={d.kpis.totalEmployees} accent icon={<Users className="size-4" />} />
          <KpiCard label="Active Employees" value={d.kpis.activeEmployees} tone="up" icon={<UserCheck className="size-4" />} />
          <KpiCard label="Inactive / Exited" value={inactive} tone={inactive > 0 ? "down" : undefined} icon={<UserPlus className="size-4" />} />
          <KpiCard label="Departments" value={d.kpis.departments} icon={<Building2 className="size-4" />} />
          <KpiCard label="New Joiners" value={d.kpis.newJoinees} trend={d.kpis.newJoineesGrowth} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Attrition Rate" value={d.kpis.attritionRate} suffix="%" tone={d.kpis.attritionRate > 10 ? "down" : "up"} icon={<TrendingDown className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Headcount & Hiring Analytics" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Headcount Growth</CardTitle><CardDescription>Cumulative employee count over time</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.headcountTimeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Hiring Velocity</CardTitle><CardDescription>New joiners per period</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.hiringTimeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Attrition Trend</CardTitle><CardDescription>Exits per period</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.attritionTimeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Employment Type Breakdown</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.employmentTypeDistribution} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="People Demographics" />

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Department Distribution</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.departmentDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Employee Status Distribution</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.statusDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Gender Diversity</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.genderDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle>Workforce Health Score</CardTitle>
            <CardDescription>Snapshot of key ratios</CardDescription>
          </CardHeader>
          <CardContent>
            <StatRow items={[
              { label: "Active %", value: `${d.kpis.totalEmployees > 0 ? Math.round((d.kpis.activeEmployees / d.kpis.totalEmployees) * 100) : 0}%` },
              { label: "Attrition", value: `${d.kpis.attritionRate}%` },
              { label: "New Hires", value: d.kpis.newJoinees },
              { label: "Departments", value: d.kpis.departments },
            ]} />
          </CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Recent Joiners" />

      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <DataTable
            columns={[
              { label: "Name" }, { label: "Code" }, { label: "Joining Date" }, { label: "Added" }
            ]}
            rows={d.recentJoinees.map((e) => [
              e.name,
              <span key={e.id} className="font-mono text-xs text-muted-foreground">{e.code}</span>,
              e.joiningDate ? new Date(e.joiningDate).toLocaleDateString("en-IN") : "—",
              new Date(e.createdAt).toLocaleDateString("en-IN"),
            ])}
          />
        </CardContent>
      </GlassCard>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   LMS View — Lead Management System
──────────────────────────────────────────────────────── */
async function LmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const [d, career] = await Promise.all([
    getLmsAnalytics(filters),
    getCareerDashboardStats({
      granularity: (filters?.granularity as any) ?? "month",
      dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    }).catch(() => null),
  ]);

  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Lead Pipeline KPIs">
        <KpiGrid>
          <KpiCard label="Total Leads" value={d.kpis.totalLeads} accent trend={d.kpis.growthPercent} icon={<Target className="size-4" />} />
          <KpiCard label="New" value={d.kpis.newLeads} icon={<Target className="size-4" />} />
          <KpiCard label="In Progress" value={d.kpis.inProgress} icon={<Activity className="size-4" />} />
          <KpiCard label="Completed" value={d.kpis.completed} tone="up" icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Rejected" value={d.kpis.rejected} icon={<Ban className="size-4" />} />
          <KpiCard label="Conversion Rate" value={d.kpis.conversionRate} suffix="%" tone={d.kpis.conversionRate > 20 ? "up" : "down"} icon={<Percent className="size-4" />} />
          <KpiCard label="Stale Leads" value={d.kpis.staleCount} tone={d.kpis.staleCount > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Lead Analytics" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Leads Over Time</CardTitle><CardDescription>Daily/monthly inflow</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.timeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Conversion Funnel</CardTitle><CardDescription>Drop-off at each stage</CardDescription></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.funnel.map((f) => ({ label: f.stage, value: f.count }))} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Leads by Source</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.bySource} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Activity by Day of Week</CardTitle><CardDescription>Which days drive most leads</CardDescription></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.byWeekday.map((w) => ({ label: w.day, value: w.count }))} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Category Breakdown" />

      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <DataTable
            columns={[
              { label: "Category" },
              { label: "Total", align: "right" },
              { label: "Completed", align: "right" },
              { label: "Conversion Rate", align: "right" },
              { label: "Growth", align: "right" },
            ]}
            rows={d.charts.topCategories.map((c) => [
              c.label,
              c.total.toLocaleString("en-IN"),
              c.completed.toLocaleString("en-IN"),
              <span key={c.category} className={c.completionRate > 30 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{c.completionRate}%</span>,
              c.growthPercent !== null
                ? <span key={c.category + "g"} className={c.growthPercent >= 0 ? "text-emerald-600" : "text-rose-600"}>{c.growthPercent > 0 ? "+" : ""}{c.growthPercent}%</span>
                : "—",
            ])}
          />
        </CardContent>
      </GlassCard>

      {career && (
        <>
          <SectionDivider label="Career Applications (TalentOS-Linked)" />
          <KpiGrid>
            <KpiCard label="Total Applications" value={career.total} accent trend={career.growthPercent} icon={<Briefcase className="size-4" />} />
            <KpiCard label="Under Review" value={career.byStatus.under_review ?? 0} icon={<Eye className="size-4" />} />
            <KpiCard label="Shortlisted" value={career.byStatus.shortlisted ?? 0} tone="up" icon={<Star className="size-4" />} />
            <KpiCard label="Interview Scheduled" value={career.byStatus.interview_scheduled ?? 0} icon={<CalendarClock className="size-4" />} />
            <KpiCard label="Hired" value={career.byStatus.hired ?? 0} tone="up" icon={<CheckCircle2 className="size-4" />} />
            <KpiCard label="Conversion Rate" value={career.hiringConversionRate} suffix="%" icon={<Percent className="size-4" />} />
            <KpiCard label="Rejected" value={career.byStatus.rejected ?? 0} icon={<Ban className="size-4" />} />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardHeader><CardTitle>Applications Over Time</CardTitle></CardHeader>
              <CardContent><TimeSeriesChart data={career.timeSeries} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Hiring Funnel</CardTitle></CardHeader>
              <CardContent><CategoryBarChart data={career.funnel.map((f) => ({ label: f.stage, value: f.count }))} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Top Positions by Applications</CardTitle></CardHeader>
              <CardContent><BarList data={career.topPositions.map((p) => ({ label: p.positionTitle, value: p.count }))} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Top Hiring Positions</CardTitle></CardHeader>
              <CardContent><BarList data={career.topHiringPositions.map((p) => ({ label: p.positionTitle, value: p.count }))} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Experience Distribution</CardTitle></CardHeader>
              <CardContent><CategoryBarChart data={career.experienceDistribution.map((e) => ({ label: e.label, value: e.count }))} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Location Distribution</CardTitle></CardHeader>
              <CardContent><BarList data={career.locationDistribution.map((l) => ({ label: l.label, value: l.count }))} /></CardContent>
            </GlassCard>
          </div>
        </>
      )}

      <SectionDivider label="Recent Leads" />
      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <DataTable
            columns={[{ label: "Name" }, { label: "Category" }, { label: "Status" }, { label: "Source" }, { label: "Date" }]}
            rows={d.recentLeads.map((l) => [
              l.name,
              l.category,
              <StatusBadge key={l.id} status={l.status} />,
              l.source,
              new Date(l.createdAt).toLocaleDateString("en-IN"),
            ])}
          />
        </CardContent>
      </GlassCard>

      {d.staleLeads.length > 0 && (
        <>
          <SectionDivider label="⚠ Stale Leads — Needs Follow-Up" />
          <GlassCard interactive={false}>
            <CardContent className="pt-4">
              <DataTable
                columns={[{ label: "Name" }, { label: "Category" }, { label: "Status" }, { label: "Created" }]}
                rows={d.staleLeads.map((l) => [
                  l.name, l.category, <StatusBadge key={l.id} status={l.status} />,
                  new Date(l.createdAt).toLocaleDateString("en-IN"),
                ])}
              />
            </CardContent>
          </GlassCard>
        </>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Messenger View — Internal Communication
──────────────────────────────────────────────────────── */
async function MessengerView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const [d, chatbot] = await Promise.all([
    getMessengerAnalytics(filters),
    getChatbotDashboardStats({
      granularity: (filters?.granularity as any) ?? "month",
      dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
      dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    }).catch(() => null),
  ]);

  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Communication KPIs">
        <KpiGrid>
          <KpiCard label="Active Users" value={d.kpis.activeUsers} accent icon={<Users className="size-4" />} />
          <KpiCard label="Online Now" value={d.kpis.onlineMembers} tone="up" icon={<Activity className="size-4" />} />
          <KpiCard label="Engagement Rate" value={d.kpis.engagementRate} suffix="%" icon={<Gauge className="size-4" />} />
          <KpiCard label="Total Channels" value={d.kpis.totalChannels} icon={<MessagesSquare className="size-4" />} />
          <KpiCard label="Project Channels" value={d.kpis.activeProjectChannels} icon={<FolderKanban className="size-4" />} />
          <KpiCard label="Messages Today" value={d.kpis.messagesSentToday} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="DMs Today" value={d.kpis.directMessagesToday} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="Shared Files (30d)" value={d.kpis.sharedFiles} icon={<Briefcase className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Message Volume Analytics" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Daily Message Volume</CardTitle><CardDescription>Last 30 days</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.dailyMessagingTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Peak Message Hours</CardTitle><CardDescription>When team is most active</CardDescription></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.peakHours} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Most Active Channels</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.channelActivity} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Most Active Members</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.mostActiveMembers} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Online vs Offline</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.onlineVsOffline} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>File Sharing Breakdown</CardTitle><CardDescription>Types of shared files</CardDescription></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.fileSharing} /></CardContent>
        </GlassCard>
      </div>

      {chatbot && (
        <>
          <SectionDivider label="AI Chatbot Analytics" />
          <KpiGrid>
            <KpiCard label="Total Sessions" value={chatbot.totalSessions} accent trend={chatbot.growth.sessions} icon={<Bot className="size-4" />} />
            <KpiCard label="Total Messages" value={chatbot.totalMessages} trend={chatbot.growth.messages} icon={<MessageSquare className="size-4" />} />
            <KpiCard label="Unique Visitors" value={chatbot.uniqueVisitors} trend={chatbot.growth.visitors} icon={<Users className="size-4" />} />
            <KpiCard label="Active Sessions" value={chatbot.activeSessions} icon={<Activity className="size-4" />} />
            <KpiCard label="Avg Conv. Length" value={chatbot.avgConversationLength} suffix=" msgs" icon={<BarChart3 className="size-4" />} />
            <KpiCard label="Avg Response Time" value={Math.round(chatbot.avgResponseTimeMs / 1000)} suffix="s" icon={<Timer className="size-4" />} />
            <KpiCard label="Error Rate" value={chatbot.errorRate} suffix="%" tone={chatbot.errorRate > 5 ? "down" : "up"} icon={<AlertTriangle className="size-4" />} />
            <KpiCard label="Flagged Messages" value={chatbot.flaggedCount} tone={chatbot.flaggedCount > 0 ? "down" : undefined} icon={<Ban className="size-4" />} />
          </KpiGrid>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardHeader><CardTitle>Sessions Over Time</CardTitle></CardHeader>
              <CardContent><TimeSeriesChart data={chatbot.sessionsSeries} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Messages Over Time</CardTitle></CardHeader>
              <CardContent><TimeSeriesChart data={chatbot.messagesSeries} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Device Breakdown</CardTitle></CardHeader>
              <CardContent><CategoryBarChart data={chatbot.deviceBreakdown} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>Top Source Pages</CardTitle></CardHeader>
              <CardContent><BarList data={chatbot.sourcePages} /></CardContent>
            </GlassCard>
          </div>

          {chatbot.popularQuestions.length > 0 && (
            <GlassCard interactive={false}>
              <CardHeader><CardTitle>Most Frequent User Questions</CardTitle><CardDescription>Top 10 questions asked to AI</CardDescription></CardHeader>
              <CardContent>
                <DataTable
                  columns={[{ label: "#", align: "center" }, { label: "Question" }, { label: "Count", align: "right" }]}
                  rows={chatbot.popularQuestions.map((q, i) => [
                    <span key={i} className="text-xs text-muted-foreground">{i + 1}</span>,
                    <span key={q.question} className="text-xs">{q.question}</span>,
                    q.count,
                  ])}
                />
              </CardContent>
            </GlassCard>
          )}
        </>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SprintOS View — Project Management System
──────────────────────────────────────────────────────── */
async function PmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const [d, costing] = await Promise.all([
    getPmsAnalytics(filters),
    getPortfolioCosting().catch(() => null),
  ]);

  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Project KPIs">
        <KpiGrid>
          <KpiCard label="Total Projects" value={d.kpis.totalProjects} accent icon={<FolderKanban className="size-4" />} />
          <KpiCard label="Active" value={d.kpis.activeProjects} tone="up" icon={<Activity className="size-4" />} />
          <KpiCard label="Completed" value={d.kpis.completedProjects} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="On Hold" value={d.kpis.onHoldProjects} icon={<Clock className="size-4" />} />
          <KpiCard label="Overdue" value={d.kpis.overdueProjects} tone={d.kpis.overdueProjects > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Total Clients" value={d.kpis.totalClients} icon={<Briefcase className="size-4" />} />
          <KpiCard label="Team Utilization" value={d.kpis.teamUtilization} suffix="%" tone={d.kpis.teamUtilization > 90 ? "down" : "up"} icon={<Gauge className="size-4" />} />
          <KpiCard label="Overall Completion" value={d.kpis.overallCompletion} suffix="%" icon={<Percent className="size-4" />} />
          <KpiCard label="New Projects" value={d.kpis.newProjects} trend={d.kpis.newProjectsGrowth} icon={<TrendingUp className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {costing && (
        <>
          <SectionDivider label="Portfolio Financial Intelligence" />
          <KpiGrid>
            <KpiCard label="Contract Value" value={costing.totalContractValue} format="currency" accent icon={<DollarSign className="size-4" />} />
            <KpiCard label="Actual Cost" value={costing.totalActualCost} format="currency" icon={<ReceiptText className="size-4" />} />
            <KpiCard label="Total Profit" value={costing.totalProfit} format="currency" tone="up" icon={<PiggyBank className="size-4" />} />
            <KpiCard label="Total Loss" value={costing.totalLoss} format="currency" tone={costing.totalLoss > 0 ? "down" : undefined} icon={<TrendingDown className="size-4" />} />
            <KpiCard label="Profit Margin" value={costing.profitMargin} suffix="%" tone={costing.profitMargin >= 0 ? "up" : "down"} icon={<Percent className="size-4" />} />
            <KpiCard label="Total Billable Hours" value={costing.totalBillableHours} suffix="h" icon={<Clock className="size-4" />} />
            <KpiCard label="Non-Billable Hours" value={costing.totalNonBillableHours} suffix="h" icon={<Clock className="size-4" />} />
            <KpiCard label="Estimated Hours" value={costing.totalEstimatedHours} suffix="h" icon={<Timer className="size-4" />} />
            <KpiCard label="Actual Hours" value={costing.totalActualHours} suffix="h" icon={<Activity className="size-4" />} />
          </KpiGrid>
        </>
      )}

      <SectionDivider label="Project Trends & Distribution" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Monthly Project Growth</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.monthlyGrowth} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Avg Progress Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.progressTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.statusDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Priority Distribution</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.priorityDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Client Project Distribution</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.clientDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Deadline Risk Buckets</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.deadlineBuckets} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Team Workload" />
      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <BarList data={d.charts.teamWorkload} format="percent" title="Employee Allocation %" />
        </CardContent>
      </GlassCard>

      {costing && costing.projects.length > 0 && (
        <>
          <SectionDivider label="Per-Project Financials" />
          <GlassCard interactive={false}>
            <CardContent className="pt-4">
              <DataTable
                columns={[
                  { label: "Project" },
                  { label: "Contract Value", align: "right" },
                  { label: "Actual Cost", align: "right" },
                  { label: "Profit", align: "right" },
                  { label: "Margin", align: "right" },
                  { label: "Hours", align: "right" },
                ]}
                rows={costing.projects.slice(0, 12).map((p) => [
                  <span key={p.projectId} className="text-xs font-medium">{p.projectName}</span>,
                  formatCurrency(p.contractValue),
                  formatCurrency(p.actualCost),
                  <span key={p.projectId + "p"} className={p.profit > 0 ? "text-emerald-600 font-semibold" : "text-rose-600 font-semibold"}>{formatCurrency(p.profit > 0 ? p.profit : -p.loss)}</span>,
                  <span key={p.projectId + "m"} className={p.profitMargin >= 0 ? "text-emerald-600" : "text-rose-600"}>{p.profitMargin}%</span>,
                  `${p.actualHours}h`,
                ])}
              />
            </CardContent>
          </GlassCard>
        </>
      )}

      <SectionDivider label="Recent Projects" />
      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <DataTable
            columns={[{ label: "Name" }, { label: "Code" }, { label: "Status" }, { label: "Progress", align: "right" }, { label: "End Date" }]}
            rows={d.recentProjects.map((p) => [
              p.name,
              <span key={p.id} className="font-mono text-xs text-muted-foreground">{p.code}</span>,
              <StatusBadge key={p.id + "s"} status={p.status} />,
              <span key={p.id + "p"} className={`font-semibold text-xs ${p.progressPercent === 100 ? "text-emerald-600" : p.progressPercent < 30 ? "text-rose-600" : "text-amber-600"}`}>{p.progressPercent}%</span>,
              p.endDate ?? "—",
            ])}
          />
        </CardContent>
      </GlassCard>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Portal View — External User Portal
──────────────────────────────────────────────────────── */
async function PortalView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getPortalAnalytics(filters);
  const total = d.kpis.total || 1;
  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="External User KPIs">
        <KpiGrid>
          <KpiCard label="Total Active Users" value={d.kpis.total} accent icon={<Globe className="size-4" />} />
          <KpiCard label="Clients" value={d.kpis.clients} icon={<Briefcase className="size-4" />} />
          <KpiCard label="Job Applicants" value={d.kpis.jobApplicants} icon={<UserCheck className="size-4" />} />
          <KpiCard label="Interns" value={d.kpis.interns} icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Trainees" value={d.kpis.trainees} icon={<GraduationCap className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Distribution Analysis" />

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Users by Role</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.byRole} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Role Share %</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3 pt-2">
              {d.charts.byRole.filter(r => r.value > 0).map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground capitalize">{r.label}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-2 rounded-full bg-muted/40 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-primary to-[var(--color-brand-accent)]" style={{ width: `${(r.value / total) * 100}%` }} />
                    </div>
                    <span className="text-xs font-bold tabular-nums w-12 text-right">{Math.round((r.value / total) * 100)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Snapshot Stats" />
      <GlassCard interactive={false}>
        <CardContent className="pt-5 pb-4">
          <StatRow items={[
            { label: "Total Users", value: d.kpis.total, accent: true },
            { label: "Clients", value: d.kpis.clients },
            { label: "Learners (Intern + Trainee)", value: d.kpis.interns + d.kpis.trainees },
            { label: "Applicants", value: d.kpis.jobApplicants },
          ]} />
        </CardContent>
      </GlassCard>

      <SectionDivider label="Recent External Users" />
      <GlassCard interactive={false}>
        <CardContent className="pt-4">
          <DataTable
            columns={[{ label: "Name" }, { label: "Email" }, { label: "Role" }, { label: "Joined" }]}
            rows={d.recentUsers.map((u) => [
              u.name,
              <span key={u.id} className="text-xs text-muted-foreground">{u.email}</span>,
              <StatusBadge key={u.id + "r"} status={u.role} />,
              new Date(u.createdAt).toLocaleDateString("en-IN"),
            ])}
          />
        </CardContent>
      </GlassCard>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SpendIQ View — Procurement Management
──────────────────────────────────────────────────────── */
async function PrmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getPrmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Procurement KPIs">
        <KpiGrid>
          <KpiCard label="Total Spend" value={d.kpis.totalProcurementSpend} format="currency" accent icon={<ShoppingCart className="size-4" />} />
          <KpiCard label="Monthly Expenses" value={d.kpis.monthlyExpenses} format="currency" icon={<ReceiptText className="size-4" />} />
          <KpiCard label="Approved Budget" value={d.kpis.approvedBudget} format="currency" icon={<IndianRupee className="size-4" />} />
          <KpiCard label="Remaining Budget" value={d.kpis.remainingBudget} format="currency" tone="up" icon={<Wallet className="size-4" />} />
          <KpiCard label="Budget Utilization" value={d.kpis.budgetUtilization} suffix="%" tone={d.kpis.budgetUtilization > 90 ? "down" : "up"} icon={<Percent className="size-4" />} />
          <KpiCard label="Asset Value" value={d.kpis.totalAssetsValue} format="currency" icon={<Boxes className="size-4" />} />
          <KpiCard label="Total Assets" value={d.kpis.totalOfficeAssets} icon={<Package className="size-4" />} />
          <KpiCard label="Active Vendors" value={d.kpis.activeVendors} icon={<Briefcase className="size-4" />} />
          <KpiCard label="Active Subscriptions" value={d.kpis.activeSubscriptions} icon={<CreditCard className="size-4" />} />
          <KpiCard label="Infra Cost (MoM)" value={d.kpis.infrastructureCost} format="currency" icon={<Server className="size-4" />} />
          <KpiCard label="Pending PRs" value={d.kpis.pendingPurchaseRequests} tone={d.kpis.pendingPurchaseRequests > 0 ? "down" : undefined} icon={<Clock className="size-4" />} />
          <KpiCard label="Pending Invoices" value={d.kpis.pendingInvoicePayments} tone={d.kpis.pendingInvoicePayments > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Annual Op. Cost" value={d.kpis.annualOperationalCost} format="currency" icon={<BarChart3 className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Spend Trends" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Monthly Expense Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.monthlyExpenseTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Cash Outflow Timeline</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.cashOutflowTimeline} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Infrastructure Cost Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.infrastructureCostTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Asset Acquisition Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.assetAcquisitionTrend} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Category & Vendor Intelligence" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Expenses by Category</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.categoryExpenses} format="currency" /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Top Expense Categories</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.topExpenseCategories} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Top Vendor Spend</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.vendorSpend} format="currency" /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Department Expenses</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.departmentExpenses} format="currency" /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>SaaS Subscription Costs</CardTitle><CardDescription>Monthly recurring per service</CardDescription></CardHeader>
          <CardContent><BarList data={d.charts.saasSubscriptionCost} format="currency" /></CardContent>
        </GlassCard>
        {d.charts.budgetVsActual.length > 0 && (
          <GlassCard>
            <CardHeader><CardTitle>Budget vs Actual (This Year)</CardTitle></CardHeader>
            <CardContent>
              <StatRow items={[
                { label: "Budget", value: formatCurrency(d.charts.budgetVsActual[0].budget) },
                { label: "Actual", value: formatCurrency(d.charts.budgetVsActual[0].actual) },
                { label: "Remaining", value: formatCurrency(d.kpis.remainingBudget) },
                { label: "Utilization", value: `${d.kpis.budgetUtilization}%`, accent: d.kpis.budgetUtilization > 90 },
              ]} />
            </CardContent>
          </GlassCard>
        )}
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Cohort AI View — Training Management System
──────────────────────────────────────────────────────── */
async function TmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getTmsAnalytics(filters);
  const totalStudents = d.kpis.totalStudents || 1;
  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Training KPIs">
        <KpiGrid>
          <KpiCard label="Total Students" value={d.kpis.totalStudents} accent icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Industrial" value={d.kpis.industrialStudents} icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Internship" value={d.kpis.internshipStudents} icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Active Batches" value={d.kpis.activeBatches} icon={<Activity className="size-4" />} />
          <KpiCard label="Running Programs" value={d.kpis.runningPrograms} icon={<BookOpen className="size-4" />} />
          <KpiCard label="Completed Programs" value={d.kpis.completedPrograms} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Placement Rate" value={d.kpis.placementSuccessRate} suffix="%" tone={d.kpis.placementSuccessRate >= 50 ? "up" : "down"} icon={<Award className="size-4" />} />
          <KpiCard label="Total Revenue" value={d.kpis.totalRevenue} format="currency" icon={<IndianRupee className="size-4" />} />
          <KpiCard label="Certificates Issued" value={d.kpis.certificatesIssued} icon={<Award className="size-4" />} />
          <KpiCard label="New Students" value={d.kpis.newStudents} trend={d.kpis.newStudentsGrowth} icon={<UserPlus className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="Enrollment & Revenue Trends" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Enrollment Trend</CardTitle><CardDescription>New student enrollments over time</CardDescription></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.enrollmentTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Monthly Admissions</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.monthlyAdmissions} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.revenueTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Placement Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.placementTrend} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Program & Batch Intelligence" />

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Program Enrollment Distribution</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.programEnrollment} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Industrial vs Internship Split</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4 pt-2">
              {d.charts.categorySplit.map((c) => (
                <div key={c.label} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{c.label}</span>
                    <span className="font-bold">{c.value} ({Math.round((c.value / totalStudents) * 100)}%)</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full bg-gradient-to-r from-primary to-[var(--color-brand-accent)]" style={{ width: `${(c.value / totalStudents) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Batch Occupancy %</CardTitle><CardDescription>How full each active batch is</CardDescription></CardHeader>
          <CardContent><BarList data={d.charts.batchOccupancy} format="percent" /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Enrollment Status Breakdown</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.completionRate} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Key Metrics Summary" />
      <GlassCard interactive={false}>
        <CardContent className="pt-5 pb-4">
          <StatRow items={[
            { label: "Industrial Students", value: d.kpis.industrialStudents, accent: true },
            { label: "Internship Students", value: d.kpis.internshipStudents },
            { label: "Placement Rate", value: `${d.kpis.placementSuccessRate}%` },
            { label: "Certs Issued", value: d.kpis.certificatesIssued },
          ]} />
        </CardContent>
      </GlassCard>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Workspace View — Staff Hub
──────────────────────────────────────────────────────── */
async function WorkspaceView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getWorkspaceAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />

      <ExecutiveSection title="Platform User KPIs">
        <KpiGrid>
          <KpiCard label="Total Users" value={d.kpis.totalUsers} accent icon={<Users className="size-4" />} />
          <KpiCard label="Active Users" value={d.kpis.activeUsers} tone="up" icon={<UserCheck className="size-4" />} />
          <KpiCard label="Inactive Users" value={d.kpis.inactiveUsers} tone={d.kpis.inactiveUsers > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Directors" value={d.kpis.superAdminCount} icon={<ShieldCheck className="size-4" />} />
          <KpiCard label="Distinct Roles" value={d.kpis.totalRoles} icon={<LayoutGrid className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <SectionDivider label="User Distribution" />

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Role Distribution</CardTitle><CardDescription>Which roles are assigned to staff</CardDescription></CardHeader>
          <CardContent><BarList data={d.charts.roleDistribution} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Active vs Inactive</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.activeVsInactive} /></CardContent>
        </GlassCard>
      </div>

      <SectionDivider label="Account Health Summary" />
      <GlassCard interactive={false}>
        <CardContent className="pt-5 pb-4">
          <StatRow items={[
            { label: "Total Accounts", value: d.kpis.totalUsers, accent: true },
            { label: "Active", value: d.kpis.activeUsers },
            { label: "Inactive", value: d.kpis.inactiveUsers },
            { label: "Directors", value: d.kpis.superAdminCount },
          ]} />
        </CardContent>
      </GlassCard>
    </>
  );
}

// import for Bot icon used in messenger
function Bot(props: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 8V4H8" /><rect width="16" height="12" x="4" y="8" rx="2" /><path d="M2 14h2" /><path d="M20 14h2" /><path d="M15 13v2" /><path d="M9 13v2" />
    </svg>
  );
}

/** Products with a dedicated executive view. Every other product's standard view is company-wide already, so the page uses that one. */
const EXECUTIVE_PANELS: ReadonlySet<PanelKey> = new Set<PanelKey>(["fms", "hrms", "lms", "messenger", "pms", "portal", "prms", "tms", "workspace"]);

export function hasExecutiveView(panel: PanelKey): boolean {
  return EXECUTIVE_PANELS.has(panel);
}

/* ─────────────────────────────────────────────────────────
   The full, company-wide analytics of one product (what the Command Center
   showed). Rendered by the analytics page — same URL, header and filters —
   for people who hold the Command Center permission; everyone else gets the
   role-scoped views defined in `page.tsx`.
──────────────────────────────────────────────────────── */
export default async function ExecutiveViews({ panel, filters }: { panel: PanelKey; filters: PanelAnalyticsFilters }) {
  return (
    <>
      {panel === "fms"       && <FmsView filters={filters} />}
      {panel === "hrms"      && <HrmsView filters={filters} />}
      {panel === "lms"       && <LmsView filters={filters} />}
      {panel === "messenger" && <MessengerView filters={filters} />}
      {panel === "pms"       && <PmsView filters={filters} />}
      {panel === "portal"    && <PortalView filters={filters} />}
      {panel === "prms"      && <PrmsView filters={filters} />}
      {panel === "tms"       && <TmsView filters={filters} />}
      {panel === "workspace" && <WorkspaceView filters={filters} />}
    </>
  );
}
