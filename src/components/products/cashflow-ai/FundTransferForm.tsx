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
import { recordTransferAction } from "@/app/(products)/cashflow-ai/(protected)/transfers/actions";

export interface FundAccountOption {
  key: string; // `${type}:${id}`
  type: "bank" | "cash";
  id: string;
  label: string;
}

export default function FundTransferForm({
  accounts,
  trigger,
  onSaved,
}: {
  accounts: FundAccountOption[];
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    fromKey: "",
    toKey: "",
    amount: "",
    transferDate: new Date().toISOString().slice(0, 10),
    referenceNumber: "",
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

  function submit() {
    setErrors({});
    const from = accounts.find((a) => a.key === form.fromKey);
    const to = accounts.find((a) => a.key === form.toKey);
    if (!from || !to) {
      setErrors({ fromAccountId: "Select both accounts." });
      return;
    }
    startTransition(async () => {
      const res = await recordTransferAction({
        ...form,
        fromAccountId: from.id,
        fromAccountType: from.type,
        toAccountId: to.id,
        toAccountType: to.type,
      });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Transfer recorded");
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
          <SheetTitle>Record Transfer</SheetTitle>
          <SheetDescription>Between any two bank or cash accounts — posts two linked transactions.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>From *</Label>
            <Select value={form.fromKey} onValueChange={(v) => set("fromKey", v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Source account" /></SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.fromAccountId && <p className="text-xs text-destructive">{errors.fromAccountId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>To *</Label>
            <Select value={form.toKey} onValueChange={(v) => set("toKey", v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Destination account" /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.key !== form.fromKey).map((a) => (
                  <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.toAccountId && <p className="text-xs text-destructive">{errors.toAccountId}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} />
              {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Date *</Label>
              <Input type="date" value={form.transferDate} onChange={(e) => set("transferDate", e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Reference Number</Label>
            <Input value={form.referenceNumber} onChange={(e) => set("referenceNumber", e.target.value)} />
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
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Record Transfer"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
