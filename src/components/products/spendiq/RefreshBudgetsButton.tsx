"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { refreshBudgetsAction } from "@/app/(products)/spendiq/(protected)/(staff)/budgets/actions";

export default function RefreshBudgetsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await refreshBudgetsAction();
          toast.success("Consumption recalculated");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}
      Recalculate
    </Button>
  );
}
