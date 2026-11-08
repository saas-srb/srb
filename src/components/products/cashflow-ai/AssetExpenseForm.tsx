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
import { PAYMENT_METHODS, ASSET_EXPENSE_CATEGORIES, formatMoney } from "@/lib/products/cashflow-ai/constants";
import { recordAssetExpenseAction } from "@/app/(products)/cashflow-ai/(protected)/asset-expenses/actions";
import type { FundAccountOption } from "@/lib/products/cashflow-ai/fund-accounts";

interface VendorOption {
  _id: string;
  label: string;
}

export default function AssetExpenseForm({
  assetId,
  assetName,
  currency,
  vendors,
  fundAccounts = [],
  trigger,
  onSaved,
}: {
  assetId: string;
  assetName: string;
  currency: string;
  vendors: VendorOption[];
  fundAccounts?: FundAccountOption[];
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    category: "maintenance",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    method: "bank_transfer",
    vendorId: "",
    notes: "",
    fundAccountKey: "",
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const matchingFundAccounts = fundAccounts.filter((a) => a.currency === currency);

  function onOpenChange(next: boolean) {
    if (next) {
      setForm(seed());
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    const vendorName = vendors.find((v) => v._id === form.vendorId)?.label ?? null;
    startTransition(async () => {
      const res = await recordAssetExpenseAction({ ...form, assetId, vendorName });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Asset expense recorded");
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
          <SheetTitle>Record Asset Expense</SheetTitle>
          <SheetDescription>{assetName} — maintenance, insurance or other ongoing cost.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v ?? "maintenance")}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.expenseDate} onChange={(e) => set("expenseDate", e.target.value)} />
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
          </div>

          <div className="space-y-1.5">
            <Label>Vendor</Label>
            <Select value={form.vendorId || "none"} onValueChange={(v) => set("vendorId", !v || v === "none" ? "" : v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v._id} value={v._id}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>

          <p className="text-xs text-muted-foreground">Currency: {currency} · {formatMoney(Number(form.amount) || 0, currency)}</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Record Expense"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
