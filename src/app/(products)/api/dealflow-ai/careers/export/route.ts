import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { exportApplications } from "@/lib/career-applications";
import { isValidCareerApplicationStatus } from "@/lib/career-application-status";
import { toCsv } from "@/lib/csv";

function parseDateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}${endOfDay ? "T23:59:59.999" : "T00:00:00"}`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function handleGET(req: NextRequest) {
  const lmsUser = await requireLms("EXPORT_DATA");
  if (!lmsUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search") ?? undefined;
  const status = sp.get("status");
  const positionSlug = sp.get("position") ?? undefined;
  const dateFrom = parseDateParam(sp.get("dateFrom"));
  const dateTo = parseDateParam(sp.get("dateTo"), true);
  const sortBy = sp.get("sortBy") === "name" ? "name" : "createdAt";
  const sortDir = sp.get("sortDir") === "asc" ? "asc" : "desc";
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportApplications({
    search,
    status: status && isValidCareerApplicationStatus(status) ? status : undefined,
    positionSlug,
    dateFrom,
    dateTo,
    sortBy,
    sortDir,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Name", value: (r) => r.name },
    { header: "Email", value: (r) => r.email },
    { header: "Phone", value: (r) => r.phone },
    { header: "Position", value: (r) => r.positionTitle },
    { header: "Status", value: (r) => r.status },
    { header: "Cover Note", value: (r) => r.coverNote ?? "" },
    { header: "Notes", value: (r) => r.notes ?? "" },
    { header: "Resume", value: (r) => r.resume?.filename ?? "" },
    { header: "Source", value: (r) => r.source ?? "" },
    { header: "Submitted At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `career-applications-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
