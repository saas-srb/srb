import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportAllMilestones } from "@/lib/products/commandos/pms-work-items";
import { exportProjects } from "@/lib/products/sprintos/projects";
import { isValidMilestoneStatus, getMilestoneStatusMeta, type MilestoneStatus } from "@/lib/products/sprintos/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.pms.milestones");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportAllMilestones({
    search: sp.get("search") ?? undefined,
    status: status && isValidMilestoneStatus(status) ? (status as MilestoneStatus) : undefined,
    ids,
  });

  const projects = await exportProjects({ ids: Array.from(new Set(rows.map((r) => r.projectId))) });
  const projectName = new Map(projects.map((p) => [p._id, p.name]));

  const csv = toCsv(rows, [
    { header: "Name", value: (r) => r.name },
    { header: "Project", value: (r) => projectName.get(r.projectId) ?? "" },
    { header: "Status", value: (r) => getMilestoneStatusMeta(r.status).label },
    { header: "Progress %", value: (r) => String(r.manualProgressPercent) },
    { header: "Due Date", value: (r) => r.dueDate ?? "" },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-pms-milestones-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
