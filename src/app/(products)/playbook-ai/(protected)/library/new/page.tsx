import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import NewSopForm from "@/components/products/playbook-ai/NewSopForm";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { creatableDepartmentIds } from "@/lib/products/playbook-ai/access";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { listTemplates } from "@/lib/products/playbook-ai/templates";

export default async function NewSopPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const allowed = creatableDepartmentIds(viewer);
  if (allowed !== null && allowed.length === 0) redirect("/playbook-ai/library");

  const [tax, templates] = await Promise.all([getTaxonomy(), listTemplates()]);
  const departments = tax.departments.filter((d) => d.active && (allowed === null || allowed.includes(d._id)));
  const home = viewer.memberDepartmentIds.find((d) => departments.some((x) => x._id === d)) ?? departments[0]?._id ?? "";

  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "SOP Library", href: "/playbook-ai/library" }, { label: "New SOP" }]}
        title={<>New SOP</>}
        description={<>Pick a department and template. You&apos;ll write it as a draft, then publish it directly — no approval step.</>}
      />
<div className="space-y-4">
      <GlassCard interactive={false}>
        <CardContent className="p-5">
          <NewSopForm
            defaultDepartmentId={home}
            departments={departments.map((d) => ({ id: d._id, name: d.name, code: d.code }))}
            templates={templates.map((t) => ({ id: t._id, name: t.name, description: t.description, departmentCodes: t.departmentCodes, sectionCount: t.sections.length }))}
            functions={tax.functions.filter((f) => f.active).map((f) => ({ id: f._id, departmentId: f.departmentId, name: f.name }))}
            processes={tax.processes.filter((p) => p.active).map((p) => ({ id: p._id, functionId: p.functionId, parentId: p.parentId, name: p.name }))}
            categories={tax.categories.filter((c) => c.active).map((c) => ({ id: c._id, name: c.name }))}
          />
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
