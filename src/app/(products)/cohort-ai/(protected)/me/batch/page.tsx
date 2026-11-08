import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { CalendarDays, Clock, UserRound } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { BatchStatusBadge } from "@/components/products/cohort-ai/StatusBadges";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { formatDate } from "@/lib/utils";

export default async function MyBatchPage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const overview = await getStudentOverview(user.studentId);
  if (!overview) redirect("/cohort-ai");

  const { enrollments } = overview;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "My Batch" }]}
        title={<>My Batch</>}
      />

      <PanelListFilters>
{enrollments.length === 0 && (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            You have not been assigned to a batch yet.
          </CardContent>
        </GlassCard>
      )}

      {enrollments.map((e) => (
        <GlassCard key={e.enrollmentId}>
          <CardHeader className="flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{e.batchName}</CardTitle>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="font-mono">{e.batchCode}</span> · {e.programName}
              </p>
            </div>
            <BatchStatusBadge status={e.batchStatus} />
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" />
              <span>{e.startDate ? formatDate(e.startDate) : "Start TBD"} – {e.endDate ? formatDate(e.endDate) : "End TBD"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-muted-foreground" />
              <span>{e.timing || "Timing to be announced"}</span>
            </div>
            <div className="flex items-center gap-2">
              <UserRound className="size-4 shrink-0 text-muted-foreground" />
              <span>Mentor: {e.mentorName ?? "To be assigned"}</span>
            </div>
            <p className="border-t border-border/60 pt-2 text-xs text-muted-foreground">
              Enrolled {formatDate(e.enrolledOn)}
            </p>
          </CardContent>
        </GlassCard>
      ))}
</PanelListFilters>
    </div>
  );
}
