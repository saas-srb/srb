import { titlesOfPeople, nameWithTitle } from "@/lib/platform/organization/title-server";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, ShoppingCart } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import RequisitionSummary from "@/components/products/spendiq/RequisitionSummary";
import RequisitionWorkflow from "@/components/products/spendiq/RequisitionWorkflow";
import PurchaseOrderForm from "@/components/products/spendiq/PurchaseOrderForm";
import RfqForm from "@/components/products/spendiq/RfqForm";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { prmsCan, prmsMayOpen } from "@/lib/prms-access";
import { getRequisition, serializeRequisition, canDecideLevel } from "@/lib/products/spendiq/requisitions";
import { getVendor, listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";

export default async function StaffRequisitionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  if (!user) notFound();

  const requisition = await getRequisition(id);
  if (!requisition) notFound();
  // The requisition opens for its raiser, or for anyone with the everyone's scope.
  if (!prmsMayOpen(user, "requisitions", requisition.requestedBy.userId, user.id)) notFound();

  const r = serializeRequisition(requisition);
  // The raiser and every approver are written with the title chosen for them, never a product role.
  const people = await titlesOfPeople([r.requestedBy.userId, ...r.approvals.map((a) => a.approverId).filter((x): x is string => !!x)]);
  r.requestedBy = { ...r.requestedBy, name: nameWithTitle(r.requestedBy.name, people.get(r.requestedBy.userId)) };
  r.approvals = r.approvals.map((a) => ({ ...a, approverEmail: a.approverEmail && a.approverId ? nameWithTitle(a.approverEmail, people.get(a.approverId)) : a.approverEmail }));
  const vendor = r.preferredVendorId ? await getVendor(r.preferredVendorId) : null;

  const canApprove = prmsCan(user, "requisitions.approve");
  const canProcure = prmsCan(user, "purchaseorders.manage");
  const canDecideCurrent =
    canApprove && requisition.currentLevel > 0 && canDecideLevel(user, requisition.currentLevel);
  const isOwner = r.requestedBy.userId === user.id;

  const showConvert = canProcure && r.status === "approved";
  const [vendors, departments, projects] = showConvert
    ? await Promise.all([listVendorOptions({ activeOnly: true }), listDepartments(), listProjectOptions()])
    : [[], [], []];

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "SpendIQ", href: "/spendiq" },
          { label: "Purchase Requisition", href: "/spendiq/requisitions" },
          { label: r.prCode },
        ]}
        title={<>{r.itemName}</>}
      />

      {showConvert && (
        <div className="flex flex-wrap gap-2">
          <RfqForm
            prefill={{
              requisitionId: r._id,
              title: `RFQ for ${r.itemName}`,
              description: r.justification,
              departmentId: r.departmentId,
              lines: [{ description: r.itemName, quantity: String(r.quantity), uom: r.uom }],
            }}
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <FileSpreadsheet className="size-3.5" data-icon="inline-start" />
                Create RFQ
              </Button>
            }
          />
          <PurchaseOrderForm
            prefill={{
              requisitionId: r._id,
              departmentId: r.departmentId,
              projectId: r.projectId,
              vendorId: r.preferredVendorId,
              currency: r.currency,
              lines: [
                {
                  description: r.itemName,
                  hsn: "",
                  quantity: String(r.quantity),
                  uom: r.uom,
                  unitPrice: String(r.quantity > 0 ? Math.round((r.estimatedCost / r.quantity) * 100) / 100 : r.estimatedCost),
                  gstRate: "18",
                },
              ],
            }}
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
            projects={projects.map((p) => ({ _id: p._id, name: p.name }))}
            trigger={
              <Button type="button" size="sm">
                <ShoppingCart className="size-3.5" data-icon="inline-start" />
                Create PO
              </Button>
            }
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <RequisitionSummary requisition={r} vendorName={vendor?.companyName ?? null} />
        <RequisitionWorkflow
          requisition={r}
          isOwner={isOwner}
          canApprove={canApprove}
          canDecideCurrent={canDecideCurrent}
          backPath="/spendiq/requisitions"
        />
      </div>
    </div>
  );
}
