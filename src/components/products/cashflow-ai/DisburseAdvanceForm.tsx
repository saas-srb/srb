"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { changeAdvanceStatusAction } from "@/app/(products)/cashflow-ai/(protected)/advances/actions";
import type { FundAccountOption } from "@/lib/products/cashflow-ai/fund-accounts";

/**
 * Disbursement previously fired directly from a bare status-transition
 * button (`AdvanceStatusActions.tsx`) with no form at all — this is the
 * minimal form the Fund Account picker retrofit needs: everything else
 * about the disbursement (amount, date) is already implied by the advance
 * record, so the only real input is which bank/cash account it pays from.
 */
export default function DisburseAdvanceForm({
  advanceId,
  amount,
  trigger,
}: {
  advanceId: string;
  amount: number;
  fundAccounts?: FundAccountOption[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
  }

  const [code, setCode] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await changeAdvanceStatusAction(advanceId, "disbursed", undefined, code);
      if (!res.ok) {
        toast.error(res.error ?? "Could not disburse the advance.");
        return;
      }
      toast.success("Payment sent to Razorpay");
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-sm">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Disburse Advance</SheetTitle>
          <SheetDescription>Amount: {formatMoney(amount)}.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <PaymentCodeField value={code} onChange={setCode} />
          <p className="text-sm text-muted-foreground">Paid through Razorpay from your RazorpayX balance, into the employee&apos;s primary bank account. The advance shows as disbursed when the bank confirms.</p>
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : "Disburse"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
