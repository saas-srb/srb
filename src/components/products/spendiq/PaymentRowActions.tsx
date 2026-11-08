"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeleteRowButton from "@/components/products/spendiq/DeleteRowButton";
import { processPaymentAction, deletePaymentAction } from "@/app/(products)/spendiq/(protected)/(staff)/invoices/actions";

export default function PaymentRowActions({ id, code, status }: { id: string; code: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <span className="flex items-center gap-1">
      {status === "scheduled" && (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Mark processed"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await processPaymentAction(id);
              if (!res.ok) {
                toast.error(res.error ?? "Failed.");
                return;
              }
              toast.success("Payment processed");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </Button>
      )}
      <DeleteRowButton id={id} label={code} action={deletePaymentAction} />
    </span>
  );
}
