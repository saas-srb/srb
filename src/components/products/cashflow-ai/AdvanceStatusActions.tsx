"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ADVANCE_TRANSITIONS, getAdvanceStatusMeta, type AdvanceStatus } from "@/lib/products/cashflow-ai/constants";
import { changeAdvanceStatusAction } from "@/app/(products)/cashflow-ai/(protected)/advances/actions";
import DisburseAdvanceForm from "@/components/products/cashflow-ai/DisburseAdvanceForm";
import type { FundAccountOption } from "@/lib/products/cashflow-ai/fund-accounts";

export default function AdvanceStatusActions({
  id,
  status,
  amount,
  fundAccounts = [],
}: {
  id: string;
  status: AdvanceStatus;
  /** Only needed to render the disbursement amount in `DisburseAdvanceForm` — omit if `status` can never transition to "disbursed". */
  amount?: number;
  fundAccounts?: FundAccountOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextStates = ADVANCE_TRANSITIONS[status] ?? [];

  if (nextStates.length === 0) return null;

  function move(to: AdvanceStatus) {
    startTransition(async () => {
      const res = await changeAdvanceStatusAction(id, to);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update status.");
        return;
      }
      toast.success(`Moved to ${getAdvanceStatusMeta(to).label}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStates.map((to) =>
        to === "disbursed" ? (
          <DisburseAdvanceForm
            key={to}
            advanceId={id}
            amount={amount ?? 0}
            fundAccounts={fundAccounts}
            trigger={<Button type="button" size="sm">Disburse</Button>}
          />
        ) : (
          <Button key={to} type="button" size="sm" variant={to === "rejected" ? "outline" : "default"} disabled={pending} onClick={() => move(to)}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : getAdvanceStatusMeta(to).label}
          </Button>
        )
      )}
    </div>
  );
}
