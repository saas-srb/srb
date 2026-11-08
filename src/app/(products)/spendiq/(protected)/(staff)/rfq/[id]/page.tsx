import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { RfqStatusBadge } from "@/components/products/spendiq/StatusBadges";
import RfqForm from "@/components/products/spendiq/RfqForm";
import RfqComparison from "@/components/products/spendiq/RfqComparison";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { getRfq, serializeRfq } from "@/lib/products/spendiq/rfqs";
import { listVendorOptions } from "@/lib/products/spendiq/vendors";
import { listDepartments } from "@/lib/products/spendiq/pickers";

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentPrmsUser();
  const canManage = user ? canManageProcurement(user) : false;

  const rfq = await getRfq(id);
  if (!rfq) notFound();
  const r = serializeRfq(rfq);

  const [allVendors, departments] = await Promise.all([listVendorOptions({ activeOnly: true }), listDepartments()]);
  // Vendors that can receive a quotation: those invited, plus any active vendor.
  const vendorOptions = allVendors.map((v) => ({ _id: v._id, companyName: v.companyName }));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "SpendIQ", href: "/spendiq" }, { label: "RFQ & Quotations", href: "/spendiq/rfq" }, { label: r.rfqCode }]}
        title={<>{r.title}</>}
        description={<><span className="font-mono">{r.rfqCode}</span> · <RfqStatusBadge status={r.status} />
            {r.awardedPoId && (
              <> · <Link className="text-primary hover:underline" href={`/spendiq/purchase-orders/${r.awardedPoId}`}>View PO</Link></>
            )}</>}
        actions={<>{canManage && r.status !== "awarded" && (
          <RfqForm
            rfq={r}
            vendors={vendorOptions}
            departments={departments.map((d) => ({ _id: d._id, name: d.name }))}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Pencil className="size-3.5" data-icon="inline-start" />
                Edit
              </Button>
            }
          />
        )}</>}
      />

      <GlassCard interactive={false}>
        <CardHeader><CardTitle>Requested Items</CardTitle></CardHeader>
        <CardContent>
          <ul className="space-y-1 text-sm">
            {r.lines.map((l, i) => (
              <li key={i} className="flex justify-between">
                <span>{l.description}</span>
                <span className="text-muted-foreground">{l.quantity} {l.uom}</span>
              </li>
            ))}
          </ul>
          {r.description && <p className="mt-3 text-sm text-muted-foreground">{r.description}</p>}
        </CardContent>
      </GlassCard>

      <RfqComparison rfq={r} vendors={vendorOptions} canManage={canManage} />
    </div>
  );
}
