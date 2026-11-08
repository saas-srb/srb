"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActionResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

/**
 * Generic single-arg row-action button — same shape as `CancelNoteButton`,
 * generalized for Phase 7's close/reopen/delete actions so each new
 * settings page doesn't need its own near-duplicate client component.
 */
export default function SimpleActionButton({
  id,
  action,
  label,
  icon,
  successMessage,
  variant = "ghost",
  confirmMessage,
}: {
  id: string;
  action: (id: string) => Promise<ActionResult>;
  label: string;
  icon?: ReactNode;
  successMessage?: string;
  variant?: "ghost" | "outline" | "destructive" | "secondary";
  /** If set, a native `confirm()` prompt runs before the action fires. */
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    startTransition(async () => {
      const res = await action(id);
      if (!res.ok) {
        toast.error(res.reason ?? res.error ?? "Action failed.");
        return;
      }
      toast.success(successMessage ?? "Done");
      router.refresh();
    });
  }

  return (
    <Button type="button" size="sm" variant={variant} disabled={pending} onClick={run}>
      {pending ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : icon}
      {label}
    </Button>
  );
}
