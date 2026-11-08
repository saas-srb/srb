import DashboardSection from "@/components/platform/panel/DashboardSection";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import {
  Wallet,
  Coins,
  Building2,
  Cloud,
  FileText,
  Receipt,
  ArrowRight,
  ClipboardList,
  Boxes,
  PieChart as PieChartIcon,
  TrendingUp,
  BarChart3,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import PrmsDashboardFilters from "@/components/products/spendiq/PrmsDashboardFilters";
import ItemPdfDownloadButtons from "@/components/products/spendiq/ItemPdfDownloadButtons";
import PrmsDonutChart from "@/components/products/spendiq/PrmsDonutChart";
import PrmsSpendProgress from "@/components/products/spendiq/PrmsSpendProgress";

import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { getPrmsDashboardStats } from "@/lib/products/spendiq/dashboard";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { searchPurchaseOrders, serializePurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { searchExpenses, serializeExpense } from "@/lib/products/spendiq/expenses";

import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function PrmsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPrmsUser();

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

  const [stats, departments, projects, vendors, recentPos, recentExps] = await Promise.all([
    getPrmsDashboardStats({
      dateFrom,
      dateTo,
      granularity,
      departmentId: sp.departmentId || undefined,
      projectId: sp.projectId || undefined,
      vendorId: sp.vendorId || undefined,
      category: sp.category || undefined,
      expenseType: sp.expenseType || undefined,
    }),
    listDepartments(),
    listProjectOptions(),
    listVendorOptions({ activeOnly: true }),
    searchPurchaseOrders({ pageSize: 5 }),
    searchExpenses({ pageSize: 5 }),
  ]);

  const hasActiveFilters = Boolean(
    sp.range || sp.dateFrom || sp.dateTo || sp.departmentId || sp.projectId || sp.vendorId || sp.category || sp.expenseType
  );

  const displayName = user?.email ? user.email.split("@")[0].replace(/[._]/g, " ") : "";

  return (
    <div className="relative space-y-6">

      <PanelDashboardHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Dashboard" }]}
        title="Procurement Overview"
        description={<>{displayName ? `Welcome back, ${displayName}. ` : ""}Analyze spend, requisitions, vendor orders and company assets to keep purchasing on budget.</>}
        actions={
          <>
            <Link href="/spendiq/requisitions">
              <Button size="sm" className="gap-1.5 shadow-xs">
                <ClipboardList className="size-4" />
                <span>New Request</span>
              </Button>
            </Link>
            <Link href="/spendiq/expenses">
              <Button size="sm" variant="outline" className="gap-1.5 shadow-xs">
                <Receipt className="size-4" />
                <span>Log Expense</span>
              </Button>
            </Link>
          </>
        }
        filters={<PrmsDashboardFilters
              range={rangeParam}
              dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
              dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
              departmentId={sp.departmentId ?? ""}
              projectId={sp.projectId ?? ""}
              vendorId={sp.vendorId ?? ""}
              category={sp.category ?? ""}
              expenseType={sp.expenseType ?? ""}
              departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
              projects={projects.map((p) => ({ _id: p._id, name: p.name }))}
              vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
              hasActiveFilters={hasActiveFilters}
            />}
      />

      {/* ── Procurement Overview KPIs ── */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
          <Layers className="size-4 text-primary" />
          Procurement & Asset Summary
        </h2>
        <KpiGrid>
          <KpiCard label="Total Spend" value={stats.totalProcurementSpend} format="currency" accent icon={<Coins className="size-4" />} />
          <KpiCard label="This Month's Expenses" value={stats.monthlyExpenses} format="currency" icon={<Wallet className="size-4" />} />
          <KpiCard
            label="Pending Purchase Requests"
            value={stats.pendingPurchaseRequests}
            tone={stats.pendingPurchaseRequests > 0 ? "down" : undefined}
            icon={<ClipboardList className="size-4" />}
          />
          <KpiCard label="Active Vendors" value={stats.activeVendors} icon={<Building2 className="size-4" />} />
          <KpiCard label="Hardware & Devices" value={stats.totalOfficeAssets} icon={<Boxes className="size-4" />} />
          <KpiCard label="Software Subscriptions" value={stats.activeSubscriptions} icon={<Cloud className="size-4" />} />
        </KpiGrid>
      </DashboardSection>

      {/* ── Monthly Spend Trend Chart ── */}
      <DashboardSection className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            Spend & Expense Timeline
          </h2>
        </div>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-bold">Expense Spend Trend</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Track procurement costs over time across selected filters.</p>
            </div>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent><TimeSeriesChart data={stats.monthlyExpenseTrend} /></CardContent>
        </GlassCard>
      </DashboardSection>

      {/* ── Charts Grid ── */}
      <DashboardSection className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <PieChartIcon className="size-4 text-primary" />
          Spend Breakdown & Analytics
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">

          {/* 1. Category-wise Donut Chart */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Expense Categories</span>
                <span className="text-xs font-normal text-muted-foreground">Share of total spend</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PrmsDonutChart data={stats.categoryExpenses} height={260} />
            </CardContent>
          </GlassCard>

          {/* 2. SaaS Subscription Costs Donut */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Software & Cloud Subscriptions</span>
                <span className="text-xs font-normal text-muted-foreground">Monthly Recurring Cost</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PrmsDonutChart data={stats.saasSubscriptionCost} height={260} />
            </CardContent>
          </GlassCard>

          {/* 3. Department-wise Spend Bar Chart */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Department-wise Spend</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={stats.departmentExpenses} />
            </CardContent>
          </GlassCard>

          {/* 4. Top Vendors Progress Breakdown */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Top Vendors by Spend</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <PrmsSpendProgress data={stats.vendorSpend} maxItems={5} />
            </CardContent>
          </GlassCard>

        </div>
      </DashboardSection>

      {/* ── Asset Acquisition Growth Trend ── */}
      <DashboardSection className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="size-4 text-primary" />
          Asset & Device Growth Timeline
        </h2>
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Hardware & Office Asset Additions</CardTitle>
            <p className="text-xs text-muted-foreground">Timeline of company laptop, monitor and hardware onboarding.</p>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.assetAcquisitionTrend} />
          </CardContent>
        </GlassCard>
      </DashboardSection>

      {/* ── Recent Activity Table Card ── */}
      <GlassCard className="p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
          <div>
            <h3 className="text-base font-bold text-foreground">Recent Activity &amp; Quick PDF Downloads</h3>
            <p className="text-xs text-muted-foreground">Recent purchase orders and expense vouchers with 1-click PDF download.</p>
          </div>
          <Link href="/spendiq/purchase-orders">
            <Button size="xs" variant="ghost" className="gap-1 text-xs text-primary">
              <span>View All POs</span>
              <ArrowRight className="size-3" />
            </Button>
          </Link>
        </div>

        <div className="space-y-3">
          {recentPos.items.length > 0 ? (
            <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-background/50">
              {recentPos.items.map(serializePurchaseOrder).slice(0, 4).map((po) => (
                <div key={po._id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-[10px] font-bold">
                      PO
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{po.poNumber} · {po.vendorName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDate(po.createdAt)} ·{" "}
                        <span className="uppercase font-semibold text-primary">{po.status}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-foreground">{formatMoney(po.totalAmount, po.currency)}</span>
                    <ItemPdfDownloadButtons itemId={po._id} code={po.poNumber} variant="compact" />
                  </div>
                </div>
              ))}
            </div>
          ) : recentExps.items.length > 0 ? (
            <div className="divide-y divide-border/40 rounded-lg border border-border/50 bg-background/50">
              {recentExps.items.map(serializeExpense).slice(0, 4).map((exp) => (
                <div key={exp._id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs sm:text-sm">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-bold">
                      EXP
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{exp.expenseCode} · {exp.vendorName || exp.description || "Expense"}</p>
                      <p className="text-[11px] text-muted-foreground">{formatDate(exp.expenseDate)} · {exp.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-foreground">{formatMoney(exp.totalAmount, exp.currency)}</span>
                    <ItemPdfDownloadButtons itemId={exp._id} code={exp.expenseCode} variant="compact" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-4 text-center text-xs text-muted-foreground">No recent activity recorded.</p>
          )}
        </div>
      </GlassCard>

    </div>
  );
}
