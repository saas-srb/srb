import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { RefundStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import RefundStatusActions from "@/components/products/cashflow-ai/RefundStatusActions";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canMoveRefund } from "@/lib/fms-roles";
import { REFUND_TRANSITIONS } from "@/lib/products/cashflow-ai/constants";
import { getRefund, serializeRefund } from "@/lib/products/cashflow-ai/refunds";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDateTime } from "@/lib/utils";

export default async function RefundDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const raw = await getRefund(id);
  if (!raw) notFound();
  const refund = serializeRefund(raw);
  // Only the moves this person is allowed to make (the action checks the same rule again).
  const allowed = user ? (REFUND_TRANSITIONS[refund.status] ?? []).filter((to) => canMoveRefund(user, refund.status, to)) : [];
  const canAct = allowed.length > 0;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Refunds", href: "/cashflow-ai/refunds" }, { label: refund.refundNumber }]}
        title={<>{refund.refundNumber}</>}
        description={<>{refund.customerName}</>}
        actions={<><RefundStatusBadge status={refund.status} /></>}
      />

      {canAct && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent>
            <RefundStatusActions id={refund._id} status={refund.status} allowed={allowed} />
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Receipt" value={<Link href={`/cashflow-ai/receipts/${refund.receiptId}`} className="text-primary hover:underline">{refund.receiptNumber}</Link>} />
          <Row label="Amount" value={formatMoney(refund.amount)} />
          <Row label="Reason" value={refund.reason} />
          <Row label="Approved By" value={refund.approvedBy ?? "—"} />
          <Row label="Approved At" value={refund.approvedAt ? formatDateTime(refund.approvedAt) : "—"} />
          <Row label="Created" value={formatDateTime(refund.createdAt)} />
        </CardContent>
      </GlassCard>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}
