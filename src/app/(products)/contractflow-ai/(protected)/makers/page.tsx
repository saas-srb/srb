import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Layers, Pencil, Archive } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { listMakerTypes } from "@/lib/products/contractflow-ai/makers";

export default async function MakersPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_MAKERS")) redirect("/contractflow-ai");

  const makerTypes = await listMakerTypes(viewer);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Maker Types" }]}
        title={<>Maker Types</>}
        description={<>Configure the types of documents your team can create.</>}
        actions={<><Link href="/contractflow-ai/makers/new" className={buttonVariants({ size: "sm" })}>
          <Plus className="size-3.5" />
          New Maker Type
        </Link></>}
      />

      <PanelListFilters>
{makerTypes.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Layers className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No maker types configured yet. Create one to get started.
            </p>
          </CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {makerTypes.map((maker: any) => (
            <GlassCard key={maker.id} interactive>
              <CardContent className="flex items-start gap-3 py-4">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xl"
                  style={{
                    background: maker.color ? `${maker.color}20` : "hsl(var(--primary)/0.1)",
                  }}
                >
                  {maker.icon ?? "📄"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{maker.name}</p>
                  <p className="text-xs text-muted-foreground">{maker.slug}</p>
                  {maker.description && (
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {maker.description}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Link
                    href={`/contractflow-ai/makers/${maker.id}`}
                    className={buttonVariants({ size: "sm", variant: "outline" })}
                  >
                    <Pencil className="size-3" />
                    Edit
                  </Link>
                </div>
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
