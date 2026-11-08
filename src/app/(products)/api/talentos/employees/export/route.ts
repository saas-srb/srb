import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedHrmsRequest } from "@/lib/products/talentos/api-auth";
import { exportEmployees, employeeFullName } from "@/lib/products/talentos/employees";
import { masterLookups } from "@/lib/products/talentos/departments";
import { isValidEmployeeStatus, isValidEmploymentType, getEmploymentTypeLabel, getGenderLabel, getEmployeeStatusMeta } from "@/lib/products/talentos/employee-status";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  if (!(await isAuthorizedHrmsRequest(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const type = sp.get("type");
  const idsParam = sp.get("ids");

  const [rows, lookups] = await Promise.all([
    exportEmployees({
      search: sp.get("search") ?? undefined,
      status: status && isValidEmployeeStatus(status) ? status : undefined,
      departmentId: sp.get("department") ?? undefined,
      employmentType: type && isValidEmploymentType(type) ? type : undefined,
      ids: idsParam ? idsParam.split(",").filter(Boolean) : undefined,
    }),
    masterLookups(),
  ]);

  const csv = toCsv(rows, [
    { header: "Employee Code", value: (r) => r.employeeCode },
    { header: "Name", value: (r) => employeeFullName(r) },
    { header: "Work Email", value: (r) => r.workEmail },
    { header: "Status", value: (r) => getEmployeeStatusMeta(r.status).label },
    { header: "Department", value: (r) => lookups.departmentName(r.professional.departmentId) },
    { header: "Designation", value: (r) => lookups.designationTitle(r.professional.designationId) },
    { header: "Team", value: (r) => lookups.teamName(r.professional.teamId) },
    { header: "Employment Type", value: (r) => getEmploymentTypeLabel(r.professional.employmentType ?? undefined) },
    { header: "Work Location", value: (r) => r.professional.workLocation ?? "" },
    { header: "Gender", value: (r) => getGenderLabel(r.personal.gender ?? undefined) },
    { header: "Personal Email", value: (r) => r.personal.personalEmail ?? "" },
    { header: "Personal Phone", value: (r) => r.personal.phone ?? "" },
    { header: "Joining Date", value: (r) => r.professional.joiningDate ?? "" },
    { header: "Relieving Date", value: (r) => r.professional.relievingDate ?? "" },
    { header: "Created At", value: (r) => new Date(r.createdAt).toISOString() },
  ]);

  const filename = `hrms-employees-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
