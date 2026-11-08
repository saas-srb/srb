import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LayoutTemplate } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { DeleteTemplateButton, DuplicateTemplateButton, NewTemplateButton } from "@/components/products/playbook-ai/TemplateActions";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { listTemplates } from "@/lib/products/playbook-ai/templates";
import { ensureSopSeeded } from "@/lib/products/playbook-ai/taxonomy";
import { sopCan } from "@/lib/sop-roles";

export default async function TemplatesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  const canManage = sopCan(ctx, "MANAGE_TEMPLATES");
  if (!canManage && !sopCan(ctx, "CREATE")) redirect("/playbook-ai");
  await ensureSopSeeded();
  const templates = await listTemplates({ includeInactive: canManage });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SOP", href: "/playbook-ai" }, { label: "Templates" }]}
        title={<>Templates</>}
        description={<>Reusable section layouts for new SOPs. {canManage ? "You can customise any template or create your own." : "Pick one when you create an SOP."}</>}
        actions={<>{canManage && <NewTemplateButton />}</>}
      />
      <PanelListFilters>
<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((t) => (
          <div key={t._id} className="lms-surface flex flex-col gap-2 rounded-2xl border border-border/40 bg-background/95 p-4 dark:bg-card/85">
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><LayoutTemplate className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-semibold">
                  <Link href={`/playbook-ai/templates/${t._id}`} className="hover:text-primary hover:underline">{t.name}</Link>
                  {t.isSystem && <Badge className="bg-muted text-muted-foreground">System</Badge>}
                  {!t.active && <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400">Inactive</Badge>}
                </p>
                <p className="line-clamp-2 text-xs text-muted-foreground">{t.description || "—"}</p>
              </div>
              {canManage && (
                <span className="flex shrink-0 items-center gap-0.5">
                  <DuplicateTemplateButton id={t._id} />
                  {!t.isSystem && <DeleteTemplateButton id={t._id} name={t.name} />}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t.sections.length} sections{t.departmentCodes.length ? ` · for ${t.departmentCodes.join(", ")}` : " · general purpose"}</p>
            <ul className="flex flex-wrap gap-1">
              {t.sections.slice(0, 6).map((s) => (
                <li key={s.key} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.title}</li>
              ))}
              {t.sections.length > 6 && <li className="px-1 py-0.5 text-[10px] text-muted-foreground">+{t.sections.length - 6} more</li>}
            </ul>
          </div>
        ))}
      </div>
</PanelListFilters>
    </div>
  );
}
