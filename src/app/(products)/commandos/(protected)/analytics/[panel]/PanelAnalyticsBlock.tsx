import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
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
  CreditCard,
  MessageSquare,
  Building2,
  UserCheck,
  ShieldCheck,
  Activity,
  Briefcase,
  Hash,
  BarChart3,
  CalendarClock,
  Star,
  Zap,
  Eye,
  DollarSign,
  Ban,
  Timer,
  UserPlus,
  Lock,
  Bot,
  BookText,
  Vault,
  FileCheck2,
  Megaphone,
  SearchCheck,
  PanelsTopLeft,
  FileText,
} from "lucide-react";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { checkWorkspaceAccess } from "@/lib/products/commandos/access";
import { canViewCommandCenter } from "@/lib/products/commandos/nav";
import ExecutiveViews, { hasExecutiveView } from "./ExecutiveViews";
import { CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProductLogo from "@/components/products/ProductLogo";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import { AnalyticsFilterBar, type FilterField } from "@/components/products/commandos/AnalyticsFilterBar";
import {
  isPanelKey,
  panelConfigs,
  getFmsAnalytics,
  getHrmsAnalytics,
  getLmsAnalytics,
  getMessengerAnalytics,
  getPmsAnalytics,
  getPortalAnalytics,
  getPrmsAnalytics,
  getTmsAnalytics,
  getWorkspaceAnalytics,
  getSopAnalytics,
  getDlmsAnalytics,
  getOtsAnalytics,
  getAibotsAnalytics,
  getSmmsAnalytics,
  getSeoAnalytics,
  getCmsAnalytics,
  getLpmsAnalytics,
  type PanelKey,
  type PanelAnalyticsFilters,
} from "@/lib/products/commandos/panel-analytics";
import { getCareerDashboardStats } from "@/lib/career-applications";
import { getChatbotDashboardStats } from "@/lib/chatbot-analytics";
import { getPortfolioCosting } from "@/lib/products/sprintos/costing";
import { formatCompact, formatCurrency } from "@/lib/utils";

/* ─── Product Filter Field Configurations ───────────────── */
const PANEL_FILTER_FIELDS: Record<PanelKey, FilterField[]> = {
  // These products' analytics have no extra filter: the date range applies where their data is dated.
  aibots: [],
  cms: [],
  dlms: [],
  lpms: [],
  seo: [],
  smms: [],
  sop: [],
  ots: [
    {
      key: "status",
      label: "Assignment Status",
      options: [
        { label: "Assigned", value: "assigned" },
        { label: "In Progress", value: "in_progress" },
        { label: "Awaiting Evaluation", value: "submitted" },
        { label: "Evaluated", value: "evaluated" },
        { label: "Completed", value: "completed" },
        { label: "Expired", value: "expired" },
        { label: "Cancelled", value: "cancelled" },
      ],
    },
  ],
  fms: [
    {
      key: "status",
      label: "Invoice Status",
      options: [
        { label: "Overdue Invoices", value: "overdue" },
        { label: "Pending Approvals", value: "pending" },
      ],
    },
    {
      key: "category",
      label: "Ledger Category",
      options: [
        { label: "Client Revenue", value: "client_revenue" },
        { label: "Training Revenue", value: "training" },
        { label: "Payroll Expenses", value: "payroll" },
        { label: "SaaS Subscriptions", value: "saas" },
        { label: "Tax Liability", value: "tax" },
      ],
    },
  ],
  hrms: [
    {
      key: "status",
      label: "Employee Status",
      options: [
        { label: "Active", value: "active" },
        { label: "Probation", value: "probation" },
        { label: "Relieved", value: "relieved" },
        { label: "Terminated", value: "terminated" },
      ],
    },
    {
      key: "employmentType",
      label: "Employment Type",
      options: [
        { label: "Full Time", value: "full_time" },
        { label: "Part Time", value: "part_time" },
        { label: "Contract", value: "contract" },
        { label: "Internship", value: "internship" },
      ],
    },
    {
      key: "gender",
      label: "Gender",
      options: [
        { label: "Male", value: "male" },
        { label: "Female", value: "female" },
        { label: "Other", value: "other" },
      ],
    },
  ],
  lms: [
    {
      key: "status",
      label: "Lead Status",
      options: [
        { label: "New Lead", value: "new" },
        { label: "In Progress", value: "in_progress" },
        { label: "Completed / Won", value: "completed" },
        { label: "Rejected", value: "rejected" },
      ],
    },
    {
      key: "category",
      label: "Lead Category",
      options: [
        { label: "Industrial Training", value: "industrial-training" },
        { label: "Internship", value: "internship" },
        { label: "Corporate Training", value: "corporate-training" },
        { label: "Software Development", value: "software-development" },
        { label: "Consulting", value: "consulting" },
      ],
    },
    {
      key: "source",
      label: "Lead Source",
      options: [
        { label: "Website", value: "website" },
        { label: "Referral", value: "referral" },
        { label: "LinkedIn", value: "linkedin" },
        { label: "Google Search", value: "google" },
        { label: "Direct Outreach", value: "direct" },
      ],
    },
  ],
  messenger: [
    {
      key: "channelType",
      label: "Channel Type",
      options: [
        { label: "Project Channels", value: "project" },
        { label: "Department Channels", value: "department" },
        { label: "General Workspace", value: "general" },
        { label: "Direct Messages", value: "direct" },
      ],
    },
  ],
  pms: [
    {
      key: "status",
      label: "Project Status",
      options: [
        { label: "Planning", value: "planning" },
        { label: "In Progress", value: "in_progress" },
        { label: "On Hold", value: "on_hold" },
        { label: "Completed", value: "completed" },
        { label: "Cancelled", value: "cancelled" },
      ],
    },
  ],
  portal: [
    {
      key: "role",
      label: "User Role",
      options: [
        { label: "Client Portal", value: "client" },
        { label: "Job Applicant", value: "job_applicant" },
        { label: "Intern", value: "intern" },
        { label: "Trainee Student", value: "trainee" },
      ],
    },
    {
      key: "status",
      label: "Account Status",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
        { label: "Suspended", value: "suspended" },
      ],
    },
  ],
  prms: [
    {
      key: "expenseType",
      label: "Expense Type",
      options: [
        { label: "Operational Expense", value: "operating" },
        { label: "Capital Expenditure", value: "capital" },
        { label: "Software SaaS", value: "software" },
        { label: "Hardware & Assets", value: "hardware" },
        { label: "Utilities & Office", value: "utility" },
      ],
    },
    {
      key: "paymentStatus",
      label: "Payment Status",
      options: [
        { label: "Paid", value: "paid" },
        { label: "Pending Payment", value: "pending" },
        { label: "Overdue", value: "overdue" },
      ],
    },
  ],
  tms: [
    {
      key: "mode",
      label: "Training Mode",
      options: [
        { label: "Industrial Training", value: "industrial" },
        { label: "Internship Program", value: "internship" },
      ],
    },
  ],
  workspace: [
    {
      key: "role",
      label: "Staff Role",
      options: [
        { label: "Director", value: "super_admin" },
        { label: "Admin", value: "admin" },
        { label: "Finance Admin", value: "finance_admin" },
        { label: "HR Admin", value: "hr_admin" },
        { label: "SprintOS Admin", value: "pms_admin" },
        { label: "Cohort AI Admin", value: "tms_admin" },
      ],
    },
    {
      key: "status",
      label: "Account Status",
      options: [
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
    },
  ],
};

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

function AccessDeniedView({ panelName, userRoles }: { panelName: string; userRoles: string[] }) {
  return (
    <GlassCard interactive={false}>
      <CardContent className="py-12 px-6 text-center space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 ring-1 ring-amber-500/20">
          <Lock className="size-7" />
        </div>
        <div className="max-w-md mx-auto space-y-1">
          <h3 className="text-xl font-bold text-foreground">Workspace Access Control Notice</h3>
          <p className="text-xs text-muted-foreground">
            Your workspace account currently does not have active role privileges assigned for <span className="font-semibold text-foreground">{panelName}</span>.
          </p>
        </div>
        <div className="inline-flex flex-wrap items-center justify-center gap-2 pt-2 text-xs">
          <span className="text-muted-foreground">Active Account Roles:</span>
          {userRoles.map((r) => (
            <span key={r} className="rounded-full bg-background border border-border/50 px-2.5 py-0.5 font-medium text-foreground">
              {r.replace(/_/g, " ")}
            </span>
          ))}
          {userRoles.length === 0 && <span className="text-muted-foreground italic">Standard Employee</span>}
        </div>
        <div className="pt-4 flex justify-center gap-3">
          <Link
            href="/commandos"
            className="rounded-xl border border-border/60 bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted/40 transition-colors"
          >
            Back to Workspace Hub
          </Link>
          <Link
            href="/talentos/me"
            className="rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            My Employee Portal
          </Link>
        </div>
      </CardContent>
    </GlassCard>
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
   CashFlow View
──────────────────────────────────────────────────────── */
async function FmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getFmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Finance KPIs">
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
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Revenue Over Time</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.revenueVsExpenses.map((p) => ({ date: p.date, count: Math.round(p.revenue) }))} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Expenses Over Time</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.revenueVsExpenses.map((p) => ({ date: p.date, count: Math.round(p.expense) }))} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   TalentOS View
──────────────────────────────────────────────────────── */
async function HrmsView({ filters, userId }: { filters?: PanelAnalyticsFilters; userId: string }) {
  const d = await getHrmsAnalytics({ ...filters, restrictToEmployeeId: userId });
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Workforce KPIs">
        <KpiGrid>
          <KpiCard label="Total Employees" value={d.kpis.totalEmployees} accent icon={<Users className="size-4" />} />
          <KpiCard label="Active Employees" value={d.kpis.activeEmployees} tone="up" icon={<UserCheck className="size-4" />} />
          <KpiCard label="Departments" value={d.kpis.departments} icon={<Building2 className="size-4" />} />
          <KpiCard label="New Joiners" value={d.kpis.newJoinees} trend={d.kpis.newJoineesGrowth} icon={<TrendingUp className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Headcount Growth</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.headcountTimeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Department Distribution</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.departmentDistribution} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   LMS View
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
          <KpiCard label="New Leads" value={d.kpis.newLeads} icon={<Target className="size-4" />} />
          <KpiCard label="In Progress" value={d.kpis.inProgress} icon={<Activity className="size-4" />} />
          <KpiCard label="Completed" value={d.kpis.completed} tone="up" icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Conversion Rate" value={d.kpis.conversionRate} suffix="%" icon={<Percent className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Leads Over Time</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.timeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Leads by Source</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.bySource} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Messenger View
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
          <KpiCard label="Online Members" value={d.kpis.onlineMembers} tone="up" icon={<Activity className="size-4" />} />
          <KpiCard label="Total Channels" value={d.kpis.totalChannels} icon={<MessagesSquare className="size-4" />} />
          <KpiCard label="Messages Sent Today" value={d.kpis.messagesSentToday} icon={<MessageSquare className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Daily Messaging Volume</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.dailyMessagingTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Active Channels</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.channelActivity} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SprintOS View
──────────────────────────────────────────────────────── */
async function PmsView({ filters, userId }: { filters?: PanelAnalyticsFilters; userId: string }) {
  const [d, costing] = await Promise.all([
    getPmsAnalytics({ ...filters, restrictToEmployeeId: userId }),
    getPortfolioCosting().catch(() => null),
  ]);

  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Project KPIs">
        <KpiGrid>
          <KpiCard label="Total Projects" value={d.kpis.totalProjects} accent icon={<FolderKanban className="size-4" />} />
          <KpiCard label="Active Projects" value={d.kpis.activeProjects} tone="up" icon={<Activity className="size-4" />} />
          <KpiCard label="Completed" value={d.kpis.completedProjects} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Team Utilization" value={d.kpis.teamUtilization} suffix="%" icon={<Gauge className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Monthly Growth</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.monthlyGrowth} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={d.charts.statusDistribution} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Portal View
──────────────────────────────────────────────────────── */
async function PortalView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getPortalAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Portal Users">
        <KpiGrid>
          <KpiCard label="Total External Users" value={d.kpis.total} accent icon={<Globe className="size-4" />} />
          <KpiCard label="Clients" value={d.kpis.clients} icon={<Users className="size-4" />} />
          <KpiCard label="Job Applicants" value={d.kpis.jobApplicants} icon={<Briefcase className="size-4" />} />
          <KpiCard label="Trainees" value={d.kpis.trainees} icon={<GraduationCap className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SpendIQ View
──────────────────────────────────────────────────────── */
async function PrmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getPrmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Procurement KPIs">
        <KpiGrid>
          <KpiCard label="Procurement Spend" value={d.kpis.totalProcurementSpend} format="currency" accent icon={<ShoppingCart className="size-4" />} />
          <KpiCard label="Approved Budget" value={d.kpis.approvedBudget} format="currency" icon={<Wallet className="size-4" />} />
          <KpiCard label="Budget Utilization" value={d.kpis.budgetUtilization} suffix="%" icon={<Percent className="size-4" />} />
          <KpiCard label="Active Vendors" value={d.kpis.activeVendors} icon={<Users className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Cohort AI View
──────────────────────────────────────────────────────── */
async function TmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getTmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Training KPIs">
        <KpiGrid>
          <KpiCard label="Total Students" value={d.kpis.totalStudents} accent icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Active Batches" value={d.kpis.activeBatches} tone="up" icon={<Activity className="size-4" />} />
          <KpiCard label="Placement Rate" value={d.kpis.placementSuccessRate} suffix="%" icon={<Award className="size-4" />} />
          <KpiCard label="Certificates Issued" value={d.kpis.certificatesIssued} icon={<CheckCircle2 className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   Workspace View
──────────────────────────────────────────────────────── */
async function WorkspaceView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getWorkspaceAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Workspace Platform KPIs">
        <KpiGrid>
          <KpiCard label="Total Accounts" value={d.kpis.totalUsers} accent icon={<Users className="size-4" />} />
          <KpiCard label="Active Staff" value={d.kpis.activeUsers} tone="up" icon={<UserCheck className="size-4" />} />
          <KpiCard label="Inactive Accounts" value={d.kpis.inactiveUsers} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Roles Configured" value={d.kpis.totalRoles} icon={<ShieldCheck className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SOP View
──────────────────────────────────────────────────────── */
async function SopView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getSopAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Playbook KPIs">
        <KpiGrid>
          <KpiCard label="Total procedures" value={d.kpis.total} accent icon={<BookText className="size-4" />} />
          <KpiCard label="Published" value={d.kpis.published} tone="up" icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Drafts" value={d.kpis.draft} icon={<Clock className="size-4" />} />
          <KpiCard label="Created in Period" value={d.kpis.createdInPeriod} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Acknowledgement Rate" value={d.kpis.acknowledgementRate} suffix="%" icon={<Percent className="size-4" />} />
          <KpiCard label="Overdue Acknowledgements" value={d.kpis.overdueAcknowledgements} tone={d.kpis.overdueAcknowledgements > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Reviews Overdue" value={d.kpis.overdueReviews} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Department Coverage" value={d.kpis.departmentCoverage} suffix="%" icon={<Building2 className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>SOPs by Department</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.byDepartment} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>SOPs by Status</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.byStatus} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   CyberVault (Digi Locker) View
──────────────────────────────────────────────────────── */
async function DlmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getDlmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="CyberVault KPIs">
        <KpiGrid>
          <KpiCard label="Vault Records" value={d.kpis.totalRecords} accent icon={<Vault className="size-4" />} />
          <KpiCard label="Credentials" value={d.kpis.credentials} icon={<Lock className="size-4" />} />
          <KpiCard label="Documents" value={d.kpis.documents} icon={<ReceiptText className="size-4" />} />
          <KpiCard label="Added in Period" value={d.kpis.addedInPeriod} icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Company Vault" value={d.kpis.companyRecords} icon={<Building2 className="size-4" />} />
          <KpiCard label="Client Records" value={d.kpis.clientRecords} icon={<Briefcase className="size-4" />} />
          <KpiCard label="Expiring Soon" value={d.kpis.expiringSoon} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Expired" value={d.kpis.expired} tone={d.kpis.expired > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Records by Type</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.byType} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Expiry by Type</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[{ label: "Record type" }, { label: "Expiring soon", align: "right" }, { label: "Expired", align: "right" }]}
              rows={d.charts.expiryByType.map((r) => [r.label, r.expiring, r.expired])}
            />
          </CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   EvalIQ (Online Tests) View
──────────────────────────────────────────────────────── */
async function OtsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getOtsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Online Tests KPIs">
        <KpiGrid>
          <KpiCard label="Total Tests" value={d.kpis.totalTests} accent icon={<FileCheck2 className="size-4" />} />
          <KpiCard label="Active Tests" value={d.kpis.activeTests} tone="up" icon={<Activity className="size-4" />} />
          <KpiCard label="Assignments" value={d.kpis.assignments} icon={<Target className="size-4" />} />
          <KpiCard label="Completed" value={d.kpis.completed} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Awaiting Evaluation" value={d.kpis.awaitingEvaluation} icon={<Clock className="size-4" />} />
          <KpiCard label="Pass Rate" value={d.kpis.passRate} suffix="%" icon={<Percent className="size-4" />} />
          <KpiCard label="Average Score" value={d.kpis.averageScore} suffix="%" icon={<Gauge className="size-4" />} />
          <KpiCard label="Certificates Issued" value={d.kpis.certificatesIssued} icon={<Award className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Assignments by Status</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.assignmentStatus} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Pass / Fail by Test</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[{ label: "Test" }, { label: "Passed", align: "right" }, { label: "Failed", align: "right" }]}
              rows={d.charts.passFailByTest.map((r) => [r.label, r.passed, r.failed])}
              emptyMsg="No evaluated results yet."
            />
          </CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   AI Bots View
──────────────────────────────────────────────────────── */
const usd = (n: number) => (n > 0 && n < 0.01 ? "< $0.01" : `$${n.toFixed(2)}`);

async function AibotsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getAibotsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="AgentOS KPIs" description="Usage figures cover the last 30 days. Cost is an estimate from the per-model prices in AgentOS settings, not an invoice.">
        <KpiGrid>
          <KpiCard label="Total Bots" value={d.kpis.totalBots} accent icon={<Bot className="size-4" />} />
          <KpiCard label="Active Bots" value={d.kpis.activeBots} tone="up" icon={<Zap className="size-4" />} />
          <KpiCard label="Total Chats" value={d.kpis.totalChats} icon={<MessagesSquare className="size-4" />} />
          <KpiCard label="Chats Today" value={d.kpis.chatsToday} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="AI Executions (30d)" value={d.kpis.executions30d} icon={<Activity className="size-4" />} />
          <KpiCard label="Tokens (30d)" value={formatCompact(d.kpis.tokens30d)} icon={<Hash className="size-4" />} />
          <KpiCard label="Est. AI Cost (30d)" value={usd(d.kpis.estimatedCostUsd30d)} icon={<DollarSign className="size-4" />} />
          <KpiCard label="Failed Executions (30d)" value={d.kpis.failedExecutions30d} tone={d.kpis.failedExecutions30d > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>AI Executions per Day</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={d.charts.dailyExecutions} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Most Used Bots</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[{ label: "Bot" }, { label: "Executions", align: "right" }, { label: "Tokens", align: "right" }, { label: "Est. cost", align: "right" }]}
              rows={d.charts.topBots.map((b) => [b.label, b.value, formatCompact(b.tokens), usd(b.costUsd)])}
              emptyMsg="No bot has been used yet."
            />
          </CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   ViralPulse (Social Media) View
──────────────────────────────────────────────────────── */
async function SmmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getSmmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Social Media KPIs">
        <KpiGrid>
          <KpiCard label="Campaigns" value={d.kpis.campaigns} accent icon={<Megaphone className="size-4" />} />
          <KpiCard label="Posts" value={d.kpis.posts} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="Published Posts" value={d.kpis.publishedPosts} tone="up" icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Scheduled Posts" value={d.kpis.scheduledPosts} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Ads" value={d.kpis.ads} icon={<Target className="size-4" />} />
          <KpiCard label="Impressions" value={d.kpis.impressions} icon={<Eye className="size-4" />} />
          <KpiCard label="Reach" value={d.kpis.reach} icon={<Users className="size-4" />} />
          <KpiCard label="Engagements" value={d.kpis.engagements} icon={<Star className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Posts by Status</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.postsByStatus} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Post Results by Platform</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[{ label: "Platform" }, { label: "Published", align: "right" }, { label: "Reach", align: "right" }, { label: "Engagements", align: "right" }, { label: "Clicks", align: "right" }]}
              rows={d.charts.platformResults.map((p) => [p.label, p.published, p.reach.toLocaleString("en-IN"), p.engagements.toLocaleString("en-IN"), p.clicks.toLocaleString("en-IN")])}
            />
          </CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   SEO View
──────────────────────────────────────────────────────── */
async function SeoView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getSeoAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="SEO KPIs">
        <KpiGrid>
          <KpiCard label="Site Audit Score" value={d.kpis.overallScore ?? "—"} accent icon={<Gauge className="size-4" />} />
          <KpiCard label="Pages Crawled" value={d.kpis.pagesCrawled} icon={<SearchCheck className="size-4" />} />
          <KpiCard label="Open Issues" value={d.kpis.openIssues} icon={<AlertCircle className="size-4" />} />
          <KpiCard label="Critical Issues" value={d.kpis.criticalIssues} tone={d.kpis.criticalIssues > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="Keywords Tracked" value={d.kpis.keywordsTracked} icon={<Hash className="size-4" />} />
          <KpiCard label="Keywords in Top 10" value={d.kpis.keywordsTop10} tone="up" icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Backlinks" value={d.kpis.backlinks} icon={<Globe className="size-4" />} />
          <KpiCard label="Open Tasks" value={d.kpis.openTasks} icon={<CheckCircle2 className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Open Issues by Severity</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.issuesBySeverity} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Keyword Positions</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.keywordPositions} /></CardContent>
        </GlassCard>
      </div>
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   CMS (Website) View
──────────────────────────────────────────────────────── */
async function CmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getCmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Website KPIs">
        <KpiGrid>
          <KpiCard label="Total Pages" value={d.kpis.totalPages} accent icon={<PanelsTopLeft className="size-4" />} />
          <KpiCard label="Published Pages" value={d.kpis.publishedPages} tone="up" icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Draft Pages" value={d.kpis.draftPages} icon={<Clock className="size-4" />} />
          <KpiCard label="Awaiting Publish" value={d.kpis.pagesAwaitingPublish} icon={<CalendarClock className="size-4" />} />
          <KpiCard label="Live Records" value={d.kpis.liveRecords} icon={<LayoutGrid className="size-4" />} />
          <KpiCard label="Media Files" value={d.kpis.mediaFiles} icon={<Eye className="size-4" />} />
          <KpiCard label="Pages Needing SEO" value={d.kpis.pagesNeedingSeo} tone={d.kpis.pagesNeedingSeo > 0 ? "down" : undefined} icon={<SearchCheck className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Pages by Site Area</CardTitle></CardHeader>
          <CardContent><BarList data={d.charts.pagesByArea} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Records by Collection</CardTitle></CardHeader>
          <CardContent>
            <DataTable
              columns={[{ label: "Collection" }, { label: "Total", align: "right" }, { label: "Live", align: "right" }, { label: "Drafts", align: "right" }]}
              rows={d.charts.recordsByCollection.map((c) => [c.label, c.total, c.live, c.drafts])}
            />
          </CardContent>
        </GlassCard>
      </div>
    </>
  );
}


/** Reads one product's filters from the URL; with a prefix, from that product's own `<prefix>_…` params (date range falls back to the dashboard-wide one). */
export function panelFiltersFromParams(sp: Record<string, string | string[] | undefined>, prefix?: string): PanelAnalyticsFilters {
  const get = (key: string) => {
    const v = sp[prefix ? `${prefix}_${key}` : key] ?? (prefix && ["dateFrom", "dateTo", "granularity"].includes(key) ? sp[key] : undefined);
    return typeof v === "string" && v ? v : undefined;
  };
  return {
    dateFrom: get("dateFrom"),
    dateTo: get("dateTo"),
    granularity: get("granularity") as PanelAnalyticsFilters["granularity"],
    status: get("status"),
    category: get("category"),
    departmentId: get("departmentId"),
    role: get("role"),
    source: get("source"),
    employmentType: get("employmentType"),
    gender: get("gender"),
    expenseType: get("expenseType"),
    paymentStatus: get("paymentStatus"),
    mode: get("mode"),
    programId: get("programId"),
  };
}

/**
 * One product's analytics: heading, short description, search & filters, KPI cards, graphs and tables.
 * Used by the dashboard (one block per product, `compact` + filter `prefix`) and the standalone analytics page.
 */
export async function PanelAnalyticsBlock({
  panel,
  user,
  sp,
  prefix,
  compact = false,
}: {
  panel: PanelKey;
  user: NonNullable<Awaited<ReturnType<typeof getCurrentHubUser>>>;
  sp: Record<string, string | string[] | undefined>;
  prefix?: string;
  compact?: boolean;
}) {
  const config = (await panelConfigs())[panel];
  const icon = <ProductLogo productKey={panel} size={40} />;
  const roles = user.roles;
  // The same rule that lists this page in the Workspace navigation: role / permission override, plan and switched-on products.
  const isAuthorized = await checkWorkspaceAccess(user, `analytics.${panel}`);
  // People with the Command Center permission get the full company-wide view; others the role-scoped one.
  const executive = isAuthorized && canViewCommandCenter({ roles: user.roles, permissionOverrides: user.permissionOverrides ?? null });
  const filters = panelFiltersFromParams(sp, prefix);

  return (
    <section id={`product-${panel}`} data-panel-section={panel} className="scroll-mt-24 space-y-5">
      {compact ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex ${compact ? "size-10" : "size-11"} shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[var(--color-brand-accent)] text-white shadow-md`}>
              {icon}
            </div>
            <div>
              {compact ? (
                <h2 className="text-xl font-black tracking-tight text-foreground">{config.label}</h2>
              ) : (
                <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">{config.label}</h1>
              )}
              <p className="max-w-2xl text-sm text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <Link
            href={config.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[var(--color-brand-accent)] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            {config.ctaLabel}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      ) : (
        <PanelPageHeader
          breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Analytics" }, { label: config.label }]}
          title={<>{config.label}</>}
          description={<>{config.description}</>}
          actions={
            <Link
          href={config.href}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-[var(--color-brand-accent)] px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
        >
          {config.ctaLabel}
          <ArrowUpRight className="size-4" />
        </Link>
          }
        />
      )}

      <AnalyticsFilterBar fields={PANEL_FILTER_FIELDS[panel]} title={`${config.label} Search & Filters`} prefix={prefix} />

      {!isAuthorized ? (
        <AccessDeniedView panelName={config.label} userRoles={roles} />
      ) : executive && hasExecutiveView(panel) ? (
        <ExecutiveViews panel={panel} filters={filters} />
      ) : (
        <>
          {panel === "fms"       && <FmsView filters={filters} />}
          {panel === "hrms"      && <HrmsView filters={filters} userId={user.id} />}
          {panel === "lms"       && <LmsView filters={filters} />}
          {panel === "messenger" && <MessengerView filters={filters} />}
          {panel === "pms"       && <PmsView filters={filters} userId={user.id} />}
          {panel === "portal"    && <PortalView filters={filters} />}
          {panel === "prms"      && <PrmsView filters={filters} />}
          {panel === "tms"       && <TmsView filters={filters} />}
          {panel === "workspace" && <WorkspaceView filters={filters} />}
          {panel === "sop"       && <SopView filters={filters} />}
          {panel === "dlms"      && <DlmsView filters={filters} />}
          {panel === "ots"       && <OtsView filters={filters} />}
          {panel === "aibots"    && <AibotsView filters={filters} />}
          {panel === "smms"      && <SmmsView filters={filters} />}
          {panel === "seo"       && <SeoView filters={filters} />}
          {panel === "cms"       && <CmsView filters={filters} />}
          {panel === "lpms"      && <LpmsView filters={filters} />}
        </>
      )}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   ContractFlow View
──────────────────────────────────────────────────────── */
async function LpmsView({ filters }: { filters?: PanelAnalyticsFilters }) {
  const d = await getLpmsAnalytics(filters);
  return (
    <>
      <AlertBanner alerts={d.alerts} />
      <ExecutiveSection title="Legal & Documents KPIs">
        <KpiGrid>
          <KpiCard label="Total Documents" value={d.kpis.totalDocuments} accent icon={<FileText className="size-4" />} />
          <KpiCard label="Active Documents" value={d.kpis.activeDocuments} tone="up" icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Draft Documents" value={d.kpis.draftDocuments} icon={<Clock className="size-4" />} />
          <KpiCard label="Pending Approvals" value={d.kpis.pendingApprovals} tone={d.kpis.pendingApprovals > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
          <KpiCard label="AI Generated" value={d.kpis.aiGenerated} icon={<Bot className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>
    </>
  );
}
