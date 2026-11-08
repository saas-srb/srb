"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X, AlertTriangle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";
import { matchStatementLineAction, flagStatementLineAction } from "@/app/(products)/cashflow-ai/(protected)/bank-reconciliation/actions";

interface Candidate {
  _id: string;
  transactionNumber: string;
  amount: number;
  currency: string;
  transactionDate: string;
  description: string | null;
}

export default function MatchTransactionDialog({
  lineId,
  bankAccountId,
  lineDescription,
  lineAmount,
  candidates,
  trigger,
}: {
  lineId: string;
  bankAccountId: string;
  lineDescription: string;
  lineAmount: number;
  candidates: Candidate[];
  trigger: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function match(transactionId: string) {
    startTransition(async () => {
      const res = await matchStatementLineAction(lineId, transactionId, bankAccountId);
      if (!res.ok) {
        toast.error(res.error ?? "Could not match.");
        return;
      }
      toast.success("Matched — transaction marked reconciled");
      setOpen(false);
      router.refresh();
    });
  }

  function flag(status: "duplicate" | "needs_review") {
    startTransition(async () => {
      const res = await flagStatementLineAction(lineId, status, bankAccountId);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update.");
        return;
      }
      toast.success(`Flagged ${status.replace(/_/g, " ")}`);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={trigger as ReactElement} />
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="border-b border-border/60">
          <SheetTitle>Match Statement Line</SheetTitle>
          <SheetDescription>{lineDescription} — {formatMoney(lineAmount)}</SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">No candidate transactions found within 1% of this amount on this account.</p>
          ) : (
            candidates.map((c) => (
              <div key={c._id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.transactionNumber}</p>
                  <p className="text-xs text-muted-foreground">{c.transactionDate} · {c.description ?? "—"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-medium">{formatMoney(c.amount, c.currency)}</span>
                  <Button type="button" size="sm" disabled={pending} onClick={() => match(c._id)}>
                    Match
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border/60 p-4">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => flag("needs_review")}>
            <Eye className="size-3.5" data-icon="inline-start" />
            Needs Review
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => flag("duplicate")}>
            <AlertTriangle className="size-3.5" data-icon="inline-start" />
            Duplicate
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" data-icon="inline-start" />}
            Close
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
