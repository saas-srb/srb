import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  Users,
  UserCheck,
  UserPlus,
  Building2,
  TrendingUp,
  PieChart as PieChartIcon,
  Clock3,
  CalendarOff,
  UserX,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import HrmsDashboardFilters from "@/components/products/talentos/HrmsDashboardFilters";
import HrmsDonutChart from "@/components/products/talentos/HrmsDonutChart";
import AttendanceOverviewChart from "@/components/products/talentos/AttendanceOverviewChart";
import EmployeeStatusBadge from "@/components/products/talentos/EmployeeStatusBadge";

import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canViewAllEmployees } from "@/lib/hrms-roles";
import { getHrmsDashboardStats } from "@/lib/products/talentos/dashboard";
import { getHrmsOperationsStats } from "@/lib/products/talentos/dashboard-ops";
import { listDepartments } from "@/lib/products/talentos/departments";

import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

const GENDER_COLORS: Record<string, string> = {
  male: "var(--brand-deep)",
  female: "var(--primary)",
  other: "var(--brand-gradient)",
  undisclosed: "color-mix(in srgb, var(--brand-deep) 45%, white)",
  unknown: "#94a3b8",
};

export default async function HrmsAdvanceAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{
    range?: string;
    dateFrom?: string;
    dateTo?: string;
    granularity?: string;
    departmentId?: string;
    employmentType?: string;
    status?: string;
    gender?: string;
  }>;
}) {
  const user = await getCurrentHrmsUser();
  if (!user) redirect("/talentos");

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

  const restrictToManagerId = user && !canViewAllEmployees(user) ? user.employeeId ?? "__none__" : undefined;
  const opsFrom = (dateFrom ?? new Date()).toISOString().slice(0, 10);
  const opsTo = (dateTo ?? new Date()).toISOString().slice(0, 10);

  const [stats, ops, departments] = await Promise.all([
    getHrmsDashboardStats({
      dateFrom,
      dateTo,
      granularity,
      departmentId: sp.departmentId || undefined,
      employmentType: sp.employmentType || undefined,
      status: sp.status || undefined,
      gender: sp.gender || undefined,
    }),
    getHrmsOperationsStats({ from: opsFrom, to: opsTo, restrictToManagerId }),
    listDepartments(),
  ]);

  const hasActiveFilters = Boolean(
    sp.range || sp.dateFrom || sp.dateTo || sp.departmentId || sp.employmentType || sp.status || sp.gender
  );
  const genderPie = stats.genderDistribution.filter((g) => g.count > 0);

  return (
    <div className="relative space-y-6">

      {/* Breadcrumbs */}
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Advance Analytics" }]}
        title={<>
            Advance Analytics & Workforce Intelligence</>}
        description={<>In-depth analytics for headcount trends, hiring velocity, attrition metrics, department distribution, and diversity.</>}
        actions={<><div className="flex flex-wrap items-center gap-2">
          <Link href="/talentos/employees" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Users className="size-4" />
            <span>Employee Directory</span>
          </Link>
        </div></>}
      />

      {/* ── Filter Controls ── */}
      <HrmsDashboardFilters
        range={rangeParam}
        dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
        dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
        departmentId={sp.departmentId ?? ""}
        employmentType={sp.employmentType ?? ""}
        status={sp.status ?? ""}
        gender={sp.gender ?? ""}
        departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
        hasActiveFilters={hasActiveFilters}
      />

      {/* ── Workforce KPIs ── */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground flex items-center gap-2">
          <Users className="size-4 text-primary" />
          Workforce & Headcount KPIs
        </h2>
        <KpiGrid>
          <KpiCard label="Total Employees" value={stats.totalEmployees} accent icon={<Users className="size-4" />} />
          <KpiCard label="Active Workforce" value={stats.activeEmployees} icon={<UserCheck className="size-4" />} />
          <KpiCard
            label="New Joinees"
            value={stats.newJoinees}
            trend={stats.newJoineesGrowth}
            icon={<UserPlus className="size-4" />}
          />
          <KpiCard label="Departments" value={stats.departments} icon={<Building2 className="size-4" />} />
          <KpiCard label="Present Today" value={ops.presentToday} icon={<Clock3 className="size-4" />} />
          <KpiCard label="On Leave Today" value={ops.onLeaveToday} icon={<CalendarOff className="size-4" />} />
        </KpiGrid>
      </DashboardSection>

      {/* ── Headcount Growth Trend ── */}
      <DashboardSection className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <TrendingUp className="size-4 text-primary" />
          Headcount & Hiring Growth
        </h2>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-sm font-bold">Cumulative Headcount Timeline</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Total organization employee headcount over selected period.</p>
            </div>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.headcountTimeSeries} />
          </CardContent>
        </GlassCard>
      </DashboardSection>

      {/* ── Hiring vs Attrition Dual Grid ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
              <UserPlus className="size-4" />
              Monthly Hiring Velocity
            </CardTitle>
            <p className="text-xs text-muted-foreground">New employee onboardings per month.</p>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.hiringTimeSeries} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <UserX className="size-4" />
              Attrition & Exits Trend
            </CardTitle>
            <p className="text-xs text-muted-foreground">Employee resignations and terminations.</p>
          </CardHeader>
          <CardContent>
            <TimeSeriesChart data={stats.attritionTimeSeries} />
          </CardContent>
        </GlassCard>
      </div>

      {/* ── Distribution Charts Grid ── */}
      <DashboardSection className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <PieChartIcon className="size-4 text-primary" />
          Workforce Demographics & Department Distribution
        </h2>
        <div className="grid gap-5 lg:grid-cols-2">

          {/* Department Breakdown */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Building2 className="size-4 text-primary" />
                Department-wise Headcount
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryBarChart data={stats.departmentDistribution} />
            </CardContent>
          </GlassCard>

          {/* Employment Type Distribution */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Employment Type Breakdown</span>
                <span className="text-xs font-normal text-muted-foreground">Full-time, Contract, Intern</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HrmsDonutChart data={stats.employmentTypeDistribution.map((t) => ({ label: t.label, count: t.value }))} height={260} />
            </CardContent>
          </GlassCard>

          {/* Gender Diversity Pie */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-between">
                <span>Gender Diversity Distribution</span>
                <span className="text-xs font-normal text-muted-foreground">Ratio breakdown</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusPieChart
                data={genderPie.map((g) => ({ status: g.status, label: g.label, count: g.count }))}
                colors={GENDER_COLORS}
              />
            </CardContent>
          </GlassCard>

          {/* Employee Status Breakdown */}
          <GlassCard>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Employee Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-2">
              {stats.statusDistribution.map((s) => (
                <div key={s.status} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                  <EmployeeStatusBadge status={s.status} />
                  <span className="font-semibold tabular-nums text-foreground">{s.count} employees</span>
                </div>
              ))}
            </CardContent>
          </GlassCard>

        </div>
      </DashboardSection>

      {/* ── Attendance & Leave Overview ── */}
      <DashboardSection className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
          <Clock3 className="size-4 text-primary" />
          Attendance & Operational Performance
        </h2>
        <GlassCard>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-bold">Attendance Register Overview</CardTitle>
            <p className="text-xs text-muted-foreground">Daily attendance logs for present, late, on leave, and absent statuses.</p>
          </CardHeader>
          <CardContent>
            <AttendanceOverviewChart data={ops.attendanceOverview} />
          </CardContent>
        </GlassCard>
      </DashboardSection>

    </div>
  );
}
