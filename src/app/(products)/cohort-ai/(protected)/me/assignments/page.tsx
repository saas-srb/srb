import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { ClipboardList, Send, CheckCircle2, AlarmClock } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import AssignmentSubmitCard from "@/components/products/cohort-ai/AssignmentSubmitCard";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { listStudentAssignments } from "@/lib/products/cohort-ai/assignments";

export default async function MyAssignmentsPage() {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) redirect("/cohort-ai");
  const overview = await getStudentOverview(user.studentId);
  if (!overview) redirect("/cohort-ai");

  const items = await listStudentAssignments(user.studentId, overview.enrollments.map((e) => e.batchId));
  const today = new Date().toISOString().slice(0, 10);
  const submitted = items.filter((i) => i.submission && i.submission.status !== "pending").length;
  const reviewed = items.filter((i) => i.submission?.status === "reviewed").length;
  const pendingOverdue = items.filter((i) => i.dueDate && i.dueDate < today && (!i.submission || i.submission.status === "pending")).length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai/me" }, { label: "Assignments" }]}
        title={<>Assignments</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total" value={items.length} accent icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Submitted" value={submitted} icon={<Send className="size-4" />} />
        <KpiCard label="Reviewed" value={reviewed} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Overdue" value={pendingOverdue} tone={pendingOverdue > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
      </KpiGrid>

      {items.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No assignments yet.</CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <AssignmentSubmitCard key={item._id} item={item} />
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
