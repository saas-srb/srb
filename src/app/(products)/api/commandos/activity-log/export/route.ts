import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportActivityLog, ACTIVITY_LOG_MODULES, type ActivityLogModule } from "@/lib/products/commandos/activity-log";
import { toCsv } from "@/lib/csv";

function parseDateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("company.audit");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const moduleParam = sp.get("module");
  const moduleFilter = (ACTIVITY_LOG_MODULES as readonly string[]).includes(moduleParam ?? "")
    ? (moduleParam as ActivityLogModule)
    : undefined;

  const rows = await exportActivityLog({
    search: sp.get("search") ?? undefined,
    module: moduleFilter,
    action: sp.get("action") ?? undefined,
    dateFrom: parseDateParam(sp.get("dateFrom")),
    dateTo: parseDateParam(sp.get("dateTo"), true),
  });

  const csv = toCsv(rows, [
    { header: "Module", value: (r) => r.module },
    { header: "Actor", value: (r) => r.actorEmail },
    { header: "Action", value: (r) => r.action },
    { header: "Entity", value: (r) => r.entity },
    { header: "Entity Label", value: (r) => r.entityLabel },
    { header: "Summary", value: (r) => r.summary },
    { header: "Timestamp", value: (r) => r.createdAt },
  ]);

  const filename = `admin-activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
