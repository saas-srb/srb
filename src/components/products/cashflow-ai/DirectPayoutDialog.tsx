"use client";

import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Loader2, CheckCircle2, Building2, IndianRupee, Hash, FileText, Landmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { toast } from "sonner";

export interface DirectPayoutDrawerProps {
  defaultPayee?: string;
  defaultAmount?: number;
  defaultSourceModule?: string;
  sourceTransactionId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}

export default function DirectPayoutDialog({
  defaultPayee = "",
  defaultAmount = 0,
  defaultSourceModule = "fms",
  sourceTransactionId = "",
  triggerLabel = "Pay Now",
  triggerClassName = "",
}: DirectPayoutDrawerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [successTxn, setSuccessTxn] = useState<string | null>(null);

  const seed = () => ({
    payeeName: defaultPayee,
    payeeAccount: "",
    ifscCode: "",
    amount: defaultAmount ? String(defaultAmount) : "",
    channel: "imps",
    sourceModule: defaultSourceModule,
    refNotes: "",
    remarks: "",
  });

  const [form, setForm] = useState(seed);
  const [code, setCode] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setSuccessTxn(null);
    }
    setOpen(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.payeeName || !form.amount) {
      toast.error("Payee name and amount are required");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/cashflow-ai/payments/payout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            payeeName: form.payeeName,
            payeeAccount: form.payeeAccount,
            ifscCode: form.ifscCode,
            code,
            clientRequestId: requestId,
            amount: Number(form.amount),
            channel: form.channel,
            sourceModule: form.sourceModule,
            refNotes: form.refNotes || form.remarks,
            sourceTransactionId: sourceTransactionId || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error || "Payout failed");
        setSuccessTxn(data.referenceNumber || data.payoutId);
        toast.success("Payment sent to Razorpay. It shows as paid once the bank confirms.");
        setCode("");
        setRequestId(crypto.randomUUID());
        router.refresh();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Trigger button — same style as other products */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          triggerClassName ||
          "inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-sm"
        }
      >
        <Send className="size-3" />
        {triggerLabel}
      </button>

      <SheetContent className="sm:max-w-lg" side="right">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-brand-accent text-white">
              <Landmark className="size-3.5" />
            </div>
            Bank Payout
          </SheetTitle>
          <SheetDescription>
            Execute a direct bank transfer from your corporate account. All fields are pre-filled from the record.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {successTxn ? (
            /* ── Success State ── */
            <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/20">
                <CheckCircle2 className="size-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-foreground">Transfer Complete</h3>
                <p className="text-xs text-muted-foreground mt-1">Razorpay reference (the UTR follows once the bank confirms)</p>
                <p className="mt-2 font-mono text-sm font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg border border-primary/20 inline-block">
                  {successTxn}
                </p>
              </div>
              <Button
                className="w-full mt-2"
                onClick={() => setOpen(false)}
              >
                Done — Close Product
              </Button>
            </div>
          ) : (
            /* ── Payout Form ── */
            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Pre-filled info banner */}
              <div className="flex items-center gap-2.5 rounded-xl bg-primary/8 border border-primary/20 px-3 py-2.5">
                <Building2 className="size-4 text-primary shrink-0" />
                <div className="text-xs">
                  <p className="font-semibold text-primary">Auto-filled from record</p>
                  <p className="text-muted-foreground">Verify details before executing payout</p>
                </div>
              </div>

              {/* Payee Name */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  Beneficiary / Payee Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  required
                  placeholder="Dell India Pvt Ltd"
                  value={form.payeeName}
                  onChange={(e) => set("payeeName", e.target.value)}
                />
              </div>

              {/* Amount + Channel */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <IndianRupee className="size-3.5 text-muted-foreground" />
                    Amount (₹) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    placeholder="25000"
                    value={form.amount}
                    onChange={(e) => set("amount", e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Transfer Channel</Label>
                  <select
                    value={form.channel}
                    onChange={(e) => set("channel", e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="neft">NEFT</option>
                    <option value="rtgs">RTGS (₹2L or more)</option>
                    <option value="imps">IMPS (instant, up to ₹5L)</option>
                    <option value="upi">UPI</option>
                  </select>
                </div>
              </div>

              {/* Bank Account + IFSC */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Hash className="size-3.5 text-muted-foreground" />
                    {form.channel === "upi" ? "UPI id" : "Bank Account No."}
                  </Label>
                  <Input
                    placeholder={form.channel === "upi" ? "name@bank" : "50100987654321"}
                    value={form.payeeAccount}
                    onChange={(e) => set("payeeAccount", e.target.value)}
                  />
                </div>
                {form.channel !== "upi" && (
                <div className="space-y-1.5">
                  <Label>IFSC Code</Label>
                  <Input
                    placeholder="HDFC0001234"
                    value={form.ifscCode}
                    onChange={(e) => set("ifscCode", e.target.value)}
                  />
                </div>
                )}
              </div>

              <PaymentCodeField value={code} onChange={setCode} />

              {/* Source Module (read-only tag) */}
              <div className="space-y-1.5">
                <Label>Source Product</Label>
                <div className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-3 py-2">
                  <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold uppercase">
                    {form.sourceModule}
                  </span>
                  <span className="text-xs text-muted-foreground">Auto-tagged from originating product</span>
                </div>
              </div>

              {/* PO / Invoice Reference */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" />
                  PO / Invoice Reference
                </Label>
                <Input
                  placeholder="e.g. INV-2026-88 or PO-SpendIQ-001"
                  value={form.refNotes}
                  onChange={(e) => set("refNotes", e.target.value)}
                />
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <Label>Remarks (optional)</Label>
                <Input
                  placeholder="e.g. September salary, Q3 invoice payment…"
                  value={form.remarks}
                  onChange={(e) => set("remarks", e.target.value)}
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex flex-col gap-2 border-t border-border/60 pt-4">
                <Button type="submit" disabled={pending} className="w-full gap-2">
                  {pending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Executing Transfer…
                    </>
                  ) : (
                    <>
                      <Send className="size-4" />
                      Execute Bank Payout
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
