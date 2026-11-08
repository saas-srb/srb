"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { createDebitNoteAction } from "@/app/(products)/cashflow-ai/(protected)/debit-notes/actions";

export default function DebitNoteForm({
  billId,
  billNumber,
  currency,
  trigger,
  onSaved,
}: {
  billId: string;
  billNumber: string;
  currency: string;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onOpenChange(next: boolean) {
    if (next) {
      setAmount("");
      setReason("");
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await createDebitNoteAction({ billId, amount, reason });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Debit note issued");
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
          <SheetTitle>Issue Debit Note</SheetTitle>
          <SheetDescription>Against bill {billNumber} — an additional charge or correction ({currency}).</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Debit Amount *</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Additional charge, purchase adjustment, vendor correction…" />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Issue Debit Note"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
