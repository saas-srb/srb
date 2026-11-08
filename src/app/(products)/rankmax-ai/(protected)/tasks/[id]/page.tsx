import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import ActionButton from "@/components/products/rankmax-ai/ActionButton";
import { TaskStatusButtons, TaskComment } from "@/components/products/rankmax-ai/TaskControls";
import { PageHeader, SectionCard, EmptyState, SeverityBadge, IssueStatusBadge } from "@/components/products/rankmax-ai/SeoUi";
import { taskFields, TASK_STATUS_CLASS } from "@/components/products/rankmax-ai/task-fields";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { getTask, canWorkOnTask, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/products/rankmax-ai/tasks";
import { getIssue } from "@/lib/products/rankmax-ai/issues";
import { getPageByPath } from "@/lib/products/rankmax-ai/pages";
import { listSeoUsers } from "@/lib/products/rankmax-ai/people";
import { updateTaskAction, deleteTaskAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";

export default async function TaskDetail({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { id } = await params;
  const task = await getTask(id);
  if (!task) notFound();
  const [users, issue, page] = await Promise.all([listSeoUsers(), task.issueId ? getIssue(task.issueId) : null, task.url ? getPageByPath(task.url) : null]);
  const userOpts = users.map((u) => ({ value: u.id, label: u.label }));
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.label ?? "—";
  const canWork = can(viewer, "MANAGE_TASKS") && canWorkOnTask(viewer, task);

  return (
    <div className="space-y-4">
      <PageHeader
        title={`${task.code} · ${task.title}`}
        crumbs={[{ label: "SEO Tasks", href: "/rankmax-ai/tasks" }, { label: task.code }]}
        description={<span className="flex flex-wrap items-center gap-2"><Badge className={TASK_STATUS_CLASS[task.status]}>{TASK_STATUSES[task.status]}</Badge><Badge variant="outline">{TASK_TYPES[task.type]}</Badge><Badge variant="outline">{TASK_PRIORITIES[task.priority]} priority</Badge></span>}
        actions={
          <>
            {canWork && (
              <EditDialog
                trigger={<Button size="sm" variant="outline"><Pencil className="size-3.5" data-icon="inline-start" />Edit</Button>}
                title={`Edit ${task.code}`}
                columns={2}
                fields={taskFields(viewer.isManagerTier ? userOpts : userOpts.filter((u) => u.value === viewer.userId || u.value === task.assigneeId), true)}
                initial={{ title: task.title, type: task.type, priority: task.priority, status: task.status, assigneeId: task.assigneeId ?? "", dueDate: task.dueDate ?? "", url: task.url ?? "", description: task.description }}
                onSubmit={async (v) => {
                  "use server";
                  return updateTaskAction(task._id, { ...v, issueId: task.issueId ?? "" });
                }}
              />
            )}
            {can(viewer, "DELETE") && (
              <ActionButton action={async () => { "use server"; return deleteTaskAction(task._id); }} variant="ghost" redirectTo="/rankmax-ai/tasks" success="Task deleted" confirm={{ title: `Delete ${task.code}?`, description: "This can't be undone. Cancel the task instead to keep its history." }}>Delete</ActionButton>
            )}
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard title="Description">
            {task.description ? <p className="text-sm whitespace-pre-wrap">{task.description}</p> : <p className="text-sm text-muted-foreground">No description.</p>}
          </SectionCard>
          <SectionCard title={`Updates (${task.comments.length})`}>
            {task.comments.length === 0 ? <EmptyState title="No updates yet" /> : (
              <ul className="mb-3 space-y-3">
                {task.comments.map((c) => (
                  <li key={c.id} className="rounded-xl bg-muted/50 p-3 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">{name(c.by) !== "—" ? name(c.by) : c.byEmail} · {formatDateTime(c.at)}</p>
                    <p className="whitespace-pre-wrap">{c.text}</p>
                  </li>
                ))}
              </ul>
            )}
            {canWork && <TaskComment id={task._id} />}
          </SectionCard>
        </div>
        <div className="space-y-4">
          <SectionCard title="Workflow">{canWork ? <TaskStatusButtons id={task._id} status={task.status} /> : <p className="text-xs text-muted-foreground">Only the assignee, creator or an SEO manager can update this task.</p>}</SectionCard>
          <SectionCard title="Details">
            <dl className="grid grid-cols-2 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Assignee</dt><dd>{name(task.assigneeId)}</dd>
              <dt className="text-muted-foreground">Due</dt><dd>{task.dueDate ?? "—"}</dd>
              <dt className="text-muted-foreground">Related URL</dt><dd className="truncate">{task.url ? (page ? <Link href={`/rankmax-ai/pages/${page._id}`} className="text-primary hover:underline">{task.url}</Link> : task.url) : "—"}</dd>
              <dt className="text-muted-foreground">Created</dt><dd>{formatDateTime(task.createdAt)}</dd>
              <dt className="text-muted-foreground">Created by</dt><dd>{name(task.createdBy)}</dd>
              <dt className="text-muted-foreground">Completed</dt><dd>{task.completedAt ? formatDateTime(task.completedAt) : "—"}</dd>
            </dl>
          </SectionCard>
          {issue && (
            <SectionCard title="Related issue">
              <Link href={`/rankmax-ai/issues/${issue._id}`} className="block space-y-1 hover:text-primary">
                <span className="flex items-center gap-2"><SeverityBadge severity={issue.severity} /><IssueStatusBadge status={issue.status} /></span>
                <span className="block text-sm font-medium">{issue.title}</span>
              </Link>
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
