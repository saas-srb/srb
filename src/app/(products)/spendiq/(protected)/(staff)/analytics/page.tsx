import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Coins,
  Wallet,
  Building2,
  Boxes,
  Cloud,
  ClipboardList,
  TrendingUp,
  PieChart as PieChartIcon,
  FileText,
  FileSpreadsheet,
  FileDown,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import PrmsDashboardFilters from "@/components/products/spendiq/PrmsDashboardFilters";
import PrmsDonutChart from "@/components/products/spendiq/PrmsDonutChart";
import PrmsSpendProgress from "@/components/products/spendiq/PrmsSpendProgress";

import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canViewReports } from "@/lib/prms-roles";
import { getPrmsDashboardStats } from "@/lib/products/spendiq/dashboard";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";

import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function PrmsAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentPrmsUser();
  if (!user || !canViewReports(user)) redirect("/spendiq");

  const sp = await searchParams;

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

  const [stats, departments, projects, vendors] = await Promise.all([
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
  ]);

  const hasActiveFilters = Boolean(
    sp.range || sp.dateFrom || sp.dateTo || sp.departmentId || sp.projectId || sp.vendorId || sp.category || sp.expenseType
  );

  return (
    <div className="relative space-y-6">

      {/* Breadcrumbs */}
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Analytics" }]}
        title={<>
            Procurement Analytics</>}
        description={<>In-depth analytical breakdown of organizational spend, vendor concentration, software costs, and growth trends.</>}
        actions={<><div className="flex flex-wrap items-center gap-2">
          <Link href="/spendiq/reports" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <FileText className="size-4" />
            <span>Export Reports</span>
          </Link>
        </div></>}
      />

      {/* ── Filter Controls ── */}
      <PrmsDashboardFilters
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
      />

      {/* ── Analytics KPI Grid ── */}
      <KpiGrid>
        <KpiCard label="Total Procurement Spend" value={stats.totalProcurementSpend} format="currency" accent icon={<Coins className="size-4" />} />
        <KpiCard label="Period Spend" value={stats.periodSpend} format="currency" icon={<Wallet className="size-4" />} />
        <KpiCard label="Active Vendors" value={stats.activeVendors} icon={<Building2 className="size-4" />} />
        <KpiCard label="Pending Requisitions" value={stats.pendingPurchaseRequests} icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Hardware & Devices" value={stats.totalOfficeAssets} icon={<Boxes className="size-4" />} />
        <KpiCard label="SaaS Subscriptions" value={stats.activeSubscriptions} icon={<Cloud className="size-4" />} />
      </KpiGrid>

      {/* ── Expense Trend Chart ── */}
      <GlassCard>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" />
              Expenditure Over Time
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Historical trend of procurement expenses for the selected range.</p>
          </div>
          <GranularityToggle value={granularity} />
        </CardHeader>
        <CardContent>
          <TimeSeriesChart data={stats.monthlyExpenseTrend} />
        </CardContent>
      </GlassCard>

      {/* ── Visual Analytics Breakdown Grid ── */}
      <div className="grid gap-5 lg:grid-cols-2">

        {/* Donut 1: Expense Categories */}
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PieChartIcon className="size-4 text-primary" />
                Category Distribution
              </span>
              <span className="text-xs font-normal text-muted-foreground">Expense Types</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PrmsDonutChart data={stats.categoryExpenses} height={270} />
          </CardContent>
        </GlassCard>

        {/* Donut 2: Software Subscriptions */}
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Cloud className="size-4 text-primary" />
                Software & Cloud Cost
              </span>
              <span className="text-xs font-normal text-muted-foreground">Monthly Subscriptions</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PrmsDonutChart data={stats.saasSubscriptionCost} height={270} />
          </CardContent>
        </GlassCard>

        {/* Bar 1: Department Spend */}
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Building2 className="size-4 text-primary" />
              Department Allocation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryBarChart data={stats.departmentExpenses} />
          </CardContent>
        </GlassCard>

        {/* Progress: Vendor Concentration */}
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Coins className="size-4 text-primary" />
              Top Vendors Share
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <PrmsSpendProgress data={stats.vendorSpend} maxItems={6} />
          </CardContent>
        </GlassCard>

      </div>

      {/* ── Asset Acquisition Trend ── */}
      <GlassCard>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Boxes className="size-4 text-primary" />
            Asset Acquisition Timeline
          </CardTitle>
          <p className="text-xs text-muted-foreground">Growth of hardware & equipment assets across company departments.</p>
        </CardHeader>
        <CardContent>
          <TimeSeriesChart data={stats.assetAcquisitionTrend} />
        </CardContent>
      </GlassCard>

      {/* ── Download Reports Banner ── */}
      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-foreground">Need raw data export?</h3>
            <p className="text-xs text-muted-foreground">Export complete procurement, expense, asset and vendor ledgers in Excel or PDF format.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a href="/api/spendiq/reports/expense?format=xlsx" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileSpreadsheet className="size-3.5" />
              Expense Ledger (Excel)
            </a>
            <a href="/api/spendiq/reports/procurement?format=pdf" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <FileDown className="size-3.5" />
              Procurement Summary (PDF)
            </a>
          </div>
        </div>
      </GlassCard>

    </div>
  );
}
