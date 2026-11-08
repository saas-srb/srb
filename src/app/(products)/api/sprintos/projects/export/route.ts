import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedPmsRequest } from "@/lib/products/sprintos/api-auth";
import { exportProjects } from "@/lib/products/sprintos/projects";
import { listClientOptions } from "@/lib/products/sprintos/clients";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import {
  getProjectStatusMeta,
  getPriorityMeta,
  computeProjectHealth,
  PROJECT_HEALTH_META,
  isValidProjectStatus,
  isValidPriority,
  type ProjectStatus,
  type Priority,
} from "@/lib/products/sprintos/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  if (!(await isAuthorizedPmsRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const priority = sp.get("priority");
  const idsParam = sp.get("ids");

  const [rows, clients, employees] = await Promise.all([
    exportProjects({
      search: sp.get("search") ?? undefined,
      status: status && isValidProjectStatus(status) ? (status as ProjectStatus) : undefined,
      priority: priority && isValidPriority(priority) ? (priority as Priority) : undefined,
      clientId: sp.get("clientId") ?? undefined,
      projectManagerId: sp.get("manager") ?? undefined,
      category: sp.get("category") ?? undefined,
      ids: idsParam ? idsParam.split(",").filter(Boolean) : undefined,
    }),
    listClientOptions(),
    listEmployeeOptions(),
  ]);

  const clientName = new Map(clients.map((c) => [c._id, c.companyName]));
  const empName = new Map(employees.map((e) => [e._id, e.name]));
  const now = new Date();

  const csv = toCsv(rows, [
    { header: "Project Code", value: (r) => r.projectCode },
    { header: "Name", value: (r) => r.name },
    { header: "Client", value: (r) => clientName.get(r.clientId) ?? "" },
    { header: "Category", value: (r) => r.category ?? "" },
    { header: "Status", value: (r) => getProjectStatusMeta(r.status).label },
    { header: "Priority", value: (r) => getPriorityMeta(r.priority).label },
    { header: "Health", value: (r) => PROJECT_HEALTH_META[computeProjectHealth(r, now)].label },
    { header: "Progress %", value: (r) => String(r.progressPercent) },
    { header: "Project Manager", value: (r) => (r.projectManagerId ? empName.get(r.projectManagerId) ?? "" : "") },
    { header: "Start Date", value: (r) => r.startDate ?? "" },
    { header: "End Date", value: (r) => r.endDate ?? "" },
    { header: "Estimated Budget", value: (r) => (r.estimatedBudget != null ? String(r.estimatedBudget) : "") },
    { header: "Currency", value: (r) => r.currency },
    { header: "Technologies", value: (r) => r.technologies.join("; ") },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `pms-projects-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
