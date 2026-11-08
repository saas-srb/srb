import DashboardSection from "@/components/platform/panel/DashboardSection";
import PanelDashboardHeader from "@/components/platform/panel/PanelDashboardHeader";
import {
  Users,
  Briefcase,
  GraduationCap,
  Layers,
  Rocket,
  CheckCircle2,
  Target,
  IndianRupee,
  BadgeCheck,
} from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import TimeSeriesChart from "@/components/products/dealflow-ai/TimeSeriesChart";
import CategoryBarChart from "@/components/products/dealflow-ai/CategoryBarChart";
import StatusPieChart from "@/components/products/dealflow-ai/StatusPieChart";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import TmsDashboardFilters from "@/components/products/cohort-ai/TmsDashboardFilters";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getTmsDashboardStats } from "@/lib/products/cohort-ai/dashboard";
import { listProgramOptions } from "@/lib/products/cohort-ai/programs";
import { isValidTrainingMode, type TrainingMode } from "@/lib/products/cohort-ai/constants";
import { isValidDateRangePreset, resolveDateRangePreset, type DateRangePreset } from "@/lib/date-ranges";
import type { DashboardGranularity } from "@/lib/granularity";

const VALID_GRANULARITIES: DashboardGranularity[] = ["day", "week", "month", "year"];

const CATEGORY_COLORS: Record<string, string> = {
  industrial: "var(--primary)",
  internship: "#3b82f6",
};

function parseDateParam(value: string | undefined, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function TmsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; dateFrom?: string; dateTo?: string; granularity?: string; programId?: string; mode?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentTmsUser();

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

  const programId = sp.programId || undefined;
  const mode: TrainingMode | undefined = sp.mode && isValidTrainingMode(sp.mode) ? sp.mode : undefined;

  const [stats, programs] = await Promise.all([
    getTmsDashboardStats({ dateFrom, dateTo, granularity, programId, mode }),
    listProgramOptions(),
  ]);

  const hasActiveFilters = Boolean(sp.range || sp.dateFrom || sp.dateTo || sp.programId || sp.mode);

  return (
    <div className="relative space-y-4">
      <PanelDashboardHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Dashboard" }]}
        title="Training Operations Overview"
        description={<>Welcome back{user ? `, ${user.email.split("@")[0]}` : ""}. Monitor enrolments, batches, attendance and fee collection across your programs.</>}
        filters={<TmsDashboardFilters
              range={rangeParam}
              dateFrom={(dateFrom ?? new Date()).toISOString().slice(0, 10)}
              dateTo={(dateTo ?? new Date()).toISOString().slice(0, 10)}
              programId={sp.programId ?? ""}
              mode={sp.mode ?? ""}
              programs={programs.map((p) => ({ _id: p._id, name: p.name }))}
              hasActiveFilters={hasActiveFilters}
            />}
      />

      {/* Enrolment KPIs */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Enrolment</h2>
        <KpiGrid>
          <KpiCard label="Total Students" value={stats.totalStudents} accent icon={<Users className="size-4" />} />
          <KpiCard label="Industrial Training" value={stats.industrialStudents} icon={<GraduationCap className="size-4" />} />
          <KpiCard label="Internship Students" value={stats.internshipStudents} icon={<Briefcase className="size-4" />} />
          <KpiCard label="New This Period" value={stats.newStudents} trend={stats.newStudentsGrowth} icon={<Rocket className="size-4" />} />
        </KpiGrid>
      </DashboardSection>

      {/* Delivery KPIs */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Delivery</h2>
        <KpiGrid>
          <KpiCard label="Active Batches" value={stats.activeBatches} icon={<Layers className="size-4" />} />
          <KpiCard label="Running Programs" value={stats.runningPrograms} icon={<Rocket className="size-4" />} />
          <KpiCard label="Completed Programs" value={stats.completedPrograms} icon={<CheckCircle2 className="size-4" />} />
        </KpiGrid>
      </DashboardSection>

      {/* Outcomes KPIs */}
      <DashboardSection>
        <h2 className="mb-3 text-lg font-semibold text-foreground">Outcomes</h2>
        <KpiGrid>
          <KpiCard label="Placement Success Rate" value={stats.placementSuccessRate} suffix="%" icon={<Target className="size-4" />} />
          <KpiCard label="Total Revenue" value={stats.totalRevenue} format="currency" accent icon={<IndianRupee className="size-4" />} />
          <KpiCard label="Certificates Issued" value={stats.certificatesIssued} icon={<BadgeCheck className="size-4" />} />
        </KpiGrid>
      </DashboardSection>

      {/* Distribution */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Distribution</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <GlassCard>
            <CardHeader><CardTitle>Industrial vs Internship</CardTitle></CardHeader>
            <CardContent>
              <StatusPieChart data={stats.categorySplit.filter((s) => s.count > 0)} colors={CATEGORY_COLORS} />
            </CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Program-wise Enrolment</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.programEnrollment} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Batch Occupancy (%)</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.batchOccupancy} /></CardContent>
          </GlassCard>
          <GlassCard>
            <CardHeader><CardTitle>Completion Rate</CardTitle></CardHeader>
            <CardContent><CategoryBarChart data={stats.completionRate} /></CardContent>
          </GlassCard>
        </div>
      </DashboardSection>

      {/* Trends */}
      <DashboardSection className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">Trends</h2>
        <GlassCard>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Student Enrolment Trend</CardTitle>
            <GranularityToggle value={granularity} />
          </CardHeader>
          <CardContent><TimeSeriesChart data={stats.enrollmentTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Monthly Admissions</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={stats.monthlyAdmissions} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Revenue Analytics</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={stats.revenueTrend} /></CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader><CardTitle>Placement Analytics</CardTitle></CardHeader>
          <CardContent><TimeSeriesChart data={stats.placementTrend} /></CardContent>
        </GlassCard>
      </DashboardSection>
    </div>
  );
}
