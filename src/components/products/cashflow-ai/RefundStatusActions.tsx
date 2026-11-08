"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REFUND_TRANSITIONS, getRefundStatusMeta, type RefundStatus } from "@/lib/products/cashflow-ai/constants";
import PaymentCodeField from "@/components/products/cashflow-ai/PaymentCodeField";
import { changeRefundStatusAction } from "@/app/(products)/cashflow-ai/(protected)/refunds/actions";

export default function RefundStatusActions({ id, status, allowed }: { id: string; status: RefundStatus; /** The moves this person may make (decided on the server). */ allowed: RefundStatus[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [code, setCode] = useState("");
  const nextStates = (REFUND_TRANSITIONS[status] ?? []).filter((s) => allowed.includes(s));

  if (nextStates.length === 0) return null;

  function move(to: RefundStatus) {
    startTransition(async () => {
      const res = await changeRefundStatusAction(id, to, code);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update status.");
        return;
      }
      toast.success(`Moved to ${getRefundStatusMeta(to).label}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {nextStates.includes("processing") && <div className="max-w-sm"><PaymentCodeField value={code} onChange={setCode} /></div>}
    <div className="flex flex-wrap gap-2">
      {nextStates.map((to) => (
        <Button key={to} type="button" size="sm" variant={to === "failed" ? "outline" : "default"} disabled={pending} onClick={() => move(to)}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : getRefundStatusMeta(to).label}
        </Button>
      ))}
    </div>
    </div>
  );
}
