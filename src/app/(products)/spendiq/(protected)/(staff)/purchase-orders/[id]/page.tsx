import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { PoStatusBadge, GrnStatusBadge } from "@/components/products/spendiq/StatusBadges";
import PurchaseOrderForm from "@/components/products/spendiq/PurchaseOrderForm";
import PurchaseOrderWorkflow from "@/components/products/spendiq/PurchaseOrderWorkflow";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { getPurchaseOrder, serializePurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { listReceiptsForPo } from "@/lib/products/spendiq/goods-receipts";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments, listProjectOptions } from "@/lib/products/spendiq/pickers";
import { formatMoney } from "@/lib/products/spendiq/constants";
import { formatDate } from "@/lib/utils";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value || "—"}</p>
    </div>
  );
}

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const po = await getPurchaseOrder(id);
  if (!po) notFound();
  const p = serializePurchaseOrder(po);

  const [receipts, vendors, departments, projects] = await Promise.all([
    listReceiptsForPo(id),
    listVendorOptions({ activeOnly: true }),
    listDepartments(),
    listProjectOptions(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "Purchase Orders", href: "/spendiq/purchase-orders" }, { label: p.poNumber }]}
        title={<>{p.poNumber}</>}
        description={<>{p.vendorName} · <PoStatusBadge status={p.status} /> · {formatMoney(p.totalAmount, p.currency)}</>}
        actions={<>{canManage && p.status === "draft" && (
          <PurchaseOrderForm
            po={p}
            vendors={vendors.map((v) => ({ _id: v._id, companyName: v.companyName }))}
            departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
            projects={projects.map((pr) => ({ _id: pr._id, name: pr.name }))}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Pencil className="size-3.5" data-icon="inline-start" />
                Edit
              </Button>
            }
          />
        )}</>}
      />

      <PurchaseOrderWorkflow id={p._id} poNumber={p.poNumber} status={p.status} canManage={canManage} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Department" value={p.departmentName} />
        <Field label="Project" value={p.projectName} />
        <Field label="Delivery date" value={p.deliveryDate ? formatDate(p.deliveryDate) : null} />
        <Field label="Payment terms" value={p.paymentTerms} />
        <Field label="Issued" value={p.issuedAt ? formatDate(p.issuedAt) : "Not issued"} />
        <Field label="Source requisition" value={p.requisitionId ? <Link className="text-primary hover:underline" href={`/spendiq/requisitions/${p.requisitionId}`}>View</Link> : null} />
      </div>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Line Items</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Ordered</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">GST</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {p.items.map((it, i) => (
                <TableRow key={i}>
                  <TableCell>{it.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.quantity} {it.uom}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.receivedQty}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(it.unitPrice, p.currency)}</TableCell>
                  <TableCell className="text-right tabular-nums">{it.gstRate}%</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(it.lineTotal, p.currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-3 ml-auto w-56 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{formatMoney(p.subtotal, p.currency)}</span></div>
            {p.discount > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">-{formatMoney(p.discount, p.currency)}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span className="tabular-nums">{formatMoney(p.gstAmount, p.currency)}</span></div>
            <div className="flex justify-between border-t border-border/60 pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{formatMoney(p.totalAmount, p.currency)}</span></div>
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Goods Receipts</CardTitle></CardHeader>
        <CardContent>
          {receipts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No goods received against this PO yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>GRN #</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {receipts.map((g) => (
                  <TableRow key={g._id}>
                    <TableCell><Link className="text-primary hover:underline" href={`/spendiq/grn/${g._id}`}>{g.grnNumber}</Link></TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(g.receivedDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.items.reduce((s, it) => s + it.acceptedQty, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{g.items.reduce((s, it) => s + it.rejectedQty, 0)}</TableCell>
                    <TableCell><GrnStatusBadge status={g.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
