import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { getViewer } from "@/lib/products/contractflow-ai/viewer";
import { lpmsCan } from "@/lib/lpms-roles";
import { getWorkflow } from "@/lib/products/contractflow-ai/workflows";
import WorkflowForm from "@/components/products/contractflow-ai/WorkflowForm";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/contractflow-ai/login");

  const ctx = { roles: viewer.roles, permissionOverrides: viewer.overrides };
  if (!lpmsCan(ctx, "MANAGE_POLICIES")) redirect("/contractflow-ai");

  const { id } = await params;
  const workflow = id === "new" ? null : await getWorkflow(id, viewer);
  if (id !== "new" && !workflow) notFound();

  return (
    <div className="space-y-4">

      <PanelPageHeader
        title={<>{workflow ? `Edit: ${(workflow as any).name}` : "New Approval Workflow"}</>}
        description={<>Set the approval steps a document goes through before it is issued.</>}
      />

      <WorkflowForm workflow={workflow} />
    </div>
  );
}
