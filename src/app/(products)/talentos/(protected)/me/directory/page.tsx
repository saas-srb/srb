import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardContent } from "@/components/ui/card";
import Tabs from "@/components/products/talentos/Tabs";
import OrgTree from "@/components/products/talentos/OrgTree";
import { searchEmployees, employeeFullName } from "@/lib/products/talentos/employees";
import { masterLookups } from "@/lib/products/talentos/departments";
import { buildOrgTree } from "@/lib/products/talentos/hierarchy";
import { ACTIVE_EMPLOYEE_STATUSES } from "@/lib/products/talentos/employee-status";
import { getCompanyBrand } from "@/lib/platform/branding";

export default async function DirectoryPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const brand = await getCompanyBrand();
  const sp = await searchParams;
  const tab = sp.tab === "org" ? "org" : "people";

  const [{ items }, lookups, orgRoots] = await Promise.all([
    searchEmployees({ pageSize: 100, sortBy: "firstName", sortDir: "asc" }),
    masterLookups(),
    buildOrgTree(),
  ]);

  const people = items
    .filter((e) => ACTIVE_EMPLOYEE_STATUSES.includes(e.status))
    .map((e) => ({
      id: e._id,
      name: employeeFullName(e),
      code: e.employeeCode,
      designation: lookups.designationTitle(e.professional?.designationId),
      department: lookups.departmentName(e.professional?.departmentId),
      email: e.workEmail,
    }));

  return (
    <div className="space-y-5">
      <PanelPageHeader
        breadcrumbs={[{ label: "TalentOS", href: "/talentos/me" }, { label: "Directory" }]}
        title={<>Company Directory</>}
        description={<>Everyone at {brand.name} and how the team is organised.</>}
      />

      <PanelListFilters>
<Tabs
        initial={tab}
        syncParam="tab"
        tabs={[
          {
            key: "people",
            label: `People (${people.length})`,
            content: (
              <GlassCard interactive={false}>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <th className="px-4 py-2.5 font-semibold">Name</th>
                          <th className="px-4 py-2.5 font-semibold">Code</th>
                          <th className="px-4 py-2.5 font-semibold">Designation</th>
                          <th className="px-4 py-2.5 font-semibold">Department</th>
                          <th className="px-4 py-2.5 font-semibold">Work email</th>
                        </tr>
                      </thead>
                      <tbody>
                        {people.map((p) => (
                          <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-muted/40">
                            <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                            <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{p.code}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{p.designation}</td>
                            <td className="px-4 py-2.5 text-muted-foreground">{p.department}</td>
                            <td className="px-4 py-2.5">
                              <a href={`mailto:${p.email}`} className="text-primary hover:underline">{p.email}</a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </GlassCard>
            ),
          },
          {
            key: "org",
            label: "Org Chart",
            content: (
              <GlassCard interactive={false}>
                <CardContent className="py-4">
                  <OrgTree
                    roots={orgRoots}
                    designations={lookups.designations.map((d) => ({ _id: d._id, title: d.title }))}
                    linkEmployees={false}
                  />
                </CardContent>
              </GlassCard>
            ),
          },
        ]}
      />
</PanelListFilters>
    </div>
  );
}
