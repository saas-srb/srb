"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { PAYMENT_METHODS, DEFAULT_CURRENCY, formatMoney } from "@/lib/products/cashflow-ai/constants";
import { recordRepaymentAction } from "@/app/(products)/cashflow-ai/(protected)/advances/actions";
import type { FundAccountOption } from "@/lib/products/cashflow-ai/fund-accounts";

export default function RepaymentForm({
  advanceId,
  outstanding,
  fundAccounts = [],
  trigger,
  onSaved,
}: {
  advanceId: string;
  outstanding: number;
  /** Bank/cash accounts this repayment can settle through — advances are always recorded in the base currency today. */
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
    date: new Date().toISOString().slice(0, 10),
    fundAccountKey: "",
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const matchingFundAccounts = fundAccounts.filter((a) => a.currency === DEFAULT_CURRENCY);

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await recordRepaymentAction(advanceId, form);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Repayment recorded");
      setOpen(false);
      onSaved?.();
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-sm">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Record Repayment</SheetTitle>
          <SheetDescription>Outstanding balance: {formatMoney(outstanding)}.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Amount *</Label>
            <Input type="number" min="0" max={outstanding} step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Date *</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
          </div>
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
          {matchingFundAccounts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Fund Account (bank/cash this settles through)</Label>
              <Select value={form.fundAccountKey || "none"} onValueChange={(v) => set("fundAccountKey", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {matchingFundAccounts.map((a) => (
                    <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Record Repayment"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
