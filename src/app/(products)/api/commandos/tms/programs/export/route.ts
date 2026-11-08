import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportPrograms } from "@/lib/products/cohort-ai/programs";
import { isValidProgramStatus, getProgramStatusMeta } from "@/lib/products/cohort-ai/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.tms.programs");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportPrograms({
    search: sp.get("search") ?? undefined,
    status: status && isValidProgramStatus(status) ? status : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Program Code", value: (r) => r.programCode },
    { header: "Name", value: (r) => r.name },
    { header: "Category", value: (r) => r.category },
    { header: "Mode", value: (r) => r.mode },
    { header: "Status", value: (r) => getProgramStatusMeta(r.status).label },
    { header: "Duration (weeks)", value: (r) => r.durationWeeks ?? "" },
    { header: "Fees", value: (r) => r.fees ?? "" },
    { header: "Currency", value: (r) => r.currency },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-tms-programs-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
