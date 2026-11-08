import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { searchEntries } from "@/lib/products/sprintos/timesheets";
import { exportProjects } from "@/lib/products/sprintos/projects";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { isValidTimesheetStatus } from "@/lib/products/sprintos/constants";
import TimesheetsFilterBar from "./TimesheetsFilterBar";
import TimesheetsGrid, { type AdminTimesheetRow } from "./TimesheetsGrid";

export default async function AdminTimesheetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  await requireWorkspaceAccess("manage.pms.timesheets");
  const sp = await searchParams;
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidTimesheetStatus(sp.status) ? sp.status : undefined;
  const sortBy = sp.sortBy === "hours" ? "hours" : "date";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const { items, total, totalPages } = await searchEntries({
    page,
    pageSize: 20,
    status,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    sortBy,
    sortDir,
  });

  const [projects, employees] = await Promise.all([
    exportProjects({ ids: Array.from(new Set(items.map((e) => e.projectId))) }),
    listEmployeeOptions(),
  ]);
  const projectName = new Map(projects.map((p) => [p._id, p.name]));
  const empName = new Map(employees.map((e) => [e._id, e.name]));

  const rows: AdminTimesheetRow[] = items.map((e) => ({
    _id: e._id,
    date: e.date,
    employeeName: empName.get(e.employeeId) ?? "Unknown",
    projectName: projectName.get(e.projectId) ?? "Unknown",
    hours: e.hours,
    billable: e.billable,
    status: e.status,
    description: e.description,
  }));

  const hasActiveFilters = Boolean(sp.status || sp.dateFrom || sp.dateTo);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Workspace", href: "/commandos" }, { label: "SprintOS", panel: "pms" }, { label: "Timesheets" }]}
        title={<>Timesheets</>}
        description={<>{total} entr{total === 1 ? "y" : "ies"}. Only entries awaiting review (&quot;Submitted&quot;) can be
          approved or rejected — the same guard the SprintOS review page uses.</>}
      />

      <TimesheetsGrid
        rows={rows}
        total={total}
        page={page}
        totalPages={totalPages}
        sortBy={sortBy}
        sortDir={sortDir}
        hasActiveFilters={hasActiveFilters}
        filters={
          <TimesheetsFilterBar
            initialStatus={status ?? ""}
            initialDateFrom={sp.dateFrom ?? ""}
            initialDateTo={sp.dateTo ?? ""}
          />
        }
      />
    </div>
  );
}
