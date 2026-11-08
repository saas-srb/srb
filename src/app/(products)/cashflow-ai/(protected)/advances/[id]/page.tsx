import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { AdvanceStatusBadge } from "@/components/products/cashflow-ai/StatusBadges";
import AdvanceStatusActions from "@/components/products/cashflow-ai/AdvanceStatusActions";
import RepaymentForm from "@/components/products/cashflow-ai/RepaymentForm";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canApproveTransactions } from "@/lib/fms-roles";
import { getAdvance, serializeAdvance } from "@/lib/products/cashflow-ai/employee-advances";
import { listFundAccountOptions } from "@/lib/products/cashflow-ai/fund-accounts";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function AdvanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const [raw, fundAccounts] = await Promise.all([getAdvance(id), listFundAccountOptions()]);
  if (!raw) notFound();
  const advance = serializeAdvance(raw);
  const canAct = user ? canManageTransactions(user) || canApproveTransactions(user) : false;
  const canManage = user ? canManageTransactions(user) : false;

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Advances", href: "/cashflow-ai/advances" }, { label: advance.advanceNumber }]}
        title={<>{advance.advanceNumber}</>}
        description={<>{advance.employeeName} · {formatMoney(advance.amount)}</>}
        actions={<><AdvanceStatusBadge status={advance.status} /></>}
      />

      {(canAct || (canManage && advance.status === "disbursed")) && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <AdvanceStatusActions id={advance._id} status={advance.status} amount={advance.amount} fundAccounts={fundAccounts} />
            {canManage && advance.status === "disbursed" && advance.outstandingBalance > 0.01 && (
              <RepaymentForm
                advanceId={advance._id}
                outstanding={advance.outstandingBalance}
                fundAccounts={fundAccounts}
                trigger={
                  <Button type="button" size="sm" variant="outline">
                    <Plus className="size-3.5" data-icon="inline-start" />
                    Record Repayment
                  </Button>
                }
              />
            )}
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Reason" value={advance.reason} />
            <Row label="Approved By" value={advance.approvedBy ?? "—"} />
            <Row label="Approved At" value={advance.approvedAt ? formatDateTime(advance.approvedAt) : "—"} />
            <Row label="Disbursed At" value={advance.disbursedAt ? formatDateTime(advance.disbursedAt) : "—"} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Balance</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Advance Amount" value={formatMoney(advance.amount)} />
            <Row label="Repaid" value={formatMoney(advance.amount - advance.outstandingBalance)} />
            <Row label="Outstanding" value={formatMoney(advance.outstandingBalance)} />
          </CardContent>
        </GlassCard>
      </div>

      <GlassCard>
        <CardHeader><CardTitle>Repayment History</CardTitle></CardHeader>
        <CardContent>
          {advance.repayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No repayments recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {advance.repayments.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{formatDate(r.date)}</span>
                  <span className="font-medium text-foreground">{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
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
