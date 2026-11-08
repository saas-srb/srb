import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, Tags } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardContent } from "@/components/ui/card";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { listCategories } from "@/lib/products/contractflow-ai/categories";

export default async function CategoriesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  const canManage = lpmsCan(ctx, "MANAGE_POLICIES");

  const categories = await listCategories(viewer);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "ContractFlow", href: "/contractflow-ai" }, { label: "Categories" }]}
        title={<>Categories</>}
        description={<>Organise documents into categories for easier discovery.</>}
        actions={<>{canManage && (
          <Link href="/contractflow-ai/categories/new" className={buttonVariants({ size: "sm" })}>
            <Plus className="size-3.5" />
            New Category
          </Link>
        )}</>}
      />

      <PanelListFilters>
{categories.length === 0 ? (
        <GlassCard interactive={false}>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Tags className="size-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No categories yet.</p>
          </CardContent>
        </GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat: any) => (
            <GlassCard key={cat.id} interactive={canManage}>
              <CardContent className="flex items-center gap-3 py-4">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-sm"
                  style={{ background: cat.color ? `${cat.color}20` : "hsl(var(--muted))" }}
                >
                  {cat.icon ?? "🏷️"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{cat.name}</p>
                  <p className="text-xs text-muted-foreground">{cat.slug}</p>
                </div>
                {canManage && (
                  <Link
                    href={`/contractflow-ai/categories/${cat.id}`}
                    className="text-xs text-muted-foreground hover:text-primary"
                  >
                    Edit
                  </Link>
                )}
              </CardContent>
            </GlassCard>
          ))}
        </div>
      )}
</PanelListFilters>
    </div>
  );
}
