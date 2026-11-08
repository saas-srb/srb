import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Download, RotateCcw } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import RefundForm from "@/components/products/cashflow-ai/RefundForm";
import ChequeActions from "@/components/products/cashflow-ai/ChequeActions";
import ReceiptDocuments from "@/components/products/cashflow-ai/ReceiptDocuments";
import VoidReceiptButton from "@/components/products/cashflow-ai/VoidReceiptButton";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { getReceipt, serializeReceipt } from "@/lib/products/cashflow-ai/receipts";
import { listRefundsForReceipt, serializeRefund } from "@/lib/products/cashflow-ai/refunds";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { formatDateTime } from "@/lib/utils";

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentFmsUser();
  const raw = await getReceipt(id);
  if (!raw) notFound();
  const receipt = serializeReceipt(raw);
  const refunds = (await listRefundsForReceipt(id)).map(serializeRefund);
  const canManage = user ? canManageTransactions(user) : false;

  const alreadyRefunded = refunds.filter((r) => r.status !== "failed").reduce((s, r) => s + r.amount, 0);
  const refundable = Math.max(0, receipt.amount - alreadyRefunded);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Payment Receipts", href: "/cashflow-ai/receipts" }, { label: receipt.receiptNumber }]}
        title={<>{receipt.receiptNumber}</>}
        description={<>{receipt.customerName} · {formatMoney(receipt.amount, receipt.currency)}</>}
        actions={<><div className="flex items-center gap-2">
          <Badge className={receipt.status === "pending_clearance" ? "bg-amber-500/15 text-amber-700 dark:text-amber-400" : receipt.status === "bounced" ? "bg-destructive/15 text-destructive" : receipt.status === "voided" ? "bg-muted text-muted-foreground" : "bg-green-500/15 text-green-600 dark:text-green-400"}>
            {({ completed: "Completed", voided: "Voided", pending_clearance: "Awaiting clearance", bounced: "Bounced" } as Record<string, string>)[receipt.status]}
          </Badge>
          <a href={`/api/cashflow-ai/receipts/${receipt.receiptNumber}`} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "outline", size: "sm" })}>
            <Download className="size-3.5" data-icon="inline-start" />
            PDF
          </a>
        </div></>}
      />

      {canManage && receipt.status === "pending_clearance" && (
        <GlassCard>
          <CardHeader><CardTitle>Cheque {receipt.chequeNumber}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">Drawn on {receipt.chequeBank}, dated {receipt.chequeDate}. The invoices stay unpaid and nothing is booked until the bank clears it.</p>
            <ChequeActions id={receipt._id} />
            <VoidReceiptButton id={receipt._id} />
          </CardContent>
        </GlassCard>
      )}
      {receipt.status === "bounced" && (
        <GlassCard>
          <CardContent className="py-4 text-sm"><span className="font-medium text-destructive">Bounced.</span> {receipt.bounceReason} The invoices are unpaid: ask the customer for another payment.</CardContent>
        </GlassCard>
      )}

      {canManage && receipt.status === "completed" && (
        <GlassCard>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {refundable > 0.01 && (
              <RefundForm
                receiptId={receipt._id}
                receiptNumber={receipt.receiptNumber}
                maxAmount={refundable}
                currency={receipt.currency}
                trigger={
                  <Button type="button" size="sm" variant="outline">
                    <RotateCcw className="size-3.5" data-icon="inline-start" />
                    Request Refund
                  </Button>
                }
              />
            )}
            <VoidReceiptButton id={receipt._id} />
          </CardContent>
        </GlassCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader><CardTitle>Payment</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Method" value={receipt.method?.replace(/_/g, " ") ?? "—"} />
            <Row label="Transaction Reference" value={receipt.transactionReference ?? "—"} />
            {receipt.chequeNumber && <Row label="Cheque" value={`${receipt.chequeNumber}, ${receipt.chequeBank}, dated ${receipt.chequeDate}`} />}
            <Row label="Receipt Date" value={formatDateTime(receipt.receiptDate)} />
            {(receipt as { tdsDeducted?: number }).tdsDeducted ? <Row label="TDS deducted by customer" value={`${formatMoney((receipt as { tdsDeducted?: number }).tdsDeducted ?? 0, receipt.currency)}${(receipt as { tdsSection?: string | null }).tdsSection ? ` (section ${(receipt as { tdsSection?: string | null }).tdsSection})` : ""}`} /> : null}
            <Row label="Unapplied Advance" value={formatMoney(receipt.advanceAmount, receipt.currency)} />
          </CardContent>
        </GlassCard>

        <GlassCard>
          <CardHeader><CardTitle>Applied Against</CardTitle></CardHeader>
          <CardContent>
            {receipt.allocations.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not applied to any invoice — recorded as an advance.</p>
            ) : (
              <ul className="divide-y divide-border/40">
                {receipt.allocations.map((a) => (
                  <li key={a.invoiceId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/cashflow-ai/invoices/${a.invoiceId}`} className="font-medium text-primary hover:underline">{a.invoiceNumber}</Link>
                    <span className="text-muted-foreground">{formatMoney(a.amount, receipt.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </GlassCard>
      </div>

      {refunds.length > 0 && (
        <GlassCard>
          <CardHeader><CardTitle>Refunds</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/40">
              {refunds.map((r) => (
                <li key={r._id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/cashflow-ai/refunds/${r._id}`} className="font-medium text-primary hover:underline">{r.refundNumber}</Link>
                  <span className="text-muted-foreground">{formatMoney(r.amount, receipt.currency)} · {r.status}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardHeader><CardTitle>Proof of payment</CardTitle></CardHeader>
        <CardContent>
          {receipt.viaGateway ? (
            <p className="text-sm text-muted-foreground">Paid through Razorpay: the payment record is the proof.</p>
          ) : (
            <ReceiptDocuments id={receipt._id} documents={(receipt.documents ?? []).map((d) => ({ storageKey: d.storageKey, filename: d.filename, size: d.size }))} canManage={canManage} />
          )}
        </CardContent>
      </GlassCard>

      {receipt.notes && (
        <GlassCard>
          <CardHeader><CardTitle>Notes</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{receipt.notes}</CardContent>
        </GlassCard>
      )}
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
