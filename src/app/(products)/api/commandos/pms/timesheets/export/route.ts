import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportEntries } from "@/lib/products/sprintos/timesheets";
import { exportProjects } from "@/lib/products/sprintos/projects";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { isValidTimesheetStatus } from "@/lib/products/sprintos/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.pms.timesheets");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportEntries({
    status: status && isValidTimesheetStatus(status) ? status : undefined,
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    ids,
  });

  const [projects, employees] = await Promise.all([
    exportProjects({ ids: Array.from(new Set(rows.map((r) => r.projectId))) }),
    listEmployeeOptions(),
  ]);
  const projectName = new Map(projects.map((p) => [p._id, p.name]));
  const empName = new Map(employees.map((e) => [e._id, e.name]));

  const csv = toCsv(rows, [
    { header: "Date", value: (r) => r.date },
    { header: "Employee", value: (r) => empName.get(r.employeeId) ?? r.employeeId },
    { header: "Project", value: (r) => projectName.get(r.projectId) ?? r.projectId },
    { header: "Hours", value: (r) => String(r.hours) },
    { header: "Billable", value: (r) => (r.billable ? "Yes" : "No") },
    { header: "Status", value: (r) => r.status },
    { header: "Description", value: (r) => r.description ?? "" },
    { header: "Review Note", value: (r) => r.reviewNote ?? "" },
  ]);

  const filename = `admin-pms-timesheets-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
