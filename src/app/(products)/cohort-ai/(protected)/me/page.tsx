import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, Layers, Gauge, CalendarDays, UserRound } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ProgressBar from "@/components/products/sprintos/ProgressBar";
import { BatchStatusBadge, ProgramCategoryBadge, StudentStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { formatDate } from "@/lib/utils";

export default async function StudentHomePage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const overview = await getStudentOverview(user.studentId);
  if (!overview) redirect("/cohort-ai");

  const { student: s, enrollments, averageProgress } = overview;
  const primary = enrollments.find((e) => e.status === "active") ?? enrollments[0] ?? null;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "My Dashboard" }]}
        title={<>Welcome, {s.fullName.split(" ")[0]}</>}
        description={<><span className="font-mono">{s.studentCode}</span> · <StudentStatusBadge status={s.status} /></>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Enrolments" value={enrollments.length} accent icon={<Layers className="size-4" />} />
        <KpiCard label="Overall Progress" value={averageProgress} suffix="%" icon={<Gauge className="size-4" />} />
        <KpiCard
          label="Current Program"
          value={primary ? primary.programName : "—"}
          icon={<GraduationCap className="size-4" />}
        />
        <KpiCard
          label="Batch Starts"
          value={primary?.startDate ? formatDate(primary.startDate) : "TBD"}
          icon={<CalendarDays className="size-4" />}
        />
      </KpiGrid>

      {enrollments.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You are not enrolled in a batch yet. Your training coordinator will assign you shortly.
          </CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {enrollments.map((e) => (
            <GlassCard key={e.enrollmentId}>
              <CardHeader className="flex-row items-start justify-between space-y-0">
                <div>
                  <CardTitle className="text-base">{e.programName}</CardTitle>
                  <p className="mt-0.5 text-xs text-muted-foreground">{e.batchName} ({e.batchCode})</p>
                </div>
                <ProgramCategoryBadge category={e.programCategory} />
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Progress</p>
                  <ProgressBar value={e.progressPercent} />
                </div>
                <dl className="space-y-1.5 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Batch status</dt>
                    <dd><BatchStatusBadge status={e.batchStatus} /></dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Schedule</dt>
                    <dd className="text-right">{e.timing || "TBD"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Dates</dt>
                    <dd>{e.startDate ? formatDate(e.startDate) : "TBD"} – {e.endDate ? formatDate(e.endDate) : "TBD"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Mentor</dt>
                    <dd>{e.mentorName ?? "To be assigned"}</dd>
                  </div>
                </dl>
                <Link href="/cohort-ai/me/batch" className="inline-block text-xs font-medium text-primary hover:underline">
                  Batch details →
                </Link>
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}

      <GlassCard interactive={false}>
        <CardContent className="flex flex-wrap items-center gap-4 py-4 text-sm">
          <Link href="/cohort-ai/me/program" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <GraduationCap className="size-4" /> My Program
          </Link>
          <Link href="/cohort-ai/me/batch" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <Layers className="size-4" /> My Batch
          </Link>
          <Link href="/cohort-ai/me/profile" className="inline-flex items-center gap-1.5 text-primary hover:underline">
            <UserRound className="size-4" /> Edit Profile
          </Link>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        Class schedule, assignments, live projects, certificates and payments appear here as later phases roll out.
      </p>
</PanelListFilters>
    </div>
  );
}
