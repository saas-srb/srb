import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import Link from "next/link";
import { Inbox, Percent } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import CareerStatusBadge from "@/components/products/dealflow-ai/CareerStatusBadge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CareerDashboardFilters from "@/components/products/dealflow-ai/CareerDashboardFilters";
import TopPositions from "@/components/products/dealflow-ai/TopPositions";
import CareersExportButton from "@/components/products/dealflow-ai/CareersExportButton";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import ConversionFunnel from "@/components/products/dealflow-ai/ConversionFunnel";
import { buttonVariants } from "@/components/ui/button";
import { getCareerDashboardStats, getAllJobPositions, getExperienceOptions, getLocationOptions } from "@/lib/career-applications";
import { CAREER_APPLICATION_STATUSES, isValidCareerApplicationStatus, getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { CAREER_STATUS_ICONS, CAREER_STATUS_COLORS } from "@/lib/career-status-icons";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";
import { formatDateTime } from "@/lib/utils";

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

export default async function CareersDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    position?: string;
    experience?: string;
    location?: string;
    search?: string;
    range?: string;
    dateFrom?: string;
    dateTo?: string;
    granularity?: string;
  }>;
}) {
  await requireLmsPage("VIEW_CAREERS");
  const sp = await searchParams;

  const status = sp.status && isValidCareerApplicationStatus(sp.status) ? sp.status : undefined;
  const positionSlug = sp.position || undefined;
  const experience = sp.experience || undefined;
  const location = sp.location || undefined;
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

  const [stats, positions, experienceOptions, locationOptions] = await Promise.all([
    getCareerDashboardStats({ status, positionSlug, experience, location, search, dateFrom, dateTo, granularity }),
    getAllJobPositions(),
    getExperienceOptions(),
    getLocationOptions(),
  ]);

  const hasActiveFilters = Boolean(
    sp.status || sp.position || sp.experience || sp.location || sp.search || sp.dateFrom || sp.dateTo || sp.range
  );

  const exportParams: Record<string, string | undefined> = {};
  if (sp.status) exportParams.status = sp.status;
  if (sp.position) exportParams.position = sp.position;
  if (sp.search) exportParams.search = sp.search;
  exportParams.dateFrom = dateFrom?.toISOString().slice(0, 10);
  exportParams.dateTo = dateTo?.toISOString().slice(0, 10);

  const positionBarData = stats.topPositions.map((p) => ({ label: p.positionTitle, value: p.count }));
  const experienceBarData = stats.experienceDistribution.map((e) => ({ label: e.label, value: e.count }));
  const statusPieData = CAREER_APPLICATION_STATUSES.map((s) => ({ status: s.value, label: s.label, count: stats.byStatus[s.value] ?? 0 }));

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Careers" }]}
        title={<>Careers</>}
        description={<>Applicant overview across every open and closed role.</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/dealflow-ai/careers/applicants" className={buttonVariants({ variant: "outline", size: "sm" })}>
            View Applicants
          </Link>
          <CareersExportButton params={exportParams} />
        </div></>}
      />

      <CareerDashboardFilters
        status={status ?? ""}
        position={positionSlug ?? ""}
        positions={positions}
        experience={experience ?? ""}
        experienceOptions={experienceOptions}
        location={location ?? ""}
        locationOptions={locationOptions}
        search={search ?? ""}
        range={rangeParam}
        dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
        dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Overview */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Overview</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <KpiCard label="Total" value={stats.total} accent trend={stats.growthPercent} icon={<Inbox className="size-4" />} />
          {CAREER_APPLICATION_STATUSES.map((s) => {
            const Icon = CAREER_STATUS_ICONS[s.value];
            return (
              <KpiCard
                key={s.value}
                label={s.label}
                value={stats.byStatus[s.value] ?? 0}
                icon={<Icon className="size-4" />}
                trend={stats.growthByStatus[s.value]}
              />
            );
          })}
          <KpiCard label="Conversion Rate" value={stats.hiringConversionRate} suffix="%" icon={<Percent className="size-4" />} />
        </div>
      </DashboardSection>

      {/* Trends */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Trends</h2>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Applications Over Time</CardTitle>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent><TimeSeriesChart data={stats.timeSeries} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Monthly Hiring Trends</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={stats.hiredTimeSeries} /></CardContent>
        </GlassCard>
      </DashboardSection>

      {/* Positions & Experience */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Positions &amp; Experience</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Applicants by Position</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={positionBarData} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Experience Level Distribution</CardTitle></CardHeader>
            <CardContent>
              <CategoryBarChart data={experienceBarData} />
              <p className="mt-1 text-xs text-muted-foreground">Reflects the applied-to role&apos;s stated requirement, not the candidate&apos;s own experience.</p>
            </CardContent>
          </GlassCard>
        </div>
        <GlassCard>
          <CardHeader><CardTitle>Top Hiring Positions</CardTitle></CardHeader>
          <CardContent><TopPositions data={stats.topHiringPositions} /></CardContent>
        </GlassCard>
      </DashboardSection>

      {/* Status & Funnel */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Status &amp; Funnel</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Application Status Distribution</CardTitle></CardHeader>
            <CardContent><StatusPieChart data={statusPieData} colors={CAREER_STATUS_COLORS} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Hiring Funnel</CardTitle></CardHeader>
            <CardContent>
              <ConversionFunnel stages={stats.funnel} rejectedCount={stats.byStatus.rejected ?? 0} />
            </CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      <GlassCard>
        <CardHeader><CardTitle>Recent Applications</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {stats.recent.length === 0 && <p className="text-sm text-muted-foreground">No applications yet.</p>}
          {stats.recent.map((application) => {
            const meta = getCareerApplicationStatusMeta(application.status);
            return (
              <Link
                key={String(application._id)}
                href={`/dealflow-ai/careers/applicants/${application._id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/50"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`size-2 shrink-0 rounded-full ${meta.dotClass}`} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{application.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {application.positionTitle} · {formatDateTime(application.createdAt)}
                    </p>
                  </div>
                </div>
                <CareerStatusBadge status={application.status} />
              </Link>
            );
          })}
        </CardContent>
      </GlassCard>
    </div>
  );
}
