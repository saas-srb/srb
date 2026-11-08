"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { INVOICE_TRANSITIONS, getInvoiceStatusMeta, type InvoiceStatus } from "@/lib/products/cashflow-ai/constants";
import { changeInvoiceStatusAction } from "@/app/(products)/cashflow-ai/(protected)/invoices/actions";

export default function InvoiceStatusActions({ id, status }: { id: string; status: InvoiceStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const nextStates = INVOICE_TRANSITIONS[status] ?? [];

  if (nextStates.length === 0) return null;

  function move(to: InvoiceStatus) {
    startTransition(async () => {
      const res = await changeInvoiceStatusAction(id, to);
      if (!res.ok) {
        toast.error(res.error ?? "Could not update status.");
        return;
      }
      toast.success(`Moved to ${getInvoiceStatusMeta(to).label}`);
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
          variant={to === "cancelled" || to === "void" ? "outline" : "default"}
          disabled={pending}
          onClick={() => move(to)}
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : getInvoiceStatusMeta(to).label}
        </Button>
      ))}
    </div>
  );
}
