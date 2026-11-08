"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acknowledgeSopAction } from "@/app/(products)/playbook-ai/(protected)/actions";
import { formatIsoDate } from "@/lib/products/playbook-ai/constants";
import { formatDateTime } from "@/lib/utils";

/** "I have read and understood" — records acknowledgement of the CURRENT version. */
export default function AckPanel({
  sopId,
  version,
  mandatory,
  dueDate,
  acknowledgedAt,
  acknowledgedVersion,
  openChecklistItems,
}: {
  sopId: string;
  version: string;
  mandatory: boolean;
  dueDate: string | null;
  acknowledgedAt: string | null;
  acknowledgedVersion: string | null;
  openChecklistItems: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = !!acknowledgedAt && acknowledgedVersion === version;

  function ack() {
    setError(null);
    startTransition(async () => {
      const res = await acknowledgeSopAction(sopId, version);
      if (!res.ok) {
        setError(res.error);
        toast.error(res.error);
        return;
      }
      toast.success(`Acknowledged v${res.version}`);
      router.refresh();
    });
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm">
        <CheckCircle2 className="size-5 shrink-0 text-green-600 dark:text-green-400" />
        <span>
          <span className="font-semibold text-foreground">You acknowledged v{version}</span>
          <span className="ml-1 text-muted-foreground">on {formatDateTime(acknowledgedAt as string)}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3">
      <ShieldCheck className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold text-foreground">
          {mandatory ? "This is a mandatory SOP — " : ""}
          Acknowledge v{version}
        </p>
        <p className="text-xs text-muted-foreground">
          {acknowledgedVersion ? `You previously acknowledged v${acknowledgedVersion}. ` : ""}
          Confirm you have read and understood it{dueDate ? ` (due ${formatIsoDate(dueDate)})` : ""}.
          {openChecklistItems > 0 ? ` ${openChecklistItems} checklist item${openChecklistItems === 1 ? " is" : "s are"} still unticked.` : ""}
        </p>
        {error && <p role="alert" className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <Button type="button" onClick={ack} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : "I have read and understood"}
      </Button>
    </div>
  );
}
