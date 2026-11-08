import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { getMakerType } from "@/lib/products/contractflow-ai/makers";
import MakerTypeForm from "@/components/products/contractflow-ai/MakerTypeForm";

export default async function MakerTypePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_MAKERS")) redirect("/contractflow-ai");

  const { id } = await params;
  const maker = id === "new" ? null : await getMakerType(id, viewer);
  if (id !== "new" && !maker) notFound();

  return (
    <div className="space-y-4">

      <PanelPageHeader
        title={<>{maker ? `Edit: ${(maker as any).name}` : "New Maker Type"}</>}
        description={<>Define a maker type — who may create documents, and which templates and workflows apply.</>}
      />

      <MakerTypeForm maker={maker} />
    </div>
  );
}
