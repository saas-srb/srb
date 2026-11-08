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
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { disposeAssetAction } from "@/app/(products)/cashflow-ai/(protected)/asset-disposals/actions";
import type { FundAccountOption } from "@/lib/products/cashflow-ai/fund-accounts";

export default function AssetDisposalForm({
  assetId,
  assetName,
  bookValue,
  currency,
  fundAccounts = [],
  trigger,
  onSaved,
}: {
  assetId: string;
  assetName: string;
  bookValue: number;
  currency: string;
  /** Bank/cash accounts disposal proceeds can land in — only relevant/shown once a disposal value is entered. */
  fundAccounts?: FundAccountOption[];
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    disposalDate: new Date().toISOString().slice(0, 10),
    disposalValue: String(bookValue),
    reason: "",
    fundAccountKey: "",
  });

  const [form, setForm] = useState(seed);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const matchingFundAccounts = fundAccounts.filter((a) => a.currency === currency);
  const showFundAccountPicker = (Number(form.disposalValue) || 0) > 0 && matchingFundAccounts.length > 0;

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
      const res = await disposeAssetAction({ ...form, assetId });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Asset disposed");
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
          <SheetTitle>Dispose Asset</SheetTitle>
          <SheetDescription>{assetName} — current book value {formatMoney(bookValue, currency)}. This retires the asset in SpendIQ too.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Disposal Date *</Label>
              <Input type="date" value={form.disposalDate} onChange={(e) => set("disposalDate", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Disposal Value *</Label>
              <Input type="number" min="0" step="0.01" value={form.disposalValue} onChange={(e) => set("disposalValue", e.target.value)} />
              {errors.disposalValue && <p className="text-xs text-destructive">{errors.disposalValue}</p>}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea rows={3} value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="Sold, scrapped, written off…" />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>
          {showFundAccountPicker && (
            <div className="space-y-1.5">
              <Label>Fund Account (bank/cash the proceeds land in)</Label>
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
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Dispose Asset"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
