import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { authorizeWorkspaceApi } from "@/lib/products/commandos/access";
import { exportStudents } from "@/lib/products/cohort-ai/students";
import { isValidStudentStatus } from "@/lib/products/cohort-ai/constants";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const auth = await authorizeWorkspaceApi("manage.tms.students");
  if (!auth.ok) return auth.response;

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search") ?? undefined;
  const status = sp.get("status");
  const idsParam = sp.get("ids");
  const ids = idsParam ? idsParam.split(",").filter(Boolean) : undefined;

  const rows = await exportStudents({
    search,
    status: status && isValidStudentStatus(status) ? status : undefined,
    ids,
  });

  const csv = toCsv(rows, [
    { header: "Student Code", value: (r) => r.studentCode },
    { header: "Name", value: (r) => r.fullName },
    { header: "Email", value: (r) => r.email ?? "" },
    { header: "Mobile", value: (r) => r.mobile ?? "" },
    { header: "Status", value: (r) => r.status },
    { header: "College", value: (r) => r.education.college ?? "" },
    { header: "University", value: (r) => r.education.university ?? "" },
    { header: "Branch", value: (r) => r.education.branch ?? "" },
    { header: "Guardian Name", value: (r) => r.guardian.name ?? "" },
    { header: "Guardian Phone", value: (r) => r.guardian.phone ?? "" },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `admin-tms-students-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
