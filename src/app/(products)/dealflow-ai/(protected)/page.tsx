import { requireLmsPage } from "@/lib/lms-auth";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import { Inbox, Megaphone, TrendingUp, BarChart3, ArrowRight } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import StatusBadge from "@/components/products/dealflow-ai/StatusBadge";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import DashboardFilters from "@/components/products/dealflow-ai/DashboardFilters";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import ConversionFunnel from "@/components/products/dealflow-ai/ConversionFunnel";
import TopCategories from "@/components/products/dealflow-ai/TopCategories";
import MonthlyInsights from "@/components/products/dealflow-ai/MonthlyInsights";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import ExportButton from "@/components/products/dealflow-ai/ExportButton";
import SavedFiltersMenu from "@/components/products/dealflow-ai/SavedFiltersMenu";
import DashboardAutoRefresh from "@/components/products/dealflow-ai/DashboardAutoRefresh";
import CategoryTabs, { type CategoryPanelData } from "@/components/products/dealflow-ai/CategoryTabs";
import StackedCategoryStatusChart, { type StackedRow } from "@/components/products/dealflow-ai/StackedCategoryStatusChart";
import PendingTasksWidget from "@/components/products/dealflow-ai/PendingTasksWidget";
import QuickActions from "@/components/products/dealflow-ai/QuickActions";

import CampaignKpiRow from "@/components/products/dealflow-ai/campaigns/CampaignKpiRow";
import CampaignSpendLeadsChart from "@/components/products/dealflow-ai/campaigns/CampaignSpendLeadsChart";
import SpendByPlatformChart from "@/components/products/dealflow-ai/campaigns/SpendByPlatformChart";
import RoiByCampaignChart from "@/components/products/dealflow-ai/campaigns/RoiByCampaignChart";
import CampaignPerformanceTable from "@/components/products/dealflow-ai/campaigns/CampaignPerformanceTable";

import { isValidPlatform } from "@/lib/campaign-platforms";
import { getDashboardStats, CATEGORIES, isValidCategory, getCategoryLabel, type DashboardGranularity } from "@/lib/leads";
import { LEAD_STATUSES, isValidLeadStatus, getStatusMeta } from "@/lib/lead-status";
import { LEAD_STATUS_ICONS } from "@/lib/lead-status-icons";
import { getCurrentLmsUser } from "@/lib/lms-auth";
import { listSavedFilters } from "@/lib/saved-filters";
import { formatDateTime } from "@/lib/utils";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import { iconForCategory } from "@/lib/category-icons";
import { getCampaignAnalytics } from "@/lib/campaigns";
import type { SerializedLead } from "@/components/products/dealflow-ai/types";
import OmnichannelCommandCenter from "@/components/products/dealflow-ai/OmnichannelCommandCenter";
import { getLeadStats } from "@/lib/lead-management/records";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

export default async function LmsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    status?: string;
    source?: string;
    search?: string;
    range?: string;
    dateFrom?: string;
    dateTo?: string;
    granularity?: string;
    platform?: string;
  }>;
}) {
  await requireLmsPage("VIEW_LEADS");
  const sp = await searchParams;
  const lmsUser = await getCurrentLmsUser();

  const category = sp.category && isValidCategory(sp.category) ? sp.category : undefined;
  const status = sp.status && isValidLeadStatus(sp.status) ? sp.status : undefined;
  const source = sp.source || undefined;
  const search = sp.search || undefined;
  const granularity: DashboardGranularity = VALID_GRANULARITIES.includes(sp.granularity as DashboardGranularity)
    ? (sp.granularity as DashboardGranularity)
    : "day";

  const rangeParam: DateRangePreset =
    sp.range && isValidDateRangePreset(sp.range)
      ? sp.range
      : sp.dateFrom || sp.dateTo
        ? "custom"
        : "last30";

  let dateFrom: Date;
  let dateTo: Date;
  if (rangeParam === "custom") {
    const defaultTo = new Date();
    const defaultFrom = new Date();
    defaultFrom.setDate(defaultFrom.getDate() - 29);
    dateFrom = parseDateParam(sp.dateFrom) ?? defaultFrom;
    dateTo = parseDateParam(sp.dateTo, true) ?? defaultTo;
  } else {
    const resolved = resolveDateRangePreset(rangeParam)!;
    dateFrom = resolved.from;
    dateTo = resolved.to;
  }

  const platform = sp.platform && isValidPlatform(sp.platform) ? sp.platform : undefined;

  const [stats, savedFilters, campaignAnalytics, leadStats] = await Promise.all([
    getDashboardStats({ category, status, source, search, dateFrom, dateTo, granularity }),
    lmsUser ? listSavedFilters(lmsUser.id) : Promise.resolve([]),
    getCampaignAnalytics({
      platform,
      source: sp.source,
      dateFrom,
      dateTo,
      granularity,
    }),
    getLeadStats(),
  ]);

  const categoryChartData = CATEGORIES.map((c) => ({ label: c.label, value: stats.byCategory[c.slug] ?? 0 }));
  const statusPieData = LEAD_STATUSES.map((s) => ({ status: s.value, label: s.label, count: stats.byStatus[s.value] ?? 0 }));
  const hasActiveFilters = Boolean(sp.category || sp.status || sp.source || sp.search || sp.dateFrom || sp.dateTo || sp.range || sp.platform);

  const currentParams: Record<string, string> = {};
  if (sp.category) currentParams.category = sp.category;
  if (sp.status) currentParams.status = sp.status;
  if (sp.source) currentParams.source = sp.source;
  if (sp.search) currentParams.search = sp.search;
  if (sp.range) currentParams.range = sp.range;
  if (sp.dateFrom) currentParams.dateFrom = sp.dateFrom;
  if (sp.dateTo) currentParams.dateTo = sp.dateTo;
  if (sp.granularity) currentParams.granularity = sp.granularity;

  const exportParams = {
    category: category ?? "all",
    status,
    source,
    search,
    dateFrom: dateFrom.toISOString().slice(0, 10),
    dateTo: dateTo.toISOString().slice(0, 10),
  };

  const perCategoryStats = Object.values(stats.perCategory);
  const categoryPanelData: CategoryPanelData[] = perCategoryStats.map((cat) => ({
    slug: cat.slug,
    label: cat.label,
    total: cat.total,
    growthPercent: cat.growthPercent,
    byStatus: cat.byStatus,
    bySubService: cat.bySubService,
    timeSeries: cat.timeSeries,
    previousTimeSeries: cat.previousTimeSeries,
    funnel: cat.funnel,
  }));
  const stackedCategoryData: StackedRow[] = perCategoryStats.map((cat) => ({
    category: cat.slug,
    label: cat.label,
    new: cat.byStatus.new ?? 0,
    in_progress: cat.byStatus.in_progress ?? 0,
    completed: cat.byStatus.completed ?? 0,
    rejected: cat.byStatus.rejected ?? 0,
  }));
  const serializedStaleLeads: SerializedLead[] = stats.staleLeads.map((lead) => ({
    ...lead,
    _id: String(lead._id),
    createdAt: new Date(lead.createdAt).toISOString(),
    updatedAt: new Date(lead.updatedAt).toISOString(),
  }));

  return (
    <div className="relative space-y-6">
      <DashboardAutoRefresh />
      <PanelDashboardHeader
        breadcrumbs={[{ label: "DealFlow", href: "/dealflow-ai" }, { label: "Dashboard & Analytics" }]}
        title="Lead & Campaign Analytics"
        description="Measure lead pipeline health, campaign spend, ROI and conversion performance from one unified view."
        actions={
          <>
            {lmsUser && <SavedFiltersMenu initialFilters={savedFilters.map((f) => ({ id: String(f._id), name: f.name, params: f.params }))} currentParams={currentParams} />}
            <ExportButton params={exportParams} />
          </>
        }
        filters={<DashboardFilters
              category={category ?? ""}
              status={status ?? ""}
              source={source ?? ""}
              search={search ?? ""}
              range={rangeParam}
              dateFrom={dateFrom.toISOString().slice(0, 10)}
              dateTo={dateTo.toISOString().slice(0, 10)}
              hasActiveFilters={hasActiveFilters}
            />}
      />

      {/* Omnichannel AI Command Center & Multi-Platform Acquisition Engine */}
      <OmnichannelCommandCenter
        jobsCount={leadStats.byType.job_applicant ?? 0}
        internsCount={leadStats.byType.intern ?? 0}
        traineesCount={leadStats.byType.trainee ?? 0}
        clientsCount={leadStats.byType.client ?? 0}
      />

      {/* Overview KPIs */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
          <Inbox className="size-4 text-primary" />
          Lead Pipeline Overview
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <KpiCard label="Total" value={stats.totalOverall} accent trend={stats.growthPercent} icon={<Inbox className="size-4" />} />
          {LEAD_STATUSES.map((s) => {
            const Icon = LEAD_STATUS_ICONS[s.value];
            return <KpiCard key={s.value} label={s.label} value={stats.byStatus[s.value] ?? 0} icon={<Icon className="size-4" />} />;
          })}
        </div>
      </DashboardSection>

      {/* ── Integrated Marketing Campaign Analytics ── */}
      {campaignAnalytics.hasData && (
        <DashboardSection className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Megaphone className="size-4 text-primary" />
            Marketing Campaign Performance &amp; ROI
          </h2>
          <CampaignKpiRow totals={campaignAnalytics.totals} currency={campaignAnalytics.currency} />

          <GlassCard>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Campaign Spend vs. Attributed Leads</CardTitle>
              <GranularityToggle value={granularity} />
            </CardHeader>
            <CardContent>
              <CampaignSpendLeadsChart data={campaignAnalytics.timeSeries} currency={campaignAnalytics.currency} />
            </CardContent>
          </GlassCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardHeader><CardTitle>Spend by Platform</CardTitle></CardHeader>
              <CardContent>
                <SpendByPlatformChart data={campaignAnalytics.byPlatform} currency={campaignAnalytics.currency} />
              </CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>ROI by Campaign</CardTitle></CardHeader>
              <CardContent>
                <RoiByCampaignChart data={campaignAnalytics.campaigns.map((c) => ({ name: c.name, roiPercent: c.roiPercent }))} />
              </CardContent>
            </GlassCard>
          </div>

          {campaignAnalytics.campaigns.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">Campaign Attribution Breakdown</h3>
                <Link href="/dealflow-ai/campaigns" className="flex items-center gap-1 text-sm text-primary hover:underline">
                  Full Report <ArrowRight className="size-3.5" />
                </Link>
              </div>
              <CampaignPerformanceTable rows={campaignAnalytics.campaigns} currency={campaignAnalytics.currency} />
            </div>
          )}
        </DashboardSection>
      )}

      {/* Attention Needed */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Attention Needed</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Pending Tasks</CardTitle></CardHeader>
            <CardContent><PendingTasksWidget count={stats.staleCount} leads={serializedStaleLeads} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
            <CardContent>
              <QuickActions exportParams={exportParams} hasActiveFilters={hasActiveFilters} resetHref="/dealflow-ai" />
            </CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* Trends */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" />
          Submission & Volume Trends
        </h2>
        <GlassCard>
          <CardHeader><CardTitle>Performance Insights</CardTitle></CardHeader>
          <CardContent>
            <MonthlyInsights
              growthPercent={stats.growthPercent}
              previousPeriodTotal={stats.previousPeriodTotal}
              totalOverall={stats.totalOverall}
              byWeekday={stats.byWeekday}
            />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Submissions Over Time</CardTitle>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent><TimeSeriesChart data={stats.timeSeries} /></CardContent>
        </GlassCard>
      </DashboardSection>

      {/* Category Performance */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Category Performance</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {perCategoryStats.map((cat) => {
            const Icon = iconForCategory(cat.slug);
            return (
              <KpiCard
                key={cat.slug}
                label={cat.label}
                value={cat.total}
                icon={<Icon className="size-4" />}
                trend={cat.growthPercent}
              />
            );
          })}
        </div>

        <GlassCard>
          <CardHeader><CardTitle>Submissions by Category</CardTitle></CardHeader>
          <CardContent><CategoryBarChart data={categoryChartData} /></CardContent>
        </GlassCard>

        <CategoryTabs categories={categoryPanelData} />

        {stackedCategoryData.length > 1 && (
          <GlassCard>
            <CardHeader><CardTitle>Category Comparison by Status</CardTitle></CardHeader>
            <CardContent><StackedCategoryStatusChart data={stackedCategoryData} /></CardContent>
          </GlassCard>
        )}
      </DashboardSection>

      {/* Status & Conversion */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Status &amp; Conversion</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Status Distribution</CardTitle></CardHeader>
            <CardContent><StatusPieChart data={statusPieData} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Conversion Funnel</CardTitle></CardHeader>
            <CardContent>
              <ConversionFunnel stages={stats.funnel} rejectedCount={stats.byStatus.rejected ?? 0} />
            </CardContent>
          </GlassCard>
        </div>
        <GlassCard>
          <CardHeader><CardTitle>Top Categories</CardTitle></CardHeader>
          <CardContent><TopCategories data={stats.topCategories} /></CardContent>
        </GlassCard>
      </DashboardSection>

      {/* Recent Submissions */}
      <GlassCard>
        <CardHeader><CardTitle>Recent Submissions</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {stats.recent.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          {stats.recent.map((lead) => {
            const meta = getStatusMeta(lead.status);
            return (
              <Link
                key={String(lead._id)}
                href={`/dealflow-ai/submissions/${lead.category}/${lead._id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`size-2 shrink-0 rounded-full ${meta.dotClass}`} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{lead.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {getCategoryLabel(lead.category)} · {formatDateTime(lead.createdAt)}
                    </p>
                  </div>
                </div>
                <StatusBadge status={lead.status} />
              </Link>
            );
          })}
        </CardContent>
      </GlassCard>
    </div>
  );
}
