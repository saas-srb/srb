import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { getCategory } from "@/lib/products/contractflow-ai/categories";
import CategoryForm from "@/components/products/contractflow-ai/CategoryForm";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_POLICIES")) redirect("/contractflow-ai");

  const { id } = await params;
  const category = id === "new" ? null : await getCategory(id, viewer);
  if (id !== "new" && !category) notFound();

  return (
    <div className="space-y-4">

      <PanelPageHeader
        title={<>{category ? `Edit: ${(category as any).name}` : "New Category"}</>}
        description={<>Group documents so they are easier to find, filter and report on.</>}
      />

      <CategoryForm category={category} />
    </div>
  );
}
