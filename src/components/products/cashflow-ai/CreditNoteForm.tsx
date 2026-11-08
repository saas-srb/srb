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
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { createCreditNoteAction } from "@/app/(products)/cashflow-ai/(protected)/credit-notes/actions";
import type { SerializedInvoice } from "@/lib/products/cashflow-ai/invoices";

export default function CreditNoteForm({
  invoice,
  outstanding,
  trigger,
  onSaved,
}: {
  invoice: Pick<SerializedInvoice, "_id" | "invoiceNumber" | "currency">;
  outstanding: number;
  trigger: ReactNode;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(String(outstanding));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function onOpenChange(next: boolean) {
    if (next) {
      setAmount(String(outstanding));
      setReason("");
      setErrors({});
    }
    setOpen(next);
  }

  function submit() {
    setErrors({});
    startTransition(async () => {
      const res = await createCreditNoteAction({ invoiceId: invoice._id, amount, reason });
      if (!res.ok) {
        if (res.fieldErrors) setErrors(res.fieldErrors);
        toast.error(res.error ?? "Please fix the highlighted fields.");
        return;
      }
      toast.success("Credit note issued");
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
          <SheetTitle>Issue Credit Note</SheetTitle>
          <SheetDescription>Against invoice {invoice.invoiceNumber} — outstanding {formatMoney(outstanding, invoice.currency)}.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-1.5">
            <Label>Credit Amount *</Label>
            <Input type="number" min="0" max={outstanding} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Reason *</Label>
            <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Invoice correction, discount, overbilling…" />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason}</p>}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Issue Credit Note"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
