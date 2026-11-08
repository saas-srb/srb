import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import { IssueEditor } from "@/components/products/rankmax-ai/IssueControls";
import { PageHeader, SectionCard, SeverityBadge, IssueStatusBadge, CategoryBadge, EmptyState } from "@/components/products/rankmax-ai/SeoUi";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { getIssue } from "@/lib/products/rankmax-ai/issues";
import { getPageByPath } from "@/lib/products/rankmax-ai/pages";
import { listTasks, TASK_TYPES, TASK_PRIORITIES, TASK_STATUSES, taskTypeForCheck } from "@/lib/products/rankmax-ai/tasks";
import { listSeoUsers } from "@/lib/products/rankmax-ai/people";
import { listAudit, AUDIT_ACTION_LABEL } from "@/lib/products/rankmax-ai/audit";
import { createTaskFromIssueAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export default async function IssueDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();
  const [page, users, tasks, history] = await Promise.all([getPageByPath(issue.path), listSeoUsers(), listTasks({ issue: issue._id, pageSize: 50 }, viewer), listAudit({ entityId: issue._id, pageSize: 50 })]);
  const userOpts = users.map((u) => ({ value: u.id, label: u.label }));
  const name = (uid: string | null) => (uid === "audit" ? "Verified by audit" : users.find((u) => u.id === uid)?.label ?? "—");

  return (
    <div className="space-y-4">
      <PageHeader
        title={issue.title}
        crumbs={[{ label: "SEO Issues", href: "/rankmax-ai/issues" }, { label: issue.title }]}
        description={<span className="flex flex-wrap items-center gap-2"><SeverityBadge severity={issue.severity} /><CategoryBadge category={issue.category} /><IssueStatusBadge status={issue.status} />{page ? <Link href={`/rankmax-ai/pages/${page._id}`} className="text-primary hover:underline">{issue.path}</Link> : issue.path}</span>}
        actions={
          can(viewer, "MANAGE_TASKS") && (
            <EditDialog
              trigger={<Button size="sm"><ListPlus className="size-3.5" data-icon="inline-start" />Create task</Button>}
              title="Create a task for this issue"
              description="The issue moves to In Progress; the task links back here."
              columns={2}
              fields={[
                { key: "title", label: "Title", type: "text", maxLength: 200 },
                { key: "type", label: "Type", type: "select", options: Object.entries(TASK_TYPES).map(([value, label]) => ({ value, label })) },
                { key: "priority", label: "Priority", type: "select", options: Object.entries(TASK_PRIORITIES).map(([value, label]) => ({ value, label })) },
                { key: "assigneeId", label: "Assignee", type: "select", noneLabel: "Unassigned", options: viewer.isManagerTier ? userOpts : userOpts.filter((u) => u.value === viewer.userId) },
                { key: "dueDate", label: "Due date", type: "date" },
              ]}
              initial={{ title: `${issue.title} — ${issue.path}`, type: taskTypeForCheck(issue.checkId), priority: issue.severity === "critical" ? "urgent" : issue.severity === "high" ? "high" : "medium", assigneeId: issue.assigneeId ?? "", dueDate: "" }}
              onSubmit={async (v) => {
                "use server";
                return createTaskFromIssueAction(issue._id, v);
              }}
            />
          )
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="What's wrong">
            <p className="text-sm">{issue.description || "—"}</p>
            {issue.details.length > 0 && (
              <ul className="mt-3 max-h-72 list-disc space-y-0.5 overflow-auto rounded-lg bg-muted/50 py-2 pr-2 pl-6 font-mono text-xs">
                {issue.details.map((d) => <li key={d} className="break-all">{d}</li>)}
              </ul>
            )}
          </SectionCard>
          <SectionCard title="Recommendation"><p className="text-sm">{issue.recommendation || "—"}</p></SectionCard>
          <SectionCard title={`Tasks (${tasks.total})`}>
            {tasks.items.length === 0 ? <EmptyState title="No tasks yet" /> : (
              <ul className="divide-y divide-border/40 text-sm">
                {tasks.items.map((t) => <li key={t._id}><Link href={`/rankmax-ai/tasks/${t._id}`} className="flex items-center justify-between gap-2 py-1.5 hover:text-primary"><span className="truncate"><span className="mr-2 text-xs text-muted-foreground">{t.code}</span>{t.title}</span><span className="shrink-0 text-xs">{TASK_STATUSES[t.status]}</span></Link></li>)}
              </ul>
            )}
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Manage">
            <IssueEditor id={issue._id} status={issue.status} assigneeId={issue.assigneeId ?? ""} notes={issue.notes} users={userOpts} canEdit={can(viewer, "EDIT")} />
          </SectionCard>
          <SectionCard title="Timeline">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Source</dt><dd className="capitalize">{issue.source}</dd>
              <dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(issue.createdAt)}</dd>
              <dt className="text-muted-foreground">Last seen</dt><dd>{formatDateTime(issue.lastSeenAt)}</dd>
              <dt className="text-muted-foreground">Seen in</dt><dd>{issue.occurrences} audit(s)</dd>
              <dt className="text-muted-foreground">Resolved</dt><dd>{issue.resolvedAt ? formatDateTime(issue.resolvedAt) : "—"}</dd>
              <dt className="text-muted-foreground">Resolved by</dt><dd>{issue.resolvedBy ? name(issue.resolvedBy) : "—"}</dd>
            </dl>
            {history.items.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-border/40 pt-2 text-xs">
                {history.items.map((h) => <li key={h._id}><span className="text-muted-foreground">{formatDateTime(h.createdAt)}</span> · {h.actorEmail} · {AUDIT_ACTION_LABEL[h.action]} {h.summary && `— ${h.summary}`}</li>)}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
