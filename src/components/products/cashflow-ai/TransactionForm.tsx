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
import { TRANSACTION_TYPES, PAYMENT_METHODS, SOURCE_MODULES, SUPPORTED_CURRENCIES } from "@/lib/products/cashflow-ai/constants";
import { saveTransactionAction } from "@/app/(products)/cashflow-ai/(protected)/transactions/actions";
import type { SerializedTransaction } from "@/lib/products/cashflow-ai/transactions";
import type { FundAccountOption } from "@/components/products/cashflow-ai/FundTransferForm";

interface Option {
  _id: string;
  label: string;
}

export default function TransactionForm({
  transaction,
  customers,
  vendors,
  projects,
  accounts,
  fundAccounts = [],
  trigger,
  onSaved,
}: {
  transaction?: SerializedTransaction;
  customers: Option[];
  vendors: Option[];
  projects: Option[];
  accounts: Option[];
  /** Bank/cash accounts this transaction can settle through (§19/§21) — optional so callers built before Phase 4 keep working unchanged. */
  fundAccounts?: FundAccountOption[];
  trigger: ReactNode;
  onSaved?: (id: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    type: transaction?.type ?? "expense",
    transactionDate: transaction?.transactionDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    postingDate: transaction?.postingDate?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    amount: transaction ? String(transaction.amount) : "",
    taxAmount: transaction ? String(transaction.taxAmount) : "0",
    currency: transaction?.currency ?? "INR",
    paymentMethod: transaction?.paymentMethod ?? "bank_transfer",
    sourceModule: transaction?.sourceModule ?? "fms",
    sourceRecordId: transaction?.sourceRecordId ?? "",
    customerId: transaction?.customerId ?? "",
    vendorId: transaction?.vendorId ?? "",
    projectId: transaction?.projectId ?? "",
    department: transaction?.department ?? "",
    accountId: transaction?.accountId ?? "",
    fundAccountKey: transaction?.fundAccountType && transaction?.fundAccountId ? `${transaction.fundAccountType}:${transaction.fundAccountId}` : "",
    referenceNumber: transaction?.referenceNumber ?? "",
    description: transaction?.description ?? "",
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
      const res = await saveTransactionAction(form, transaction?._id);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success(transaction ? "Transaction updated" : "Transaction created");
      setOpen(false);
      if (res.id && onSaved) onSaved(res.id);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-lg">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>{transaction ? "Edit Transaction" : "New Transaction"}</SheetTitle>
          <SheetDescription>Every financial event — money in, money out, transfers and adjustments.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type *</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSACTION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Transaction Date *</Label>
              <Input type="date" value={form.transactionDate} onChange={(e) => set("transactionDate", e.target.value)} />
              {errors.transactionDate && <p className="text-xs text-destructive">{errors.transactionDate}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Posting Date</Label>
              <Input type="date" value={form.postingDate} onChange={(e) => set("postingDate", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Payment Method</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => set("paymentMethod", v ?? "")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tax Amount</Label>
              <Input type="number" min="0" step="0.01" value={form.taxAmount} onChange={(e) => set("taxAmount", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reference Number</Label>
              <Input value={form.referenceNumber} onChange={(e) => set("referenceNumber", e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Select value={form.customerId || "none"} onValueChange={(v) => set("customerId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c._id} value={c._id}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor</Label>
              <Select value={form.vendorId || "none"} onValueChange={(v) => set("vendorId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {vendors.map((v) => (
                    <SelectItem key={v._id} value={v._id}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={form.projectId || "none"} onValueChange={(v) => set("projectId", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p._id} value={p._id}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Input value={form.department} onChange={(e) => set("department", e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Category (Chart of Accounts)</Label>
            <Select value={form.accountId || "none"} onValueChange={(v) => set("accountId", !v || v === "none" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a._id} value={a._id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {fundAccounts.length > 0 && (
            <div className="space-y-1.5">
              <Label>Fund Account (bank/cash this settles through)</Label>
              <Select value={form.fundAccountKey || "none"} onValueChange={(v) => set("fundAccountKey", !v || v === "none" ? "" : v)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {fundAccounts.map((a) => (
                    <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Source Module</Label>
            <Select value={form.sourceModule} onValueChange={(v) => set("sourceModule", v ?? "fms")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SOURCE_MODULES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => set("description", e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : transaction ? "Save Changes" : "Create Transaction"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
