import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchPrograms } from "@/lib/products/cohort-ai/programs";
import { isValidProgramStatus, isValidProgramCategory } from "@/lib/products/cohort-ai/constants";
import ProgramsFilterBar from "./ProgramsFilterBar";
import ProgramsGrid, { type AdminProgramRow } from "./ProgramsGrid";

export default async function AdminProgramsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string; status?: string; category?: string; sortBy?: string; sortDir?: string }>;
}) {
  await requireWorkspaceAccess("manage.tms.programs");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidProgramStatus(sp.status) ? sp.status : undefined;
  const category = sp.category && isValidProgramCategory(sp.category) ? sp.category : undefined;
  const sortBy = sp.sortBy === "fees" || sp.sortBy === "name" ? sp.sortBy : "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchPrograms({
    page,
    pageSize: 20,
    search: sp.search,
    status,
    category,
    sortBy,
    sortDir,
  });

  const rows: AdminProgramRow[] = items.map((p) => ({
    _id: p._id,
    programCode: p.programCode,
    name: p.name,
    category: p.category,
    mode: p.mode,
    status: p.status,
    durationWeeks: p.durationWeeks,
    fees: p.fees,
  }));

  const hasActiveFilters = Boolean(sp.search || sp.status || sp.category);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "Cohort AI", panel: "tms" }, { label: "Programs" }]}
        title={<>Programs</>}
        description={<>{total} program{total === 1 ? "" : "s"}.</>}
      />

      <ProgramsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={<ProgramsFilterBar initialSearch={sp.search ?? ""} initialStatus={status ?? ""} initialCategory={category ?? ""} />}
      />
    </div>
  );
}
