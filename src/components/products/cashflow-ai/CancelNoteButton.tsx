"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Shared "Cancel" row action for credit notes and debit notes — same shape, different server action. */
export default function CancelNoteButton({ id, action }: { id: string; action: (id: string) => Promise<ActionResult> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function cancel() {
    startTransition(async () => {
      const res = await action(id);
      if (!res.ok) {
        toast.error(res.error ?? "Could not cancel.");
        return;
      }
      toast.success("Cancelled");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={cancel}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" data-icon="inline-start" />}
      Cancel
    </Button>
  );
}
