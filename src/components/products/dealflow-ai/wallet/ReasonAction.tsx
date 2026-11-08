"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A small inline "click → type a reason → confirm" control for audited admin actions (reject / reverse / refund). The reason is mandatory and is stored on the ledger/referral row. */
export default function ReasonAction({
  label,
  action,
  needsReason = true,
  destructive = false,
}: {
  label: string;
  action: (reason: string) => Promise<{ error?: string }>;
  needsReason?: boolean;
  destructive?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();

  function run() {
    start(async () => {
      const res = await action(reason);
      if (res.error) return void toast.error(res.error);
      toast.success(`${label} done.`);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant={destructive ? "outline" : "secondary"} onClick={() => (needsReason ? setOpen(true) : run())} disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" className="h-8 w-44 rounded-lg border border-border bg-background px-2 text-xs outline-none focus:border-ring" autoFocus />
      <Button type="button" size="sm" variant={destructive ? "destructive" : "default"} onClick={run} disabled={pending || reason.trim().length < 5}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </span>
  );
}
