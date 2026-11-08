import Link from "next/link";
import {
  IndianRupee,
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Percent,
  ReceiptText,
  Target,
  Users,
  CheckCircle2,
  Handshake,
  Rocket,
  AlarmClock,
  Gauge,
  Clock,
  GraduationCap,
  Award,
  Boxes,
  Server,
  CreditCard,
  ShoppingCart,
  Bot,
  Mic,
  MessageSquare,
  Video,
  LayoutGrid,
  FolderKanban,
  Briefcase,
  Globe,
  Landmark,
  AlertTriangle,
  AlertCircle,
  Activity,
  ArrowUpRight,
  Building2,
  UserCheck,
  ShieldCheck,
  MessagesSquare,
  LayoutDashboard,
  FileText,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import ExecutiveSection from "@/components/products/commandos/ExecutiveSection";
import { AnalyticsFilterBar } from "@/components/products/commandos/AnalyticsFilterBar";
import type { CommandCenterStats } from "@/lib/products/commandos/command-center";
import { formatCurrency } from "@/lib/utils";
import { productAnalyticsPath } from "@/lib/platform/saas/product-routes";
import ProductLogo from "@/components/products/ProductLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Product status grid config
// ─────────────────────────────────────────────────────────────────────────────

const PANEL_GRID = [
  {
    key: "fms",
    label: "Finance",
    icon: <Landmark className="size-5" />,
    analyticsHref: productAnalyticsPath("fms"),
    panelHref: "/cashflow-ai",
    color: "from-primary to-brand-accent",
  },
  {
    key: "hrms",
    label: "HR",
    icon: <Users className="size-5" />,
    analyticsHref: productAnalyticsPath("hrms"),
    panelHref: "/talentos",
    color: "from-brand-deep to-primary",
  },
  {
    key: "lms",
    label: "Leads / CRM",
    icon: <LayoutGrid className="size-5" />,
    analyticsHref: productAnalyticsPath("lms"),
    panelHref: "/dealflow-ai",
    color: "from-primary to-brand-deep",
  },
  {
    key: "messenger",
    label: "Messenger",
    icon: <MessagesSquare className="size-5" />,
    analyticsHref: productAnalyticsPath("messenger"),
    panelHref: "/huddle-ai",
    color: "from-brand-deep to-brand-accent",
  },
  {
    key: "pms",
    label: "Projects",
    icon: <FolderKanban className="size-5" />,
    analyticsHref: productAnalyticsPath("pms"),
    panelHref: "/sprintos",
    color: "from-brand-accent to-brand-deep",
  },
  {
    key: "portal",
    label: "Portal",
    icon: <Globe className="size-5" />,
    analyticsHref: productAnalyticsPath("portal"),
    panelHref: "/clientos",
    color: "from-primary/80 to-brand-deep/80",
  },
  {
    key: "prms",
    label: "Procurement",
    icon: <ShoppingCart className="size-5" />,
    analyticsHref: productAnalyticsPath("prms"),
    panelHref: "/spendiq",
    color: "from-brand-deep/80 to-primary/80",
  },
  {
    key: "tms",
    label: "Training",
    icon: <GraduationCap className="size-5" />,
    analyticsHref: productAnalyticsPath("tms"),
    panelHref: "/cohort-ai",
    color: "from-brand-accent to-primary",
  },
  {
    key: "workspace",
    label: "Workspace",
    icon: <LayoutDashboard className="size-5" />,
    analyticsHref: productAnalyticsPath("workspace"),
    panelHref: "/commandos",
    color: "from-brand-deep to-brand-accent/80",
  },
  {
    key: "aibots",
    label: "AgentOS",
    icon: <Bot className="size-5" />,
    analyticsHref: productAnalyticsPath("aibots"),
    panelHref: "/agentos",
    color: "from-primary to-brand-accent",
  },
  {
    key: "cms",
    label: "Website CMS",
    icon: <Globe className="size-5" />,
    analyticsHref: productAnalyticsPath("cms"),
    panelHref: "/sitecraft-ai",
    color: "from-brand-deep to-primary",
  },
  {
    key: "dlms",
    label: "CyberVault",
    icon: <Boxes className="size-5" />,
    analyticsHref: productAnalyticsPath("dlms"),
    panelHref: "/cybervault",
    color: "from-primary to-brand-deep",
  },
  {
    key: "ots",
    label: "Online Tests",
    icon: <GraduationCap className="size-5" />,
    analyticsHref: productAnalyticsPath("ots"),
    panelHref: "/evaliq",
    color: "from-brand-accent to-brand-deep",
  },
  {
    key: "seo",
    label: "SEO",
    icon: <Activity className="size-5" />,
    analyticsHref: productAnalyticsPath("seo"),
    panelHref: "/rankmax-ai",
    color: "from-primary to-brand-accent",
  },
  {
    key: "smms",
    label: "Social Media",
    icon: <MessagesSquare className="size-5" />,
    analyticsHref: productAnalyticsPath("smms"),
    panelHref: "/viralpulse-ai",
    color: "from-brand-deep to-primary",
  },
  {
    key: "sop",
    label: "SOPs",
    icon: <ReceiptText className="size-5" />,
    analyticsHref: productAnalyticsPath("sop"),
    panelHref: "/playbook-ai",
    color: "from-primary to-brand-deep",
  },
  {
    key: "lpms",
    label: "Legal & Documents",
    icon: <FileText className="size-5" />,
    analyticsHref: productAnalyticsPath("lpms"),
    panelHref: "/contractflow-ai",
    color: "from-brand-deep to-brand-accent",
  },
];

const PRODUCT_CARD_DESCRIPTIONS: Record<string, string> = {
  workspace: "Bring company setup, people, finance, operations and product activity together in one workspace, with a central view of daily business work.",
  hrms: "Manage employee records, recruitment, attendance, leave, payroll and HR documents from one place, with clear visibility into your workforce.",
  pms: "Plan projects, assign tasks, track milestones and timesheets, and review delivery costs so teams can see progress and next steps.",
  lms: "Capture and qualify leads, manage sales pipelines, coordinate campaigns and follow deals through closing and client onboarding.",
  fms: "Create invoices, track income and expenses, collect payments, reconcile transactions and review financial activity in one connected ledger.",
  prms: "Manage purchase requests, purchase orders, vendor bills, expenses and assets, with approval steps that keep spending organized.",
  tms: "Organize training programs, cohorts and batches; share learning materials, track learner progress and issue completion certificates.",
  messenger: "Keep company conversations in channels and direct messages, and bring teams together with voice meetings, calls and announcements.",
  sop: "Create and maintain operating procedures and policies, track revisions, and give teams a consistent way to follow approved processes.",
  lpms: "Prepare and manage contracts and legal documents, route them through approval steps, and collect signatures with a clear status trail.",
  dlms: "Store sensitive credentials and business documents in protected lockers, manage access, and keep track of expiry dates.",
  ots: "Build and run timed online assessments, review automated grading and integrity signals, and provide verifiable certificates to candidates.",
  aibots: "Create AI agents and chatbots grounded in your business knowledge, then manage their content and conversations in one workspace.",
  intelligence: "Explore business metrics with conversational queries and live data, helping teams find trends and answer operational questions.",
  smms: "Plan social content, create campaign posts, organize a publishing calendar and review engagement across connected channels.",
  seo: "Monitor search rankings, review technical SEO issues, manage backlinks and sitemaps, and prioritize improvements to organic visibility.",
  cms: "Build and update your website without code, publish pages and blogs, customize the visual theme and manage lead capture forms.",
  portal: "Give clients, students, partners and applicants a branded place to access their information, documents, messages and requests.",
  support: "Help teams find answers through a searchable knowledge base and AI assistant, then track support requests and replies in one place.",
  website: "Publish your company's public website on a custom domain, manage its pages and content, and keep it secured with automatic SSL.",
};

const PRODUCT_CARD_KEYWORDS: Record<string, string[]> = {
  workspace: ["Operations", "Automation", "Overview", "Company setup", "Team activity", "Users", "Roles", "Workflows"],
  hrms: ["Employees", "Attendance", "Payroll", "Recruitment", "Leave", "Employee records", "HR documents", "Workforce"],
  pms: ["Projects", "Tasks", "Kanban", "Milestones", "Timesheets", "Delivery", "Team workload", "Cost tracking"],
  lms: ["Leads", "Pipeline", "CRM", "Campaigns", "Follow-ups", "Deal tracking", "Sales", "Client onboarding"],
  fms: ["Invoices", "Payments", "Accounting", "Expenses", "Ledger", "Reconciliation", "Receivables", "Financial records"],
  prms: ["Procurement", "Vendors", "Purchase orders", "Vendor bills", "Expenses", "Assets", "Approvals", "Spend tracking"],
  tms: ["Training", "Cohorts", "Batches", "Learning", "Curriculum", "Learner progress", "Certificates", "Programs"],
  messenger: ["Chat", "Channels", "Direct messages", "Voice meetings", "Company calls", "Announcements", "Team updates", "Collaboration"],
  sop: ["Procedures", "Policies", "Version history", "Approvals", "Staff compliance", "Acknowledgements", "Standards", "Operations"],
  lpms: ["Contracts", "Legal documents", "Templates", "Approvals", "Signatures", "Agreements", "Document status", "Legal workflow"],
  dlms: ["Credentials", "Documents", "Expiry alerts", "Secure lockers", "Access control", "Sensitive files", "Encrypted storage", "Vaults"],
  ots: ["Assessments", "Question banks", "Timed tests", "Auto grading", "Anti-cheat", "Results", "Certificates", "Candidate testing"],
  aibots: ["AI agents", "Knowledge base", "Chatbots", "Trained bots", "Business content", "Conversations", "Copilots", "AI assistance"],
  intelligence: ["Analytics", "Live data", "Insights", "Natural language", "Business metrics", "Trend discovery", "Queries", "Decision support"],
  smms: ["Social content", "Post generation", "Campaigns", "Publishing calendar", "Multi-channel", "Engagement", "Social analytics", "Content planning"],
  seo: ["Rank tracking", "SEO audits", "Backlinks", "Sitemaps", "Technical SEO", "Search visibility", "Google rankings", "Organic growth"],
  cms: ["Website builder", "Pages", "CMS", "Blogs", "Themes", "AI website creation", "Lead forms", "Content publishing"],
  portal: ["Client access", "Student portal", "Applicant portal", "Documents", "Messages", "Requests", "Self-service", "Branded access"],
  support: ["Help center", "AI assistant", "Knowledge base", "Support requests", "FAQs", "Troubleshooting", "Request tracking", "Customer support"],
  website: ["Public website", "Custom domain", "SSL", "Company pages", "Website content", "Site publishing", "Domain hosting", "Online presence"],
};

// ─────────────────────────────────────────────────────────────────────────────
// Module stat map (from command-center `modules` array)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The executive part of the dashboard (`/commandos`) — the former Command
 * Center page, moved here as one component: financial position, business and
 * area KPIs, financial intelligence, and the product performance matrix.
 *
 * Presentational only. The data arrives from `loadExecutiveOverview`
 * (`src/lib/commandos/executive-overview.ts`), which returns `null` for anyone
 * without the Command Center permission — the dashboard renders this component
 * only when it got data, so no figure reaches a viewer who may not see it.
 */
export default function CommandCenterSections({ stats, companyName }: { stats: CommandCenterStats; companyName: string }) {
  // Build quick stat lookup from module summaries
  const moduleStats = Object.fromEntries(stats.modules.map((m) => [m.key, m.stats]));

  return (
    <section id="executive-overview" data-section="executive-overview" className="space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-black tracking-tight text-foreground sm:text-2xl">Company overview</h2>
        <p className="text-sm text-muted-foreground">
          Real-time executive overview aggregated live across every {companyName} system.{" "}
          <span className="text-xs opacity-60">Updated {new Date(stats.generatedAt).toLocaleTimeString("en-IN")}</span>
        </p>
      </div>

      {/* Date range and granularity of the executive figures below */}
      <AnalyticsFilterBar title="Company overview filters" />

      {/* ── FMS Top-Line Financial KPIs ── */}
      <ExecutiveSection title="Financial Position (CashFlow Ledger)" description="Real ledger-backed figures from the Finance Management System.">
        <KpiGrid>
          <KpiCard label="Ledger Revenue" value={stats.finance.totalRevenue} format="currency" accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="Ledger Expenses" value={stats.finance.totalExpenses} format="currency" icon={<ReceiptText className="size-4" />} />
          <KpiCard label="Net Profit" value={stats.finance.netProfit} format="currency" tone={stats.finance.netProfit >= 0 ? "up" : "down"} icon={<PiggyBank className="size-4" />} />
          <KpiCard label="Cash + Bank" value={stats.finance.totalCash + stats.finance.totalBankBalance} format="currency" icon={<Wallet className="size-4" />} />
          <KpiCard label="Accounts Receivable" value={stats.finance.accountsReceivable} format="currency" icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Accounts Payable" value={stats.finance.accountsPayable} format="currency" icon={<TrendingDown className="size-4" />} />
          <KpiCard label="Pending Approvals" value={stats.finance.pendingApprovals} tone={stats.finance.pendingApprovals > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
          <KpiCard label="Overdue Invoices" value={stats.finance.overdueInvoices} tone={stats.finance.overdueInvoices > 0 ? "down" : undefined} icon={<AlertTriangle className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {/* ── Business Overview (derived) ── */}
      <ExecutiveSection title="Business Overview" description="Composite figures derived from SprintOS, Cohort AI, and CRM activity.">
        <KpiGrid>
          <KpiCard label="Total Revenue" value={stats.business.totalRevenue} format="currency" accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="Monthly Revenue" value={stats.business.monthlyRevenue} format="currency" icon={<Wallet className="size-4" />} />
          <KpiCard label="Annual Revenue" value={stats.business.annualRevenue} format="currency" icon={<TrendingUp className="size-4" />} />
          <KpiCard label="Gross Profit" value={stats.business.grossProfit} format="currency" tone={stats.business.grossProfit >= 0 ? "up" : "down"} icon={<PiggyBank className="size-4" />} />
          <KpiCard label="Net Profit" value={stats.business.netProfit} format="currency" tone={stats.business.netProfit >= 0 ? "up" : "down"} icon={<PiggyBank className="size-4" />} />
          <KpiCard label="Profit Margin" value={stats.business.profitMarginPercent} suffix="%" tone={stats.business.profitMarginPercent >= 0 ? "up" : "down"} icon={<Percent className="size-4" />} />
          <KpiCard label="Total Expenses" value={stats.business.totalExpenses} format="currency" icon={<ReceiptText className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {/* ── Financial Charts ── */}
      <ExecutiveSection title="Financial Intelligence" description="Company-wide revenue, expense, and profit trend — all-time, by month.">
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Revenue Trend</CardTitle></CardHeader>
            <CardContent><TimeSeriesChart data={stats.financial.revenueTrend} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Expense Trend</CardTitle></CardHeader>
            <CardContent><TimeSeriesChart data={stats.financial.expenseTrend} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Profit / Loss Trend</CardTitle></CardHeader>
            <CardContent><TimeSeriesChart data={stats.financial.profitTrend} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Expense by Category</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.financial.expenseByCategory} /></CardContent>
          </GlassCard>
        </div>
      </ExecutiveSection>

      {/* ── Sales & CRM ── */}
      <ExecutiveSection title="Sales & CRM">
        <KpiGrid>
          <KpiCard label="Total Leads" value={stats.salesCrm.totalLeads} accent icon={<Target className="size-4" />} />
          <KpiCard label="New Leads Today" value={stats.salesCrm.newLeadsToday} icon={<Target className="size-4" />} />
          <KpiCard label="Conversion Rate" value={stats.salesCrm.conversionRate} suffix="%" icon={<Percent className="size-4" />} />
          <KpiCard label="Active Clients" value={stats.salesCrm.activeClients} icon={<Users className="size-4" />} />
          <KpiCard label="Closed Deals" value={stats.salesCrm.closedDeals} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Pipeline Value" value={stats.salesCrm.pipelineValue} format="currency" icon={<Handshake className="size-4" />} />
          <KpiCard label="Won Value" value={stats.salesCrm.wonValue} format="currency" icon={<Handshake className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {/* ── Operations ── */}
      <ExecutiveSection title="Operations">
        <KpiGrid>
          <KpiCard label="Active Projects" value={stats.operations.activeProjects} accent icon={<Rocket className="size-4" />} />
          <KpiCard label="Completed Projects" value={stats.operations.completedProjects} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="Overdue Projects" value={stats.operations.overdueProjects} tone={stats.operations.overdueProjects > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
          <KpiCard label="Team Utilization" value={stats.operations.teamUtilization} suffix="%" icon={<Gauge className="size-4" />} />
          <KpiCard label="Billable Hours" value={Math.round(stats.operations.billableHours)} suffix="h" icon={<Clock className="size-4" />} />
          <KpiCard label="Non-Billable Hours" value={Math.round(stats.operations.nonBillableHours)} suffix="h" icon={<Clock className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {/* ── Training ── */}
      <ExecutiveSection title="Training">
        <KpiGrid>
          <KpiCard label="Active Students" value={stats.training.activeStudents} accent icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Industrial Training" value={stats.training.industrialStudents} icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Internship Students" value={stats.training.internshipStudents} icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Placement Rate" value={stats.training.placementRate} suffix="%" icon={<Award className="size-4" />} />
          <KpiCard label="Training Revenue" value={stats.training.trainingRevenue} format="currency" icon={<IndianRupee className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {/* ── Procurement ── */}
      <ExecutiveSection title="Procurement">
        <KpiGrid>
          <KpiCard label="Total Spend" value={stats.procurement.totalProcurementSpend} format="currency" accent icon={<ShoppingCart className="size-4" />} />
          <KpiCard label="Infrastructure Cost" value={stats.procurement.infrastructureCost} format="currency" icon={<Server className="size-4" />} />
          <KpiCard label="SaaS Cost" value={stats.procurement.saasCost} format="currency" icon={<CreditCard className="size-4" />} />
          <KpiCard label="Asset Value" value={stats.procurement.assetValue} format="currency" icon={<Boxes className="size-4" />} />
          <KpiCard label="Pending Purchase Orders" value={stats.procurement.pendingPurchaseOrders} icon={<ReceiptText className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      {/* ── AI & Communication ── */}
      <ExecutiveSection title="AI & Communication">
        <KpiGrid>
          <KpiCard label="AI Chat Sessions" value={stats.aiComms.aiChatSessions} accent icon={<Bot className="size-4" />} />
          <KpiCard label="Voice AI Usage" value={stats.aiComms.voiceAiUsage} icon={<Mic className="size-4" />} />
          <KpiCard label="Internal Messages Today" value={stats.aiComms.internalMessages} icon={<MessageSquare className="size-4" />} />
          <KpiCard label="Active Meetings" value={stats.aiComms.activeMeetings} icon={<Video className="size-4" />} />
        </KpiGrid>
      </ExecutiveSection>

      <PanelPerformanceMatrix modules={stats.modules} />
    </section>
  );
}

/**
 * The Product Performance Matrix: one card per product with its live headline numbers and Analytics / Open links.
 * `modules` is absent for people without the Command Center permission (cards then show links only);
 * `products` limits and `locked` marks products outside the plan (Open becomes an upgrade link).
 */
export function PanelPerformanceMatrix({
  modules,
  stats,
  panels,
  analyticsPanels,
  query,
  names,
  unavailable,
  registry,
}: {
  modules?: CommandCenterStats["modules"];
  /** Headline figures per product key (take precedence over `modules`). */
  stats?: Record<string, { label: string; value: number }[]>;
  /** Product keys this person may see; omitted = all. */
  panels?: string[];
  /** Product keys whose analytics this person may open; omitted = all. */
  analyticsPanels?: string[];
  /** Case-insensitive text matched against the product name. */
  query?: string;
  /** Product Registry names, so every card is titled like the product everywhere else. */
  names?: Record<string, string>;
  /** Products the platform switched off (for everyone or this company): their cards are not shown at all. */
  unavailable?: string[];
  /** The Product Registry's products: one card each, in order — including products that have no analytics of their own. */
  registry?: { key: string; name: string; description: string; route: string }[];
}) {
  const moduleStats = { ...Object.fromEntries((modules ?? []).map((m) => [m.key, m.stats])), ...Object.fromEntries(Object.entries(stats ?? {}).filter(([, v]) => v.length > 0)) };
  const q = query?.trim().toLowerCase();
  const base = registry
    ? registry.map((r) => {
        const known = PANEL_GRID.find((g) => g.key === r.key);
        return {
          key: r.key,
          label: r.name,
          description: PRODUCT_CARD_DESCRIPTIONS[r.key] ?? r.description,
          icon: <ProductLogo productKey={r.key} size={44} />,
          color: known?.color ?? "from-primary to-brand-accent",
          analyticsHref: known?.analyticsHref ?? null,
          panelHref: r.route,
        };
      })
    : PANEL_GRID.map((p) => ({ ...p, description: PRODUCT_CARD_DESCRIPTIONS[p.key] ?? "", analyticsHref: p.analyticsHref as string | null }));
  const grid = base
    .map((p) => ({ ...p, label: names?.[p.key] ?? p.label }))
    .filter((p) => !unavailable?.includes(p.key))
    .filter((p) => !panels || panels.includes(p.key))
    .filter((p) => !q || p.label.toLowerCase().includes(q) || p.key.includes(q));
  return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 px-4 py-4 shadow-sm sm:px-5">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Workspace overview</p>
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">Product Performance Matrix</h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              See key activity and available metrics across your products. Open a product to continue working, or choose Analytics for a closer look at its performance.
            </p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {grid.map((panel) => {
            const mStats = moduleStats[panel.key] ?? [];
            return (
              <GlassCard
                key={panel.key}
                className="group relative flex h-[340px] flex-col overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-primary/[0.07] via-card/95 to-background shadow-sm transition-all duration-300 hover:border-primary/40 hover:shadow-[0_18px_48px_-24px_rgba(16,185,129,0.45)]"
              >
                <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-14 z-0 size-36 rounded-full bg-primary/10 blur-3xl transition-colors duration-300 group-hover:bg-primary/20" />
                <CardHeader className="relative z-10 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 pb-2">
                  <div className="mt-0.5 flex size-11 shrink-0 items-center justify-center transition-transform duration-300 group-hover/gcard:scale-105">
                    {panel.icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="line-clamp-2 text-base font-semibold leading-5 tracking-tight">{panel.label}</CardTitle>
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                      {panel.description || `Open ${panel.label} to manage its work and latest activity.`}
                    </p>
                    <div role="list" aria-label={`${panel.label} keywords`} className="mt-2 flex flex-wrap gap-1.5">
                      {(PRODUCT_CARD_KEYWORDS[panel.key] ?? []).map((keyword) => (
                        <span key={keyword} role="listitem" className="inline-flex h-5 items-center rounded-full border border-primary/15 bg-primary/[0.05] px-2 text-[9px] font-medium leading-none text-muted-foreground">
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="relative z-10 mt-auto space-y-3">
                  <dl className="grid grid-cols-3 gap-2">
                    {[0, 1, 2].map((i) => {
                      const s = mStats[i];
                      return (
                        <div key={i} className="flex h-[68px] flex-col items-center justify-center rounded-xl border border-border/50 bg-background/45 px-2 text-center shadow-sm transition-colors duration-200 hover:border-primary/30 hover:bg-primary/[0.04]">
                          <dd className="text-lg font-semibold tabular-nums tracking-tight text-foreground">
                            {s ? (s.value > 999 ? formatCurrency(s.value) : s.value.toLocaleString("en-IN")) : "—"}
                          </dd>
                          <dt className="mt-0.5 w-full truncate text-[10px] text-muted-foreground">{s?.label ?? "No data"}</dt>
                        </div>
                      );
                    })}
                  </dl>
                  <div className="flex items-center gap-2 pt-0.5">
                    {panel.analyticsHref && (!analyticsPanels || analyticsPanels.includes(panel.key)) && (
                    <Link
                      href={panel.analyticsHref}
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/35 px-3 text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-primary/[0.07] hover:text-primary"
                    >
                      <Activity className="size-3" />
                      Analytics
                    </Link>
                    )}
                    <Link
                      href={panel.panelHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-[var(--color-brand-accent)] px-3 text-xs font-semibold text-white shadow-sm shadow-primary/20 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:shadow-primary/25"
                    >
                      Open
                      <ArrowUpRight className="size-3" />
                    </Link>
                  </div>
                </CardContent>
              </GlassCard>
            );
          })}
        </div>
      </div>
  );
}
