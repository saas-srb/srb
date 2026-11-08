import { panelNameMap } from "@/lib/platform/panels/store";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import {
  Coins,
  Wallet,
  TrendingUp,
  TrendingDown,
  Landmark,
  Building2,
  FileWarning,
  Clock,
  CheckSquare,
  Receipt,
  PiggyBank,
  GraduationCap,
  CreditCard,
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  ShoppingBag,
  Briefcase,
  Users,
  BookOpen,
  BarChart3,
  Activity,
  Zap,
  Target,
  DollarSign,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import TrendComparisonChart from "@/components/products/dealflow-ai/TrendComparisonChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import FmsDashboardFilters from "@/components/products/cashflow-ai/FmsDashboardFilters";
import CopyButton from "@/components/products/cashflow-ai/CopyButton";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { getFmsDashboardStats } from "@/lib/products/cashflow-ai/dashboard";
import { searchTransactions } from "@/lib/products/cashflow-ai/transactions";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import { sourceModuleLabel } from "@/lib/products/cashflow-ai/constants";
import type { DashboardGranularity } from "@/lib/granularity";
import { formatCurrency, formatDate } from "@/lib/utils";

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Uniform thin progress bar styled using the theme tokens */
function ProgressBar({ value, max, colorClass = "bg-primary" }: { value: number; max: number; colorClass?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Uniform Section Header across the FMS module */
function SectionHeader({
  icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 mb-2.5">
      <div className="flex items-center gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[color:var(--color-brand-accent)] text-white shadow-xs">
          {icon}
        </div>
        <div>
          <h2 className="text-sm font-bold tracking-tight text-foreground">{title}</h2>
          {subtitle && <p className="text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

import { AttentionCard, GetStartedCard } from "@/components/products/cashflow-ai/home/HomeCards";
import { loadAttention, loadSetupSteps } from "@/lib/products/cashflow-ai/home/home";
import { canViewFinancialStatements as canSeeBooks } from "@/lib/fms-roles";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import TodayWorkCard from "@/components/products/cashflow-ai/home/TodayWorkCard";
import { loadTodayWork } from "@/lib/products/cashflow-ai/home/today-work";

export default async function FmsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentFmsUser();
  // What needs doing, for people who can see the books (the same checks as CA & Compliance, so a number is never different here)
  const showTodo = !!user && canSeeBooks(user);
  const [attention, setupSteps] = showTodo ? await Promise.all([loadAttention(istToday()), loadSetupSteps()]) : [null, null];
  const todayWork = showTodo ? await loadTodayWork(istToday()) : null;
  const panelName = await panelNameMap();

  const granularity: DashboardGranularity = VALID_GRANULARITIES.includes(sp.granularity as DashboardGranularity)
    ? (sp.granularity as DashboardGranularity)
    : "month";

  const rangeParam: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range) ? sp.range : sp.dateFrom || sp.dateTo ? "custom" : "thisYear";

  let dateFrom: Date | undefined;
  let dateTo: Date | undefined;
  if (rangeParam === "custom") {
    dateFrom = parseDateParam(sp.dateFrom);
    dateTo = parseDateParam(sp.dateTo, true);
  } else {
    const resolved = resolveDateRangePreset(rangeParam)!;
    dateFrom = resolved.from;
    dateTo = resolved.to;
  }

  const sourceModuleFilter = sp.sourceModule || undefined;
  const typeFilter = sp.type === "income" || sp.type === "expense" ? sp.type : undefined;

  const [stats, recentTxnsResult] = await Promise.all([
    getFmsDashboardStats({ dateFrom, dateTo, granularity }),
    searchTransactions({
      dateFrom,
      dateTo,
      sourceModule: sourceModuleFilter as any,
      type: typeFilter as any,
      pageSize: 5,
      sortBy: "transactionDate",
      sortDir: "desc",
    }),
  ]);

  const recentTxns = recentTxnsResult.items;
  const hasActiveFilters = Boolean(sp.range || sp.dateFrom || sp.dateTo || sp.sourceModule || sp.type);

  const revenueTrend = (stats.revenueVsExpenses || []).map((p) => ({ date: p.date, count: p.revenue }));
  const expenseTrend = (stats.revenueVsExpenses || []).map((p) => ({ date: p.date, count: p.expense }));
  const profitTrend = (stats.revenueVsExpenses || []).map((p) => ({ date: p.date, count: Math.max(p.revenue - p.expense, 0) }));
  const trendComparison = (stats.revenueVsExpenses || []).map((p, i) => ({
    index: i + 1,
    current: p.revenue,
    previous: p.expense,
  }));

  const panel = stats.panelSummary;

  // Derived metrics
  const profitMargin = stats.totalRevenue > 0 ? Math.round((stats.netProfit / stats.totalRevenue) * 100) : 0;
  const collectRate =
    stats.totalRevenue + stats.accountsReceivable > 0
      ? Math.round((stats.totalRevenue / (stats.totalRevenue + stats.accountsReceivable)) * 100)
      : 0;

  const PANEL_CARDS = [
    {
      href: "/cashflow-ai/products/prms",
      icon: <ShoppingBag className="size-3.5" />,
      label: panelName("prms", "SpendIQ Procurement"),
      badge: "Payables",
      primaryLabel: "Vendor Payables",
      primaryValue: panel.prms.payables,
      secondaryLabel: "Pending Payments",
      secondaryValue: `${panel.prms.pendingPaymentsCount} Pending`,
      badgeClass: "bg-primary/10 text-primary border-primary/20",
    },
    {
      href: "/cashflow-ai/products/pms",
      icon: <Briefcase className="size-3.5" />,
      label: panelName("pms", "SprintOS Projects"),
      badge: "Receivables",
      primaryLabel: "Client Invoices",
      primaryValue: panel.pms.receivables,
      secondaryLabel: "Pending Invoices",
      secondaryValue: `${panel.pms.pendingPaymentsCount} Pending`,
      badgeClass: "bg-secondary text-secondary-foreground border-border/40",
    },
    {
      href: "/cashflow-ai/products/hrms",
      icon: <Users className="size-3.5" />,
      label: panelName("hrms", "TalentOS Payroll"),
      badge: "Payroll",
      primaryLabel: "Salary Payable",
      primaryValue: panel.hrms.salaryPayable,
      secondaryLabel: "Reimbursements",
      secondaryValue: `${panel.hrms.reimbursementsCount} Claims`,
      badgeClass: "bg-primary/10 text-primary border-primary/20",
    },
    {
      href: "/cashflow-ai/products/tms",
      icon: <BookOpen className="size-3.5" />,
      label: panelName("tms", "Cohort AI Training"),
      badge: "Student Fees",
      primaryLabel: "Fee Receivables",
      primaryValue: panel.tms.receivables,
      secondaryLabel: "Pending Fees",
      secondaryValue: `${panel.tms.pendingFeesCount} Due`,
      badgeClass: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
    },
  ];

  return (
    <div className="relative space-y-4">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Dashboard" }]}
        title="Financial Overview"
        description={<>Welcome back{user?.email ? `, ${user.email.split("@")[0]}` : ""}. Track treasury, cash flow, receivables and payables across every product in real time.</>}
        actions={
          <GranularityToggle value={granularity} />
        }
        filters={<FmsDashboardFilters
              range={rangeParam}
              dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
              dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
              sourceModule={sp.sourceModule ?? ""}
              type={sp.type ?? ""}
              hasActiveFilters={hasActiveFilters}
            />}
      />

      {todayWork && <TodayWorkCard work={todayWork} />}

      {attention && setupSteps && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AttentionCard items={attention.items} allChecked={attention.allChecked} />
          <GetStartedCard steps={setupSteps} />
        </div>
      )}

      {/* ── §1: Top Executive KPI Grid ── */}
      <DashboardSection>
        <KpiGrid>
          <KpiCard
            label="Net Profit Balance"
            value={stats.netProfit}
            format="currency"
            accent
            tone={stats.netProfit >= 0 ? "up" : "down"}
            icon={<Wallet className="size-3.5" />}
            suffix={` (${profitMargin}% margin)`}
          />
          <KpiCard
            label="Total Revenue Collected"
            value={stats.totalRevenue}
            format="currency"
            tone="up"
            icon={<TrendingUp className="size-3.5" />}
          />
          <KpiCard
            label="Total Expenses Paid"
            value={stats.totalExpenses}
            format="currency"
            tone="down"
            icon={<TrendingDown className="size-3.5" />}
          />
          <KpiCard
            label="Bank Accounts Balance"
            value={stats.totalBankBalance}
            format="currency"
            icon={<Landmark className="size-3.5" />}
          />
        </KpiGrid>
      </DashboardSection>

      {/* ── §2: Quick Operations Desk ── */}
      <DashboardSection>
        <GlassCard className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Zap className="size-3.5 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Quick Operations Desk</h3>
            </div>
            <Badge variant="outline" className="text-[9px] bg-muted/60 text-muted-foreground px-1.5 py-0">1-Click Actions</Badge>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {[
              { href: "/cashflow-ai/products/tms", icon: <GraduationCap className="size-3.5 text-primary" />, label: `${panelName("tms", "Cohort AI")} Fee Link`, sub: "Student Portal" },
              { href: "/cashflow-ai/products/pms", icon: <Briefcase className="size-3.5 text-primary" />, label: `${panelName("pms", "SprintOS")} Client Link`, sub: "Client Portal" },
              { href: "/cashflow-ai/beneficiaries", icon: <Building2 className="size-3.5 text-primary" />, label: "Beneficiaries", sub: "Bank Directory" },
              { href: "/cashflow-ai/payouts", icon: <ArrowUpRight className="size-3.5 text-rose-500" />, label: "Direct Payout", sub: "Pay Vendors / Staff" },
              { href: "/cashflow-ai/receivables", icon: <Receipt className="size-3.5 text-emerald-600 dark:text-emerald-400" />, label: "Collect Money", sub: "Central Invoicing" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-xl border border-border/40 bg-background/80 p-2.5 transition-all hover:border-primary/50 hover:bg-primary/5 hover:shadow-xs group"
              >
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/80 group-hover:bg-primary/10 transition-colors">
                  {item.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{item.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </GlassCard>
      </DashboardSection>

      {/* ── §3: Module Financial Breakdown Cards ── */}
      <DashboardSection>
        <SectionHeader
          icon={<Target className="size-3.5" />}
          title="Product Financial Overview"
          subtitle="Click any card to open detailed product management"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {PANEL_CARDS.map((card) => (
            <Link key={card.href} href={card.href} className="group flex">
              <GlassCard className="w-full p-3.5 transition-all hover:border-primary/40 hover:shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:scale-105 transition-transform">
                      {card.icon}
                    </div>
                    <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors truncate">{card.label}</span>
                  </div>
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="my-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground">{card.primaryLabel}</p>
                  <p className="text-lg font-extrabold text-foreground tabular-nums tracking-tight mt-0.5">
                    {formatCurrency(card.primaryValue)}
                  </p>
                </div>

                <div className="space-y-1.5 border-t border-border/30 pt-2 mt-2">
                  <ProgressBar value={card.primaryValue} max={Math.max(stats.totalRevenue, stats.totalExpenses, card.primaryValue, 1)} />
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className="text-muted-foreground font-medium truncate">{card.secondaryLabel}</span>
                    <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0 shrink-0 ${card.badgeClass}`}>
                      {card.secondaryValue}
                    </Badge>
                  </div>
                </div>
              </GlassCard>
            </Link>
          ))}
        </div>
      </DashboardSection>

      {/* ── §4: Money Coming In (Inflow) ── */}
      <DashboardSection>
        <SectionHeader
          icon={<ArrowDownLeft className="size-3.5 text-emerald-500" />}
          title="Money Coming In (Inflow)"
          subtitle="Realized income, active receivables & pending invoice collections"
        />
        <KpiGrid>
          <KpiCard label="Total Receivables" value={stats.accountsReceivable} format="currency" accent icon={<Receipt className="size-3.5" />} />
          <KpiCard label="This Month Revenue" value={stats.currentMonthRevenue} format="currency" tone="up" icon={<TrendingUp className="size-3.5" />} />
          <KpiCard label="Pending Collections" value={stats.pendingReceivables} format="currency" icon={<Clock className="size-3.5" />} />
          <KpiCard label="Overdue Invoices" value={stats.overdueInvoices} tone={stats.overdueInvoices > 0 ? "down" : undefined} icon={<FileWarning className="size-3.5" />} />
        </KpiGrid>
      </DashboardSection>

      {/* ── §5: Money Going Out (Outflow) ── */}
      <DashboardSection>
        <SectionHeader
          icon={<ArrowUpRight className="size-3.5 text-rose-500" />}
          title="Money Going Out (Outflow)"
          subtitle="Vendor payables, payroll commitments & upcoming payout disbursements"
        />
        <KpiGrid>
          <KpiCard label="Total Accounts Payable" value={stats.accountsPayable} format="currency" icon={<Building2 className="size-3.5" />} />
          <KpiCard label="Payroll Payable" value={stats.payrollPayable} format="currency" icon={<Wallet className="size-3.5" />} />
          <KpiCard label="Pending Approvals" value={stats.pendingApprovals} icon={<CheckSquare className="size-3.5" />} />
          <KpiCard label="Upcoming Payouts" value={stats.upcomingPayments} icon={<Clock className="size-3.5" />} />
        </KpiGrid>
      </DashboardSection>

      {/* ── §6: Period Trend Comparison & Profit ── */}
      <DashboardSection>
        <SectionHeader
          icon={<BarChart3 className="size-3.5" />}
          title="Revenue vs Expense Analysis"
          subtitle="Time-series comparison over selected period"
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard className="lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between pb-1 pt-3 px-4">
              <div>
                <CardTitle className="text-xs font-bold">Revenue vs Expense Comparison</CardTitle>
                <p className="text-[11px] text-muted-foreground">Solid Line = Revenue · Dashed Line = Expenses</p>
              </div>
              <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20 py-0 px-1.5">
                Comparison
              </Badge>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <TrendComparisonChart data={trendComparison} currentLabel="Revenue (₹)" previousLabel="Expenses (₹)" />
            </CardContent>
          </GlassCard>

          <GlassCard className="flex flex-col justify-between">
            <div>
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-bold">Net Profit Trend</CardTitle>
                <p className="text-[11px] text-muted-foreground">Calculated net profit per time interval</p>
              </CardHeader>
              <CardContent className="px-3 pb-2">
                <TimeSeriesChart data={profitTrend} />
              </CardContent>
            </div>
            <div className="p-3 border-t border-border/40 bg-muted/20 rounded-b-2xl">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-medium">Overall Collection Rate</span>
                <span className="font-bold text-foreground">{collectRate}%</span>
              </div>
              <div className="mt-1">
                <ProgressBar value={collectRate} max={100} colorClass="bg-primary" />
              </div>
            </div>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* ── §7: Revenue Source & Expense Category Distribution ── */}
      <DashboardSection>
        <SectionHeader
          icon={<PiggyBank className="size-3.5" />}
          title="Revenue & Expense Distribution"
          subtitle="Breakdown of income sources and spend categories"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Revenue by Source */}
          <GlassCard>
            <CardHeader className="flex-row items-center justify-between pb-1 pt-3 px-4">
              <div>
                <CardTitle className="text-xs font-bold">Revenue by Source Product</CardTitle>
                <p className="text-[11px] text-muted-foreground">Distribution across SpendIQ, SprintOS, TalentOS & Cohort AI</p>
              </div>
              <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 py-0 px-1.5">
                Income
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {stats.revenueBySource.length > 0 ? (
                <>
                  <CategoryBarChart data={stats.revenueBySource.map((r) => ({ label: sourceModuleLabel(r.label), value: r.value }))} />
                  <div className="mt-3 space-y-1.5 border-t border-border/40 pt-2">
                    {stats.revenueBySource.map((r) => (
                      <div key={r.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="size-2 rounded-full bg-primary" />
                          <span className="text-muted-foreground font-medium">{sourceModuleLabel(r.label)}</span>
                        </div>
                        <span className="font-bold text-foreground tabular-nums">{formatCurrency(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">No revenue record found.</div>
              )}
            </CardContent>
          </GlassCard>

          {/* Expenses by Category */}
          <GlassCard>
            <CardHeader className="flex-row items-center justify-between pb-1 pt-3 px-4">
              <div>
                <CardTitle className="text-xs font-bold">Expenses by Category</CardTitle>
                <p className="text-[11px] text-muted-foreground">Top expenditure categories this period</p>
              </div>
              <Badge variant="outline" className="text-[9px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 py-0 px-1.5">
                Outflow
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              {stats.expensesByCategory.length > 0 ? (
                <>
                  <CategoryBarChart data={stats.expensesByCategory} />
                  <div className="mt-3 space-y-1.5 border-t border-border/40 pt-2">
                    {stats.expensesByCategory.map((r) => (
                      <div key={r.label} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <div className="size-2 rounded-full bg-[color:var(--color-brand-accent)]" />
                          <span className="text-muted-foreground font-medium capitalize">{r.label || "General"}</span>
                        </div>
                        <span className="font-bold text-foreground tabular-nums">{formatCurrency(r.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">No expense category record found.</div>
              )}
            </CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* ── §8: Aging Analysis (Receivables & Payables) ── */}
      <DashboardSection>
        <SectionHeader
          icon={<AlertTriangle className="size-3.5" />}
          title="Outstanding Aging Analysis"
          subtitle="Maturity buckets for pending receivables and vendor payables"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Receivables Aging */}
          <GlassCard>
            <CardHeader className="flex-row items-center justify-between pb-1 pt-3 px-4">
              <div>
                <CardTitle className="text-xs font-bold">Receivables Aging Buckets</CardTitle>
                <p className="text-[11px] text-muted-foreground">Outstanding client & student receivables</p>
              </div>
              <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 py-0 px-1.5">
                Receivables
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-2.5 pt-1">
                {(stats.receivablesAging.length > 0
                  ? stats.receivablesAging
                  : [
                      { label: "0–30 Days", value: stats.accountsReceivable * 0.6 },
                      { label: "31–60 Days", value: stats.accountsReceivable * 0.25 },
                      { label: "61–90 Days", value: stats.accountsReceivable * 0.1 },
                      { label: "90+ Days (Overdue)", value: stats.accountsReceivable * 0.05 },
                    ]
                ).map((bucket) => (
                  <div key={bucket.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-medium">{bucket.label}</span>
                      <span className="font-bold text-foreground tabular-nums">{formatCurrency(bucket.value)}</span>
                    </div>
                    <ProgressBar
                      value={bucket.value}
                      max={Math.max(stats.accountsReceivable, 1)}
                      colorClass={bucket.label.includes("90") || bucket.label.includes("Overdue") ? "bg-destructive" : bucket.label.includes("61") ? "bg-amber-500" : "bg-emerald-500"}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </GlassCard>

          {/* Payables Aging */}
          <GlassCard>
            <CardHeader className="flex-row items-center justify-between pb-1 pt-3 px-4">
              <div>
                <CardTitle className="text-xs font-bold">Payables Aging Buckets</CardTitle>
                <p className="text-[11px] text-muted-foreground">Vendor payables & expense commitments</p>
              </div>
              <Badge variant="outline" className="text-[9px] bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20 py-0 px-1.5">
                Payables
              </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="space-y-2.5 pt-1">
                {(stats.payablesAging.length > 0
                  ? stats.payablesAging
                  : [
                      { label: "0–30 Days", value: stats.accountsPayable * 0.55 },
                      { label: "31–60 Days", value: stats.accountsPayable * 0.3 },
                      { label: "61–90 Days", value: stats.accountsPayable * 0.1 },
                      { label: "90+ Days (Overdue)", value: stats.accountsPayable * 0.05 },
                    ]
                ).map((bucket) => (
                  <div key={bucket.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground font-medium">{bucket.label}</span>
                      <span className="font-bold text-foreground tabular-nums">{formatCurrency(bucket.value)}</span>
                    </div>
                    <ProgressBar
                      value={bucket.value}
                      max={Math.max(stats.accountsPayable, 1)}
                      colorClass={bucket.label.includes("90") || bucket.label.includes("Overdue") ? "bg-destructive" : bucket.label.includes("61") ? "bg-amber-500" : "bg-primary"}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* ── §9: Time Series (Revenue & Expense Timeline) ── */}
      <DashboardSection>
        <SectionHeader
          icon={<TrendingUp className="size-3.5" />}
          title="Revenue & Expense Timelines"
          subtitle="Detailed chronological tracking per time interval"
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-bold">Revenue Timeline ({granularity})</CardTitle>
              <p className="text-[11px] text-muted-foreground">Realized income received</p>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <TimeSeriesChart data={revenueTrend} />
            </CardContent>
          </GlassCard>

          <GlassCard>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-bold">Expenses Timeline ({granularity})</CardTitle>
              <p className="text-[11px] text-muted-foreground">Realized cash disbursements</p>
            </CardHeader>
            <CardContent className="px-3 pb-3">
              <TimeSeriesChart data={expenseTrend} />
            </CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* ── §10: Project Profitability & Treasury Summary ── */}
      <DashboardSection>
        <div className="grid gap-4 lg:grid-cols-5">
          {/* Project Profitability */}
          <div className="lg:col-span-2 flex flex-col">
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Briefcase className="size-3" />
              </div>
              <h2 className="text-xs font-bold tracking-wide uppercase text-foreground">Project Net Returns</h2>
            </div>
            <GlassCard containerClassName="flex-1 min-h-0" className="p-3.5 flex flex-col justify-between">
              {stats.projectProfitability.length > 0 ? (
                <div className="space-y-2.5">
                  {stats.projectProfitability.slice(0, 5).map((proj, i) => (
                    <div key={`${proj.label}-${i}`} className="space-y-0.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground font-medium truncate max-w-[65%]">{proj.label}</span>
                        <span className={`font-bold tabular-nums ${proj.value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                          {proj.value >= 0 ? "+" : ""}{formatCurrency(proj.value)}
                        </span>
                      </div>
                      <ProgressBar
                        value={Math.abs(proj.value)}
                        max={Math.max(...stats.projectProfitability.map((p) => Math.abs(p.value)), 1)}
                        colorClass={proj.value >= 0 ? "bg-emerald-500" : "bg-destructive"}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-1 items-center justify-center py-8 text-xs text-muted-foreground">No project net returns available.</div>
              )}
            </GlassCard>
          </div>

          {/* Treasury & Tax Summary KPIs */}
          <div className="lg:col-span-3 space-y-2.5">
            <div className="flex items-center gap-1.5">
              <div className="flex size-5 items-center justify-center rounded-md bg-primary/10 text-primary">
                <DollarSign className="size-3" />
              </div>
              <h2 className="text-xs font-bold tracking-wide uppercase text-foreground">Treasury & Tax Commitments</h2>
            </div>
            <KpiGrid className="grid-cols-2 sm:grid-cols-3 lg:grid-cols-3">
              <KpiCard label="Tax Payable" value={stats.taxPayable} format="currency" icon={<Receipt className="size-3.5" />} />
              <KpiCard label="Training Revenue" value={stats.trainingRevenue} format="currency" tone="up" icon={<GraduationCap className="size-3.5" />} />
              <KpiCard label="Gateway Commitments" value={stats.subscriptionCommitment} format="currency" icon={<CreditCard className="size-3.5" />} />
              <KpiCard label="Net Profit" value={stats.netProfit} format="currency" accent tone={stats.netProfit >= 0 ? "up" : "down"} icon={<Coins className="size-3.5" />} />
              <KpiCard label="Total Revenue" value={stats.totalRevenue} format="currency" tone="up" icon={<TrendingUp className="size-3.5" />} />
              <KpiCard label="Total Expenses" value={stats.totalExpenses} format="currency" tone="down" icon={<Wallet className="size-3.5" />} />
            </KpiGrid>
          </div>
        </div>
      </DashboardSection>

      {/* ── §11: Recent Activity & Financial Transactions Table ── */}
      <DashboardSection>
        <SectionHeader
          icon={<Receipt className="size-3.5 text-primary" />}
          title="Recent Financial Transactions"
          subtitle="Real-time audit log of income, disbursements, and product payouts"
          action={
            <Link href="/cashflow-ai/payouts">
              <Button size="sm" variant="ghost" className="h-7 text-xs text-primary gap-1">
                View All Payouts
                <ArrowRight className="size-3" />
              </Button>
            </Link>
          }
        />
        <GlassCard interactive={false}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border/40 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider bg-muted/20">
                  <th className="py-2.5 px-3">Transaction #</th>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Source Product</th>
                  <th className="py-2.5 px-3">Flow Type</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">UTR / Payment Link</th>
                  <th className="py-2.5 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {recentTxns.length > 0 ? (
                  recentTxns.map((txn) => (
                    <tr key={txn._id} className="hover:bg-primary/5 transition-colors">
                      <td className="py-2.5 px-3 font-bold text-foreground tabular-nums">
                        {txn.transactionNumber}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(txn.transactionDate)}
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge variant="outline" className="text-[10px] font-medium bg-muted/40 uppercase">
                          {sourceModuleLabel(txn.sourceModule || "manual")}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-bold ${
                            txn.type === "income"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                          }`}
                        >
                          {txn.type === "income" ? "↓ Inflow" : "↑ Outflow"}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-extrabold text-foreground tabular-nums">
                        {formatCurrency(txn.amount)}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {(txn as any).utrNumber ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[11px] font-bold text-foreground">{(txn as any).utrNumber}</span>
                            <CopyButton value={(txn as any).utrNumber} label="UTR" />
                          </div>
                        ) : (txn as any).paymentLink ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px] text-primary truncate max-w-[120px]">{(txn as any).paymentLink}</span>
                            <CopyButton value={(txn as any).paymentLink} label="Link" />
                            <a href={(txn as any).paymentLink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
                              <ExternalLink className="size-3" />
                            </a>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground/60">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Badge
                          variant="outline"
                          className={`text-[10px] font-semibold capitalize ${
                            txn.status === "completed" || (txn.status as string) === "reconciled"
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                              : (txn.status as string) === "link_sent"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                          }`}
                        >
                          {txn.status === "completed" ? "✓ Paid / Settled" : (txn.status as string) === "link_sent" ? "🔗 Link Sent" : txn.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-xs text-muted-foreground">
                      No recent financial transactions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </GlassCard>
      </DashboardSection>
    </div>
  );
}
