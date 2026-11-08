import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import DepartmentsManager, { type DeptNode } from "@/components/products/playbook-ai/DepartmentsManager";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { listVisibleSummaries } from "@/lib/products/playbook-ai/sops";
import { listHrmsDepartments } from "@/lib/products/playbook-ai/people";
import { sopCan } from "@/lib/sop-roles";

export default async function DepartmentsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const [tax, summaries, hrms] = await Promise.all([getTaxonomy(), listVisibleSummaries(viewer), listHrmsDepartments()]);
  const canManage = sopCan({ roles: viewer.roles, permissionOverrides: viewer.overrides }, "MANAGE_TEMPLATES");
  const hrmsName = new Map(hrms.map((h) => [h._id, h.name]));

  // Counts reflect only what this viewer can see.
  const nodes: DeptNode[] = tax.departments.map((d) => {
    const mine = summaries.filter((s) => s.departmentId === d._id && s.status !== "archived");
    return {
      id: d._id,
      name: d.name,
      code: d.code,
      description: d.description,
      active: d.active,
      hrmsDepartmentId: d.hrmsDepartmentId,
      hrmsName: d.hrmsDepartmentId ? hrmsName.get(d.hrmsDepartmentId) ?? null : null,
      counts: { live: mine.filter((s) => s.status === "active" || s.status === "published").length, draft: mine.filter((s) => s.status === "draft").length, total: mine.length },
      functions: tax.functions
        .filter((f) => f.departmentId === d._id)
        .map((f) => ({
          id: f._id,
          name: f.name,
          description: f.description,
          active: f.active,
          processes: tax.processes
            .filter((p) => p.functionId === f._id && !p.parentId)
            .map((p) => ({
              id: p._id,
              name: p.name,
              active: p.active,
              subs: tax.processes.filter((s) => s.parentId === p._id).map((s) => ({ id: s._id, name: s.name, active: s.active })),
            })),
        })),
    };
  });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Departments" }]}
        title={<>Departments</>}
        description={<>{nodes.length} departments, each with its functions, processes and sub-processes. Departments come from TalentOS and can be extended here — any future department is supported.</>}
      />
      <PanelListFilters>
<DepartmentsManager nodes={nodes} canManage={canManage} hrmsOptions={hrms.map((h) => ({ value: h._id, label: h.name }))} />
</PanelListFilters>
    </div>
  );
}
