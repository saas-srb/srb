import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, LayoutTemplate } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { listTemplates } from "@/lib/products/contractflow-ai/templates";
import { listMakerTypes } from "@/lib/products/contractflow-ai/makers";

export default async function TemplatesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_TEMPLATES")) redirect("/contractflow-ai");

  const [templates, makerTypes] = await Promise.all([
    listTemplates({}, viewer),
    listMakerTypes(viewer),
  ]);

  const makerMap = Object.fromEntries(makerTypes.map((m: any) => [m.id, m]));

  // Group templates by maker type
  const grouped = templates.reduce((acc: Record<string, any[]>, t: any) => {
    const key = t.makerTypeId?.toString() ?? "uncategorized";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Templates" }]}
        title={<>Templates</>}
        description={<>{templates.length} template{templates.length !== 1 ? "s" : ""} across{" "}
            {Object.keys(grouped).length} maker type{Object.keys(grouped).length !== 1 ? "s" : ""}</>}
        actions={<><Link href="/contractflow-ai/templates/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="size-3.5" />
          New Template
        </Link></>}
      />

      <PanelListFilters>
{templates.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <LayoutTemplate className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No templates yet. Create one to get started.</p>
          </CardContent>
        </GlassCard>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([makerTypeId, group]) => {
            const maker = makerMap[makerTypeId];
            return (
              <div key={makerTypeId}>
                <h2 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  {maker?.name ?? "Uncategorized"}
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {group.map((template: any) => (
                    <Link key={template.id} href={`/contractflow-ai/templates/${template.id}`}>
                      <GlassCard interactive>
                        <CardContent className="flex items-start gap-3 py-4">
                          <LayoutTemplate className="mt-0.5 size-5 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground">{template.name ?? template.title}</p>
                            <p className="text-xs text-muted-foreground">v{template.version ?? 1}</p>
                            {template.isDefault && (
                              <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                Default
                              </span>
                            )}
                          </div>
                        </CardContent>
                      </GlassCard>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
