"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRANSACTION_TRANSITIONS, getStatusMeta, type TransactionStatus } from "@/lib/products/cashflow-ai/constants";
import { changeTransactionStatusAction } from "@/app/(products)/cashflow-ai/(protected)/transactions/actions";

export default function TransactionStatusActions({ id, status }: { id: string; status: TransactionStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextStates = TRANSACTION_TRANSITIONS[status] ?? [];

  if (nextStates.length === 0) return null;

  function move(to: TransactionStatus) {
    startTransition(async () => {
      const res = await changeTransactionStatusAction(id, to);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update status.");
        return;
      }
      toast.success(`Moved to ${getStatusMeta(to).label}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStates.map((to) => (
        <Button
          key={to}
          type="button"
          size="sm"
          variant={to === "rejected" || to === "cancelled" || to === "failed" ? "outline" : "default"}
          disabled={pending}
          onClick={() => move(to)}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : getStatusMeta(to).label}
        </Button>
      ))}
    </div>
  );
}
