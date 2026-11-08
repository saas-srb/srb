import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchAllTasks } from "@/lib/products/commandos/pms-work-items";
import { exportProjects } from "@/lib/products/sprintos/projects";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { isValidTaskStatus, isValidPriority } from "@/lib/products/sprintos/constants";
import TasksFilterBar from "./TasksFilterBar";
import TasksGrid, { type AdminTaskRow } from "./TasksGrid";

export default async function AdminTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; priority?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.pms.tasks");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidTaskStatus(sp.status) ? sp.status : undefined;
  const priority = sp.priority && isValidPriority(sp.priority) ? sp.priority : undefined;
  const sortBy = sp.sortBy === "dueDate" || sp.sortBy === "title" || sp.sortBy === "priority" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchAllTasks({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    priority,
    sortBy,
    sortDir,
  });

  const [projects, employees] = await Promise.all([
    exportProjects({ ids: Array.from(new Set(items.map((t) => t.projectId))) }),
    listEmployeeOptions(),
  ]);
  const projectName = new Map(projects.map((p) => [p._id, p.name]));
  const empName = new Map(employees.map((e) => [e._id, e.name]));

  const rows: AdminTaskRow[] = items.map((t) => ({
    _id: t._id,
    taskCode: t.taskCode,
    title: t.title,
    projectId: t.projectId,
    projectName: projectName.get(t.projectId) ?? "Unknown",
    status: t.status,
    priority: t.priority,
    assigneeName: t.assigneeId ? (empName.get(t.assigneeId) ?? null) : null,
    dueDate: t.dueDate,
    createdAt: new Date(t.createdAt).toISOString(),
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status || sp.priority);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "SprintOS", panel: "pms" }, { label: "Tasks" }]}
        title={<>Tasks</>}
        description={<>{total} task{total === 1 ? "" : "s"} across every project.</>}
      />

      <TasksGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<TasksFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} initialPriority={priority ?? ""} />}
      />
    </div>
  );
}
