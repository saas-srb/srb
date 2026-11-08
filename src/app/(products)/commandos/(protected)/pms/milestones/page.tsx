import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchAllMilestones } from "@/lib/products/commandos/pms-work-items";
import { exportProjects } from "@/lib/products/sprintos/projects";
import { isValidMilestoneStatus } from "@/lib/products/sprintos/constants";
import MilestonesFilterBar from "./MilestonesFilterBar";
import MilestonesGrid, { type AdminMilestoneRow } from "./MilestonesGrid";

export default async function AdminMilestonesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.pms.milestones");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidMilestoneStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "dueDate" || sp.sortBy === "name" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchAllMilestones({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    sortBy,
    sortDir,
  });

  const projects = await exportProjects({ ids: Array.from(new Set(items.map((m) => m.projectId))) });
  const projectName = new Map(projects.map((p) => [p._id, p.name]));

  const rows: AdminMilestoneRow[] = items.map((m) => ({
    _id: m._id,
    name: m.name,
    projectId: m.projectId,
    projectName: projectName.get(m.projectId) ?? "Unknown",
    status: m.status,
    manualProgressPercent: m.manualProgressPercent,
    dueDate: m.dueDate,
    createdAt: new Date(m.createdAt).toISOString(),
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "SprintOS", panel: "pms" }, { label: "Milestones" }]}
        title={<>Milestones</>}
        description={<>{total} milestone{total === 1 ? "" : "s"} across every project.</>}
      />

      <MilestonesGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<MilestonesFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} />}
      />
    </div>
  );
}
