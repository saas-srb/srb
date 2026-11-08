"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PAYMENT_METHODS, formatMoney } from "@/lib/products/cashflow-ai/constants";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { recordReimbursementAction } from "@/app/(products)/cashflow-ai/(protected)/reimbursements/actions";
import type { FundAccountOption } from "@/lib/products/cashflow-ai/fund-accounts";

export default function RecordReimbursementForm({
  expenseId,
  expenseCode,
  outstanding,
  currency,
  trigger,
  onSaved,
}: {
  expenseId: string;
  expenseCode: string;
  outstanding: number;
  currency: string;
  /** Bank/cash accounts this reimbursement can settle through — filtered to the claim's own `currency`. */
  fundAccounts?: FundAccountOption[];
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    amount: String(outstanding),
    method: "bank_transfer",
    transactionReference: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    fundAccountKey: "",
    notes: "",
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setErrors({});
    }
    setOpen(next);
  }

  const [code, setCode] = useState("");

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await recordReimbursementAction({ ...form, expenseId, code });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Payment sent to Razorpay");
      setOpen(false);
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Record Reimbursement</SheetTitle>
          <SheetDescription>Against claim {expenseCode} — outstanding {formatMoney(outstanding, currency)}.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min="0" max={outstanding} step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Payment Date *</Label>
              <Input type="date" value={form.paymentDate} onChange={(e) => set("paymentDate", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Method</Label>
              <Select value={form.method} onValueChange={(v) => set("method", v ?? "bank_transfer")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Transaction Reference</Label>
              <Input value={form.transactionReference} onChange={(e) => set("transactionReference", e.target.value)} />
            </div>
          </div>

          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">Paid through Razorpay from your RazorpayX balance, into the saved bank details. It shows as paid, with its UTR, when the bank confirms.</p>

          <PaymentCodeField value={code} onChange={setCode} />

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Record Reimbursement"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
