import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import DepartmentsManager from "@/components/products/talentos/DepartmentsManager";
import OrgTree from "@/components/products/talentos/OrgTree";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageMasters } from "@/lib/hrms-roles";
import { listDepartmentsWithCounts, listDesignations, listTeams } from "@/lib/products/talentos/departments";
import { listEmployeeOptions } from "@/lib/products/talentos/employees";
import { buildOrgTree } from "@/lib/products/talentos/hierarchy";

export default async function DepartmentsPage() {
  const user = await getCurrentHrmsUser();
  const canManage = !!user && canManageMasters(user);

  const [departments, designations, teams, employees, orgRoots] = await Promise.all([
    listDepartmentsWithCounts(),
    listDesignations(),
    listTeams(),
    listEmployeeOptions(),
    buildOrgTree(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos" }, { label: "Departments & Teams" }]}
        title={<>Departments &amp; Teams</>}
        description={<>Master data and the reporting hierarchy.</>}
      />

      <PanelListFilters>
<DepartmentsManager
        departments={departments.map((d) => ({
          _id: d._id,
          name: d.name,
          code: d.code,
          description: d.description,
          headEmployeeId: d.headEmployeeId,
          employeeCount: d.employeeCount,
          designationCount: d.designationCount,
          teamCount: d.teamCount,
        }))}
        designations={designations.map((d) => ({ _id: d._id, title: d.title, departmentId: d.departmentId, level: d.level }))}
        teams={teams.map((t) => ({ _id: t._id, name: t.name, departmentId: t.departmentId, leadEmployeeId: t.leadEmployeeId }))}
        employees={employees}
        canManage={canManage}
      />

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>Reporting Hierarchy</CardTitle>
        </CardHeader>
        <CardContent>
          <OrgTree roots={orgRoots} designations={designations.map((d) => ({ _id: d._id, title: d.title }))} />
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
