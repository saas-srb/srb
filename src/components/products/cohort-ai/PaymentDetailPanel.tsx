"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Download } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { PAYMENT_METHODS } from "@/lib/products/cohort-ai/constants";
import { formatCurrency, formatDate } from "@/lib/utils";
import { addInstallmentAction, removeInstallmentAction } from "@/app/(products)/cohort-ai/(protected)/(staff)/payments/actions";
import type { SerializedPaymentPlan } from "@/lib/products/cohort-ai/payments";

export default function PaymentDetailPanel({
  plan,
  canManage,
}: {
  plan: SerializedPaymentPlan;
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [amount, setAmount] = useState(String(plan.pendingAmount || ""));
  const [method, setMethod] = useState<string>("UPI");
  const [txnId, setTxnId] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");

  function addPayment() {
    startTransition(async () => {
      const result = await addInstallmentAction(plan._id, { amount, method, transactionId: txnId, paidOn, note });
      if (!result.ok) {
        toast.error(result.error ?? "Could not record payment.");
        return;
      }
      toast.success(`Recorded · ${result.invoiceNumber}`);
      setShowForm(false);
      setTxnId("");
      setNote("");
      router.refresh();
    });
  }

  function removePayment(installmentId: string) {
    startTransition(async () => {
      const result = await removeInstallmentAction(plan._id, installmentId);
      if (!result.ok) {
        toast.error(result.error ?? "Could not remove.");
        return;
      }
      toast.success("Payment removed");
      router.refresh();
    });
  }

  return (
    <GlassCard interactive={false}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Payments ({plan.installments.length})</CardTitle>
        {canManage && plan.pendingAmount > 0 && (
          <Button type="button" size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="size-3.5" data-icon="inline-start" />
            Record payment
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {showForm && (
          <div className="space-y-2 rounded-lg border border-border/60 bg-muted/40 p-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={(v) => setMethod(v ?? "UPI")}>
                  <SelectTrigger className="h-8 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Transaction ID</Label>
                <Input value={txnId} onChange={(e) => setTxnId(e.target.value)} className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Paid on</Label>
                <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className="h-8" />
              </div>
            </div>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8" />
            <Button type="button" size="sm" disabled={pending} onClick={addPayment}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Save & generate receipt"}
            </Button>
          </div>
        )}

        {plan.installments.length === 0 && !showForm && (
          <p className="py-4 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
        )}

        {plan.installments.map((i) => (
          <div key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm">
            <div className="min-w-0">
              <span className="font-semibold tabular-nums">{formatCurrency(i.amount, plan.currency)}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {i.method}{i.transactionId ? ` · ${i.transactionId}` : ""} · {formatDate(i.paidOn)}
              </span>
              <div className="font-mono text-[11px] text-muted-foreground">{i.invoiceNumber}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <a href={`/api/cohort-ai/invoices/${i.invoiceNumber}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Download className="size-3.5" data-icon="inline-start" />
                Receipt
              </a>
              {canManage && (
                <Button type="button" variant="ghost" size="icon-xs" disabled={pending} onClick={() => removePayment(i.id)} aria-label="Remove payment">
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </GlassCard>
  );
}
