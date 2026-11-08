import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { CalendarDays, CheckCircle2, Percent } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ClassScheduleView from "@/components/products/cohort-ai/ClassScheduleView";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { upcomingClassesForBatches, pastClassesForBatches, studentAttendanceSummary } from "@/lib/products/cohort-ai/classes";

export default async function MySchedulePage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const overview = await getStudentOverview(user.studentId);
  if (!overview) redirect("/cohort-ai");

  const batchIds = overview.enrollments.map((e) => e.batchId);
  const [upcoming, past, attendance] = await Promise.all([
    upcomingClassesForBatches(batchIds, 100),
    pastClassesForBatches(batchIds, 100),
    studentAttendanceSummary(user.studentId),
  ]);
  const all = [...upcoming, ...past];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "Class Schedule" }]}
        title={<>Class Schedule</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Upcoming Classes" value={upcoming.length} accent icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Classes Attended" value={attendance.attended} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Attendance Rate" value={attendance.ratePercent} suffix="%" icon={<Percent className="size-4" />} />
        <KpiCard label="Marks Recorded" value={attendance.total} icon={<CalendarDays className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="py-5">
          {all.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No classes scheduled for your batch yet.
            </p>
          ) : (
            <ClassScheduleView
              linked={false}
              classes={all.map((c) => ({
                _id: c._id,
                topic: c.topic,
                batchName: c.batchName,
                batchCode: c.batchCode,
                programName: c.programName,
                mentorName: c.mentorName,
                date: c.date,
                startTime: c.startTime,
                durationMinutes: c.durationMinutes,
                meetingLink: c.meetingLink,
                status: c.status,
              }))}
            />
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
