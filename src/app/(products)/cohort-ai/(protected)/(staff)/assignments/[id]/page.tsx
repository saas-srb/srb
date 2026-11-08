import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Award, Send, CheckCircle2, ExternalLink } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import AssignmentActions from "@/components/products/cohort-ai/AssignmentActions";
import SubmissionReviewTable from "@/components/products/cohort-ai/SubmissionReviewTable";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { getAssignment, serializeAssignment, getAssignmentSubmissions } from "@/lib/products/cohort-ai/assignments";
import { getBatch } from "@/lib/products/cohort-ai/batches";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { formatDate } from "@/lib/utils";

export default async function AssignmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const assignment = await getAssignment(id);
  if (!assignment) notFound();

  const [user, batch, program, submissions, batches] = await Promise.all([
    getCurrentTmsUser(),
    getBatch(assignment.batchId),
    getProgram(assignment.programId),
    getAssignmentSubmissions(id, assignment.batchId),
    listBatchPickerOptions(),
  ]);

  const canManage = user ? canManageTraining(user) : false;
  const a = serializeAssignment(assignment);
  const submitted = submissions.filter((s) => s.status !== "pending").length;
  const reviewed = submissions.filter((s) => s.status === "reviewed").length;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Assignments", href: "/cohort-ai/assignments" }, { label: a.title }]}
        title={<>{a.title}</>}
        description={<>{batch ? (
              <Link href={`/cohort-ai/batches/${batch._id}`} className="text-primary hover:underline">{batch.name}</Link>
            ) : "Unknown batch"}
            {program ? ` · ${program.name}` : ""}</>}
        actions={<>{canManage && (
          <AssignmentActions
            assignment={a}
            batches={batches.map((b) => ({ _id: b._id, name: b.name, programName: b.programName }))}
          />
        )}</>}
      />

      <KpiGrid>
        <KpiCard label="Due Date" value={a.dueDate ? formatDate(a.dueDate) : "—"} accent icon={<CalendarDays className="size-4" />} />
        <KpiCard label="Max Marks" value={a.maxMarks} icon={<Award className="size-4" />} />
        <KpiCard label="Submitted" value={`${submitted}/${submissions.length}`} icon={<Send className="size-4" />} />
        <KpiCard label="Reviewed" value={reviewed} icon={<CheckCircle2 className="size-4" />} />
      </KpiGrid>

      <GlassCard>
        <CardHeader><CardTitle>Instructions</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p className="whitespace-pre-wrap text-muted-foreground">{a.description || "No instructions provided."}</p>
          {a.attachmentUrl && (
            <a href={a.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
              Assignment brief <ExternalLink className="size-3" />
            </a>
          )}
        </CardContent>
      </GlassCard>

      <SubmissionReviewTable assignmentId={a._id} maxMarks={a.maxMarks} rows={submissions} canReview={canManage} />
    </div>
  );
}
