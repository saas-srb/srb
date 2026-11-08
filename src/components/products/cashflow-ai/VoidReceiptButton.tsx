"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { voidReceiptAction } from "@/app/(products)/cashflow-ai/(protected)/receipts/actions";

export default function VoidReceiptButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await voidReceiptAction(id);
      if (!res.ok) {
        toast.error(res.error ?? "Could not void this receipt.");
        return;
      }
      toast.success("Receipt voided");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={run}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" data-icon="inline-start" />}
      Void Receipt
    </Button>
  );
}
