import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import TemplateEditor from "@/components/products/playbook-ai/TemplateEditor";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { getTemplate } from "@/lib/products/playbook-ai/templates";
import { getTaxonomy } from "@/lib/products/playbook-ai/taxonomy";
import { sopCan } from "@/lib/sop-roles";

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  const canManage = sopCan(ctx, "MANAGE_TEMPLATES");
  if (!canManage && !sopCan(ctx, "CREATE")) redirect("/playbook-ai");
  const { id } = await params;
  const [template, tax] = await Promise.all([getTemplate(id), getTaxonomy()]);
  if (!template || (!template.active && !canManage)) notFound();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Templates", href: "/playbook-ai/templates" }, { label: template.name }]}
        title={<>{template.name}</>}
      />
      <GlassCard interactive={false}>
        <CardContent className="p-5">
          <TemplateEditor
            templateId={template._id}
            canEdit={canManage}
            departmentOptions={tax.departments.map((d) => ({ id: d.code, label: d.name, sub: d.code }))}
            initial={{ name: template.name, description: template.description, departmentCodes: template.departmentCodes, sections: template.sections, active: template.active, isSystem: template.isSystem }}
          />
        </CardContent>
      </GlassCard>
    </div>
  );
}
