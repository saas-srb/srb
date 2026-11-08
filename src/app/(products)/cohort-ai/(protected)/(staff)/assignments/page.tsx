import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { Plus, ClipboardList, Send, CheckCircle2, AlarmClock } from "lucide-react";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button } from "@/components/ui/button";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import AssignmentForm from "@/components/products/cohort-ai/AssignmentForm";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { listAssignments, countAssignments } from "@/lib/products/cohort-ai/assignments";
import { listBatchPickerOptions } from "@/lib/products/cohort-ai/batches";
import { formatDate } from "@/lib/utils";

export default async function AssignmentsPage() {
  const user = await getCurrentTmsUser();
  const canManage = user ? canManageTraining(user) : false;

  const [assignments, batches, total] = await Promise.all([
    listAssignments({}, 500),
    listBatchPickerOptions(),
    countAssignments(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const totalSubs = assignments.reduce((s, a) => s + a.submittedCount, 0);
  const totalReviewed = assignments.reduce((s, a) => s + a.reviewedCount, 0);
  const overdue = assignments.filter((a) => a.dueDate && a.dueDate < today).length;
  const batchOptions = batches.map((b) => ({ _id: b._id, name: b.name, programName: b.programName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Cohort AI", href: "/cohort-ai" }, { label: "Assignments" }]}
        title={<>Assignments</>}
        description={<>{total} assignment{total === 1 ? "" : "s"} across all batches.</>}
        actions={<>{canManage && (
          <AssignmentForm
            batches={batchOptions}
            trigger={
              <Button type="button" size="sm">
                <Plus className="size-3.5" data-icon="inline-start" />
                New Assignment
              </Button>
            }
          />
        )}</>}
      />

      <PanelListFilters>
<KpiGrid>
        <KpiCard label="Total" value={total} accent icon={<ClipboardList className="size-4" />} />
        <KpiCard label="Submissions" value={totalSubs} icon={<Send className="size-4" />} />
        <KpiCard label="Reviewed" value={totalReviewed} icon={<CheckCircle2 className="size-4" />} />
        <KpiCard label="Past Due" value={overdue} tone={overdue > 0 ? "down" : undefined} icon={<AlarmClock className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="max-h-[65vh] overflow-auto">
          {assignments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No assignments yet.{" "}
              {canManage ? "Use “New Assignment”." : "Your mentors will post assignments here."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Batch / Program</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Reviewed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a._id}>
                    <TableCell>
                      <Link href={`/cohort-ai/assignments/${a._id}`} className="font-medium hover:underline">{a.title}</Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {a.batchName}
                      <div className="text-xs">{a.programName}</div>
                    </TableCell>
                    <TableCell className={a.dueDate && a.dueDate < today ? "text-destructive" : "text-muted-foreground"}>
                      {a.dueDate ? formatDate(a.dueDate) : "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{a.maxMarks}</TableCell>
                    <TableCell className="tabular-nums">{a.submittedCount}/{a.rosterSize}</TableCell>
                    <TableCell className="tabular-nums">{a.reviewedCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
