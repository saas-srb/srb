import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { UserPlus, Download } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { buttonVariants } from "@/components/ui/button";
import EmployeesDataTable from "@/components/products/talentos/EmployeesDataTable";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees, canViewAllEmployees } from "@/lib/hrms-roles";
import { searchEmployees, serializeEmployee } from "@/lib/products/talentos/employees";
import { listDepartments, listDesignations } from "@/lib/products/talentos/departments";
import { isValidEmployeeStatus, isValidEmploymentType, type EmployeeStatus, type EmploymentType } from "@/lib/products/talentos/employee-status";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    search?: string;
    status?: string;
    department?: string;
    type?: string;
    sortBy?: string;
    sortDir?: string;
  }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentHrmsUser();
  const page = Math.max(Number(sp.page) || 1, 1);
  const status = sp.status && isValidEmployeeStatus(sp.status) ? (sp.status as EmployeeStatus) : undefined;
  const employmentType = sp.type && isValidEmploymentType(sp.type) ? (sp.type as EmploymentType) : undefined;
  const sortBy = (["firstName", "employeeCode", "joiningDate", "createdAt"].includes(sp.sortBy ?? "") ? sp.sortBy : "createdAt") as
    | "firstName"
    | "employeeCode"
    | "joiningDate"
    | "createdAt";
  const sortDir = sp.sortDir === "asc" ? "asc" : "desc";

  const restrictToManagerId =
    user && !canViewAllEmployees(user) ? user.employeeId ?? "__no_such_employee__" : undefined;

  const [{ items, total, totalPages }, departments, designations] = await Promise.all([
    searchEmployees({
      page,
      pageSize: 20,
      search: sp.search,
      status,
      departmentId: sp.department,
      employmentType,
      sortBy,
      sortDir,
      restrictToManagerId,
    }),
    listDepartments(),
    listDesignations(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Employees" }]}
        title={<>Employees</>}
        description={<>{total} employee{total === 1 ? "" : "s"}
            {restrictToManagerId ? " in your reporting line" : ""}</>}
        actions={<><div className="flex items-center gap-2">
          <a href="/api/talentos/employees/export" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            Export CSV
          </a>
          {user && canManageEmployees(user) && (
            <Link href="/talentos/employees/new" className={buttonVariants({ size: "sm" })}>
              <UserPlus className="size-3.5" data-icon="inline-start" />
              Add Employee
            </Link>
          )}
        </div></>}
      />

      <EmployeesDataTable
        items={items.map(serializeEmployee)}
        total={total}
        page={page}
        totalPages={totalPages}
        departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
        designations={designations.map((d) => ({ _id: d._id, title: d.title }))}
        initial={{
          search: sp.search ?? "",
          status: status ?? "",
          department: sp.department ?? "",
          type: employmentType ?? "",
          sortBy,
          sortDir,
        }}
      />
    </div>
  );
}
