import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import Link from "next/link";
import OrgTree from "@/components/products/talentos/OrgTree";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { listDepartmentsWithCounts, listDesignations } from "@/lib/products/talentos/departments";
import { buildOrgTree } from "@/lib/products/talentos/hierarchy";

export default async function DepartmentsPage() {
  const user = await getCurrentHrmsUser();
  void user;

  const [departments, designations, orgRoots] = await Promise.all([
    listDepartmentsWithCounts(),
    listDesignations(),
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
<GlassCard interactive={false}>
        <CardHeader>
          <CardTitle>Departments, teams and designations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            These are managed once for every product in CommandOS.{" "}
            <Link className="font-medium text-primary underline" href="/commandos/settings/organization/departments">
              Open Organization settings
            </Link>
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Department</th>
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Employees</th>
                  <th className="py-2 pr-4 font-medium">Teams</th>
                  <th className="py-2 font-medium">Designations</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d._id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{d.name}</td>
                    <td className="py-2 pr-4">{d.code}</td>
                    <td className="py-2 pr-4">{d.employeeCount}</td>
                    <td className="py-2 pr-4">{d.teamCount}</td>
                    <td className="py-2">{d.designationCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </GlassCard>

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
