import DashboardSection from "@/components/platform/panel/DashboardSection";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import Link from "next/link";
import {
  FolderKanban,
  Rocket,
  CheckCircle2,
  PauseCircle,
  AlarmClock,
  Building2,
  Users,
  Gauge,
  Plus,
  BarChart3,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import PmsDashboardFilters from "@/components/products/sprintos/PmsDashboardFilters";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { ProjectStatusBadge } from "@/components/products/sprintos/StatusBadges";
import ProjectBillingDownloadButtons from "@/components/products/sprintos/ProjectBillingDownloadButtons";

import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canViewAllProjects } from "@/lib/pms-roles";
import { getPmsDashboardStats } from "@/lib/products/sprintos/dashboard";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { PROJECT_STATUSES } from "@/lib/products/sprintos/constants";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";
import { formatDate } from "@/lib/utils";

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

const STATUS_COLORS: Record<string, string> = {
  planning: "color-mix(in srgb, var(--brand-deep) 45%, white)",
  in_progress: "var(--primary)",
  review: "#3b82f6",
  testing: "#a855f7",
  completed: "#22c55e",
  on_hold: "#f59e0b",
  cancelled: "#ef4444",
};

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function PmsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    dateFrom?: string;
    dateTo?: string;
    granularity?: string;
    clientId?: string;
    status?: string;
    priority?: string;
    billingModel?: string;
    overdue?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentPmsUser();

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

  const restrictToEmployeeId =
    user && !canViewAllProjects(user) ? user.employeeId ?? "__none__" : undefined;

  const [stats, clients] = await Promise.all([
    getPmsDashboardStats({ dateFrom, dateTo, granularity, restrictToEmployeeId }),
    listClientOptions(),
  ]);

  const hasActiveFilters = Boolean(
    sp.range || sp.dateFrom || sp.dateTo || sp.clientId || sp.status || sp.priority || sp.billingModel || sp.overdue
  );
  const scoped = Boolean(restrictToEmployeeId);

  // Derive a friendly greeting name from email
  const displayName = user?.email ? user.email.split("@")[0].replace(/[._]/g, " ") : "";

  return (
    <div className="relative space-y-5">

      <PanelDashboardHeader
        breadcrumbs={[{ label: "SprintOS", href: "/sprintos" }, { label: "Dashboard" }]}
        title="Project Portfolio Overview"
        description={<>{displayName ? `Welcome back, ${displayName}. ` : ""}Track delivery progress, team capacity and billing health across your projects.</>}
        actions={
          <>
            <Link href="/sprintos/projects/new">
              <Button size="sm" className="gap-1.5 shadow-xs">
                <Plus className="size-4" />
                <span>New Project</span>
              </Button>
            </Link>
            <Link href="/sprintos/analytics">
              <Button size="sm" variant="outline" className="gap-1.5 shadow-xs">
                <BarChart3 className="size-4" />
                <span>Analytics</span>
              </Button>
            </Link>
          </>
        }
        filters={<PmsDashboardFilters
              range={rangeParam}
              dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
              dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
              clientId={sp.clientId ?? ""}
              status={sp.status ?? ""}
              priority={sp.priority ?? ""}
              granularity={granularity}
              billingModel={sp.billingModel ?? ""}
              overdue={sp.overdue ?? ""}
              clients={clients}
              hasActiveFilters={hasActiveFilters}
            />}
      />

      {/* ── Portfolio KPIs ── */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Portfolio Overview</h2>
        <KpiGrid>
          <KpiCard label="Total Projects" value={stats.totalProjects} accent icon={<FolderKanban className="size-4" />} />
          <KpiCard label="Active Delivery" value={stats.activeProjects} icon={<Rocket className="size-4" />} />
          <KpiCard label="Completed" value={stats.completedProjects} icon={<CheckCircle2 className="size-4" />} />
          <KpiCard label="On Hold" value={stats.onHoldProjects} icon={<PauseCircle className="size-4" />} />
        </KpiGrid>
      </DashboardSection>

      {/* ── Capacity & Milestones KPIs ── */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Capacity &amp; Health</h2>
        <KpiGrid>
          <KpiCard label="Overdue Projects" value={stats.overdueProjects} tone={stats.overdueProjects > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
          {!scoped && <KpiCard label="Active Clients" value={stats.totalClients} icon={<Building2 className="size-4" />} />}
          <KpiCard label="Team Utilization" value={stats.teamUtilization} suffix="%" icon={<Users className="size-4" />} />
          <KpiCard label="Overall Completion" value={stats.overallCompletion} suffix="%" icon={<Gauge className="size-4" />} />
          {scoped && <KpiCard label="New This Period" value={stats.newProjects} trend={stats.newProjectsGrowth} icon={<FolderKanban className="size-4" />} />}
        </KpiGrid>
      </DashboardSection>

      {/* ── Distribution & Workload Charts ── */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Distribution &amp; Workload</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold">Project Status Distribution</CardTitle></CardHeader>
            <CardContent>
              <StatusPieChart
                data={stats.statusDistribution.filter((s) => s.count > 0)}
                colors={STATUS_COLORS}
              />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold">Priority Mix</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.priorityDistribution} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold">Client-wise Projects</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.clientDistribution} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle className="text-sm font-bold">Deadline &amp; Schedule Analysis</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.deadlineBuckets} /></CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* ── Trends & Progress ── */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Trends &amp; Progress</h2>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-bold">Monthly Project Growth</CardTitle>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent><TimeSeriesChart data={stats.monthlyGrowth} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle className="text-sm font-bold">Average Progress Trend</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={stats.progressTrend} /></CardContent>
        </GlassCard>
      </DashboardSection>

      {/* ── Status Board & Recent Projects ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle className="text-sm font-bold">Status Board Summary</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-2">
            {PROJECT_STATUSES.map((s) => {
              const row = stats.statusDistribution.find((d) => d.status === s.value);
              return (
                <div key={s.value} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <ProjectStatusBadge status={s.value} />
                  <span className="font-semibold tabular-nums text-foreground">{row?.count ?? 0}</span>
                </div>
              );
            })}
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
            <CardTitle className="text-sm font-bold">Recent Projects &amp; PDF Downloads</CardTitle>
            <Link href="/sprintos/projects" className="text-xs text-primary hover:underline font-semibold">View All →</Link>
          </CardHeader>
          <CardContent className="space-y-2 pt-3">
            {stats.recentProjects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
            {stats.recentProjects.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-border/60 p-3 text-sm transition-colors hover:bg-muted/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/sprintos/projects/${p.id}`} className="min-w-0 truncate font-bold text-foreground hover:underline">
                    {p.name}
                  </Link>
                  <ProjectBillingDownloadButtons projectId={p.id} projectCode={p.code} variant="compact" />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Code: <span className="font-mono text-primary font-semibold">{p.code}</span>
                  {p.endDate ? ` · Due ${formatDate(p.endDate)}` : ""}
                </p>
                <ProgressBar value={p.progressPercent} className="mt-2" />
              </div>
            ))}
          </CardContent>
        </GlassCard>
      </div>
    </div>
  );
}
