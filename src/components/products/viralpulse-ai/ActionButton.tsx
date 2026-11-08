"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";

type Result = { ok: boolean; error?: string; id?: string };

/** Calls a server action (optionally behind a confirm dialog), toasts the outcome and refreshes. */
export default function ActionButton({
  action,
  children,
  confirm,
  success = "Done",
  variant = "outline",
  size = "sm",
  className,
  redirectTo,
  redirectPrefix,
  "aria-label": ariaLabel,
}: {
  action: () => Promise<Result>;
  children: ReactNode;
  confirm?: { title: string; description: string; confirmLabel?: string };
  success?: string;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "xs" | "icon-xs" | "icon-sm" | "default";
  className?: string;
  redirectTo?: string;
  /** Navigate to `${redirectPrefix}${result.id}` (e.g. after a duplicate). */
  redirectPrefix?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function go() {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) toast.error(res.error ?? "Could not complete that.");
      else {
        toast.success(success);
        if (redirectPrefix && res.id) router.push(`${redirectPrefix}${res.id}`);
        else if (redirectTo) router.push(redirectTo);
        else router.refresh();
      }
    });
  }

  const content = pending ? <Loader2 className="size-3.5 animate-spin" /> : children;
  if (!confirm) {
    return (
      <Button type="button" variant={variant} size={size} className={className} onClick={go} disabled={pending} aria-label={ariaLabel}>
        {content}
      </Button>
    );
  }
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button type="button" variant={variant} size={size} className={className} disabled={pending} aria-label={ariaLabel} />}>{content}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{confirm.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false); // the shared AlertDialogAction does not close its dialog itself
              go();
            }}
          >
            {confirm.confirmLabel ?? "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
