"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { SUPPORTED_CURRENCIES, FUND_ACCOUNT_STATUSES } from "@/lib/products/cashflow-ai/constants";
import { saveBankAccountAction } from "@/app/(products)/cashflow-ai/(protected)/bank-accounts/actions";
import type { SerializedBankAccount } from "@/lib/products/cashflow-ai/bank-accounts";

export default function BankAccountForm({
  account,
  trigger,
  onSaved,
}: {
  account?: SerializedBankAccount;
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    accountName: account?.accountName ?? "",
    bankName: account?.bankName ?? "",
    accountNumber: "",
    ifsc: account?.ifsc ?? "",
    branch: account?.branch ?? "",
    currency: account?.currency ?? "INR",
    openingBalance: account ? String(account.openingBalance) : "0",
    status: account?.status ?? "active",
    notes: account?.notes ?? "",
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

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await saveBankAccountAction(form, account?._id);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(account ? "Bank account updated" : "Bank account created");
      setOpen(false);
      if (res.id && onSaved) onSaved(res.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{account ? "Edit Bank Account" : "New Bank Account"}</SheetTitle>
          <SheetDescription>
            {account
              ? `Enter a new account number below to replace it — leave blank to keep ${account.accountNumberMasked}.`
              : "The account number, if provided, is encrypted at rest and never shown again in full except via Reveal."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Account Name *</Label>
            <Input value={form.accountName} onChange={(e) => set("accountName", e.target.value)} placeholder="Primary Operating Account" />
            {errors.accountName && <p className="text-xs text-destructive">{errors.accountName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Bank Name *</Label>
            <Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} />
            {errors.bankName && <p className="text-xs text-destructive">{errors.bankName}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Account Number</Label>
            <Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} placeholder={account ? account.accountNumberMasked : "Full account number"} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>IFSC</Label>
              <Input value={form.ifsc} onChange={(e) => set("ifsc", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Branch</Label>
              <Input value={form.branch} onChange={(e) => set("branch", e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency", v ?? "INR")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {!account && (
              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                <Input type="number" step="0.01" value={form.openingBalance} onChange={(e) => set("openingBalance", e.target.value)} />
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v ?? "active")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FUND_ACCOUNT_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
            {pending ? <Loader2 className="size-4 animate-spin" /> : account ? "Save Changes" : "Create Account"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
