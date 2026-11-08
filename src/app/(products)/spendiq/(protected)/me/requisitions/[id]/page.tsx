import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound, redirect } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import RequisitionSummary from "@/components/products/spendiq/RequisitionSummary";
import RequisitionWorkflow from "@/components/products/spendiq/RequisitionWorkflow";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { hasPrmsStaffRole } from "@/lib/prms-roles";
import { getRequisition, serializeRequisition } from "@/lib/products/spendiq/requisitions";
import { getVendor } from "@/lib/products/spendiq/vendors";

export default async function MyRequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  if (!user) notFound();

  const requisition = await getRequisition(id);
  if (!requisition) notFound();

  const isOwner = requisition.requestedBy.userId === user.id;
  if (!isOwner && !hasPrmsStaffRole(user.roles)) redirect("/spendiq/me/requisitions");

  const r = serializeRequisition(requisition);
  const vendor = r.preferredVendorId ? await getVendor(r.preferredVendorId) : null;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SpendIQ", href: "/spendiq/me" },
          { label: "My Requisitions", href: "/spendiq/me/requisitions" },
          { label: r.prCode },
        ]}
        title={<>{r.itemName}</>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <RequisitionSummary requisition={r} vendorName={vendor?.companyName ?? null} />
        <RequisitionWorkflow
          requisition={r}
          isOwner={isOwner}
          canApprove={false}
          canDecideCurrent={false}
          backPath="/spendiq/me/requisitions"
        />
      </div>
    </div>
  );
}
