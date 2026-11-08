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
import { recordCashCountAction } from "@/app/(products)/cashflow-ai/(protected)/cash-reconciliation/actions";

interface Option {
  _id: string;
  label: string;
}

export default function CashCountForm({
  cashAccounts,
  presetCashAccountId,
  trigger,
  onSaved,
}: {
  cashAccounts: Option[];
  presetCashAccountId?: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const seed = () => ({
    cashAccountId: presetCashAccountId ?? "",
    countDate: new Date().toISOString().slice(0, 10),
    physicalCount: "",
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
    startTransition(async () => {
      const res = await recordCashCountAction(form);
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Cash count recorded");
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
          <SheetTitle>Record Cash Count</SheetTitle>
          <SheetDescription>Count the drawer and compare it to the system balance.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Cash Account *</Label>
            <Select value={form.cashAccountId} onValueChange={(v) => set("cashAccountId", v ?? "")} disabled={Boolean(presetCashAccountId)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>
                {cashAccounts.map((a) => (
                  <SelectItem key={a._id} value={a._id}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.cashAccountId && <p className="text-xs text-destructive">{errors.cashAccountId}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Count Date *</Label>
            <Input type="date" value={form.countDate} onChange={(e) => set("countDate", e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Physical Count *</Label>
            <Input type="number" min="0" step="0.01" value={form.physicalCount} onChange={(e) => set("physicalCount", e.target.value)} />
            {errors.physicalCount && <p className="text-xs text-destructive">{errors.physicalCount}</p>}
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
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Record Count"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
