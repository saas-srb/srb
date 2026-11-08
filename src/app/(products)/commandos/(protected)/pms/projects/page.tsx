import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchProjects } from "@/lib/products/sprintos/projects";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { isValidProjectStatus, isValidPriority } from "@/lib/products/sprintos/constants";
import ProjectsFilterBar from "./ProjectsFilterBar";
import ProjectsGrid, { type AdminProjectRow } from "./ProjectsGrid";

export default async function AdminProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    priority?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.pms.projects");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidProjectStatus(sp.status) ? sp.status : undefined;
  const priority = sp.priority && isValidPriority(sp.priority) ? sp.priority : undefined;
  const sortBy =
    sp.sortBy === "name" || sp.sortBy === "priority" || sp.sortBy === "progressPercent" || sp.sortBy === "endDate"
      ? sp.sortBy
      : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const [{ items, total, totalPages }, clients, employees] = await Promise.all([
    searchProjects({ page, pageSize: 20, search: sp.search, status, priority, sortBy, sortDir }),
    listClientOptions(),
    listEmployeeOptions(),
  ]);

  const clientName = new Map(clients.map((c) => [c._id, c.companyName]));
  const empName = new Map(employees.map((e) => [e._id, e.name]));

  const rows: AdminProjectRow[] = items.map((p) => ({
    _id: p._id,
    projectCode: p.projectCode,
    name: p.name,
    clientName: clientName.get(p.clientId) ?? "Unknown",
    status: p.status,
    priority: p.priority,
    progressPercent: p.progressPercent,
    managerName: p.projectManagerId ? (empName.get(p.projectManagerId) ?? null) : null,
    endDate: p.endDate,
    createdAt: new Date(p.createdAt).toISOString(),
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status || sp.priority);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "SprintOS", panel: "pms" }, { label: "Projects" }]}
        title={<>Projects</>}
        description={<>{total} project{total === 1 ? "" : "s"}. Status changes are guarded — illegal transitions (e.g. planning
          → completed) are refused with the real reason.</>}
      />

      <ProjectsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <ProjectsFilterBar
            initialSearch={sp.search ?? ""}
            initialStatus={status ?? ""}
            initialPriority={priority ?? ""}
          />
        }
      />
    </div>
  );
}
