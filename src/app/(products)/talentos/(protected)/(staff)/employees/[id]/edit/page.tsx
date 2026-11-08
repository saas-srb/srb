import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import EmployeeForm from "@/components/products/talentos/EmployeeForm";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageEmployees } from "@/lib/hrms-roles";
import { listDepartments, listDesignations, listTeams } from "@/lib/products/talentos/departments";
import { getEmployee, listEmployeeOptions, serializeEmployee, employeeFullName } from "@/lib/products/talentos/employees";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentHrmsUser();
  if (!user || !canManageEmployees(user)) redirect("/talentos/employees");

  const { id } = await params;
  const employee = await getEmployee(id);
  if (!employee) notFound();

  const [departments, designations, teams, managers] = await Promise.all([
    listDepartments(),
    listDesignations(),
    listTeams(),
    listEmployeeOptions(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "TalentOS", href: "/talentos" },
          { label: "Employees", href: "/talentos/employees" },
          { label: employeeFullName(employee), href: `/talentos/employees/${id}` },
          { label: "Edit" },
        ]}
        title={<>Edit {employeeFullName(employee)}</>}
        description={<>{employee.employeeCode}</>}
      />

      <EmployeeForm
        mode="edit"
        employee={serializeEmployee(employee)}
        departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
        designations={designations.map((d) => ({ _id: d._id, title: d.title, departmentId: d.departmentId }))}
        teams={teams.map((t) => ({ _id: t._id, name: t.name, departmentId: t.departmentId }))}
        managers={managers}
      />
    </div>
  );
}
