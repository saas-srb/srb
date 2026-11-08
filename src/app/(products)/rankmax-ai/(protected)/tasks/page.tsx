import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import FmsDataTable from "@/components/products/cashflow-ai/FmsDataTable";
import EditDialog from "@/components/products/playbook-ai/EditDialog";
import { PageHeader, Stat } from "@/components/products/rankmax-ai/SeoUi";
import { taskFields, TASK_STATUS_CLASS } from "@/components/products/rankmax-ai/task-fields";
import { getViewer, can } from "@/lib/products/rankmax-ai/viewer";
import { listTasks, taskStats, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from "@/lib/products/rankmax-ai/tasks";
import { listSeoUsers } from "@/lib/products/rankmax-ai/people";
import { todayIso } from "@/lib/products/rankmax-ai/db";
import { createTaskAction } from "@/app/(products)/rankmax-ai/(protected)/actions";
import { formatDateTime } from "@/lib/utils";


export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const sp = await searchParams;
  const status = sp.status ?? "open";
  const [list, stats, users] = await Promise.all([listTasks({ ...sp, status, page: Math.max(Number(sp.page) || 1, 1), pageSize: 40 }, viewer), taskStats(viewer.userId), listSeoUsers()]);
  const userOpts = users.map((u) => ({ value: u.id, label: u.label }));
  const uById = new Map(userOpts.map((u) => [u.value, u.label]));
  const today = todayIso();

  return (
    <div className="space-y-4">
      <PageHeader
        title="SEO Tasks"
        crumbs={[{ label: "SEO Tasks" }]}
        description={viewer.isManagerTier ? "The SEO team's work queue. Managers can assign and update every task." : "Your SEO work queue. You can update tasks assigned to or created by you."}
        actions={
          can(viewer, "MANAGE_TASKS") && (
            <EditDialog
              trigger={<Button size="sm"><Plus className="size-3.5" data-icon="inline-start" />New task</Button>}
              title="New SEO task"
              columns={2}
              fields={taskFields(viewer.isManagerTier ? userOpts : userOpts.filter((u) => u.value === viewer.userId), false)}
              initial={{ title: "", type: "optimize_page", priority: "medium", assigneeId: viewer.isManagerTier ? "" : viewer.userId, dueDate: "", url: "", description: "" }}
              onSubmit={async (v) => {
                "use server";
                return createTaskAction(v);
              }}
            />
          )
        }
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Link href="/rankmax-ai/tasks?status=open"><Stat label="Open" value={stats.open} /></Link>
        <Link href="/rankmax-ai/tasks?status=open&assignee=me"><Stat label="Assigned to me" value={stats.mine} /></Link>
        <Link href="/rankmax-ai/tasks?due=overdue"><Stat label="Overdue" value={stats.overdue} /></Link>
        <Link href="/rankmax-ai/tasks?status=done"><Stat label="Done (30 days)" value={stats.doneLast30} /></Link>
      </div>
      <FmsDataTable
        columns={[
          { key: "code", header: "Task", sortable: true },
          { key: "title", header: "Title", sortable: true },
          { key: "type", header: "Type" },
          { key: "priority", header: "Priority", sortable: true },
          { key: "status", header: "Status", sortable: true },
          { key: "assignee", header: "Assignee" },
          { key: "due", header: "Due", sortable: true },
          { key: "url", header: "URL" },
          { key: "updated", header: "Updated", sortable: true },
        ]}
        rows={list.items.map((t) => ({
          id: t._id,
          href: `/rankmax-ai/tasks/${t._id}`,
          cells: {
            code: t.code,
            title: <span className="block max-w-[280px] truncate">{t.title}</span>,
            type: <span className="text-xs">{TASK_TYPES[t.type]}</span>,
            priority: <Badge className={t.priority === "urgent" ? "bg-rose-500/15 text-rose-600" : t.priority === "high" ? "bg-orange-500/15 text-orange-600" : "bg-muted text-muted-foreground"}>{TASK_PRIORITIES[t.priority]}</Badge>,
            status: <Badge className={TASK_STATUS_CLASS[t.status]}>{TASK_STATUSES[t.status]}</Badge>,
            assignee: <span className="text-xs">{t.assigneeId ? uById.get(t.assigneeId) ?? "—" : "—"}</span>,
            due: t.dueDate ? <span className={t.dueDate < today && ["todo", "in_progress", "in_review"].includes(t.status) ? "text-xs font-semibold text-rose-600" : "text-xs"}>{t.dueDate}</span> : "—",
            url: <span className="block max-w-[160px] truncate text-xs">{t.url ?? "—"}</span>,
            updated: <span className="text-xs text-muted-foreground">{formatDateTime(t.updatedAt)}</span>,
          },
        }))}
        filters={[
          { key: "status", label: "Status", value: status, options: [{ value: "open", label: "Open (all active)" }, ...Object.entries(TASK_STATUSES).map(([value, label]) => ({ value, label }))] },
          { key: "assignee", label: "Assignee", value: sp.assignee ?? "", options: [{ value: "me", label: "Me" }, { value: "unassigned", label: "Unassigned" }, ...userOpts] },
          { key: "type", label: "Type", value: sp.type ?? "", options: Object.entries(TASK_TYPES).map(([value, label]) => ({ value, label })) },
          { key: "priority", label: "Priority", value: sp.priority ?? "", options: Object.entries(TASK_PRIORITIES).map(([value, label]) => ({ value, label })) },
          { key: "due", label: "Due", value: sp.due ?? "", options: [{ value: "overdue", label: "Overdue" }] },
        ]}
        search={sp.search ?? ""}
        searchPlaceholder="Title, code or URL"
        sortBy={sp.sortBy}
        sortDir={sp.sortDir}
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        exportBase={can(viewer, "EXPORT_REPORTS") ? "/api/rankmax-ai/export/tasks" : undefined}
      />
    </div>
  );
}
