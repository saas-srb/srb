"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { LoaderCircle, PhoneOff, Radio } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import CallStatusBadge from "@/components/products/agentos/calls/CallStatusBadge";
import TestBadge from "@/components/products/agentos/calls/TestBadge";
import { endCallAction } from "@/lib/products/agentos/calls/actions";
import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import type { ExistingCallInfo } from "@/lib/products/agentos/calls/types";
import { formatDateTime } from "@/lib/utils";

/**
 * The call that is already there for this number: shown by the call dialog when the duplicate guard stops a new call, instead of only an error.
 * Open the live view, end it (Twilio hang-up for conference calls, ElevenLabs end for direct ones) or cancel it if it is only scheduled;
 * once it is over the person can call again.
 */
export default function ExistingCallCard({ call, onGone }: { call: ExistingCallInfo; onGone: () => void }) {
  const [pending, run] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const scheduled = call.status === "scheduled";
  const end = () =>
    run(async () => {
      setError(null);
      const r = await endCallAction(call.id);
      if (!r.ok) return void setError(r.error);
      toast.success(scheduled ? "Scheduled call cancelled" : "Call ended");
      onGone();
    });
  return (
    <div role="alert" className="space-y-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
      <p className="font-semibold">There is already a call to this number</p>
      <p className="flex flex-wrap items-center gap-2 text-xs">
        <CallStatusBadge status={call.status} />
        {call.testMode && <TestBadge />}
        <span>{call.agentName} · {PURPOSE_BY_KEY.get(call.purpose)?.label ?? call.purpose}</span>
        <span>· {scheduled ? "scheduled for" : "started"} {formatDateTime(call.at)}</span>
        <span>· by {call.mine ? "you" : call.startedBy ?? "a team member"}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {call.canLive && call.status === "in_progress" && (
          <Link href={`/agentos/calls/${call.id}/live`} target="_blank" className={buttonVariants({ size: "sm", variant: "outline" })}><Radio className="size-3.5" />Open live view</Link>
        )}
        {call.canEnd && (
          <Button type="button" size="sm" variant="destructive" disabled={pending} onClick={end}>
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : <PhoneOff className="size-3.5" />}End call
          </Button>
        )}
        {call.canCancel && (
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={end}>
            {pending ? <LoaderCircle className="size-3.5 animate-spin" /> : null}Cancel scheduled call
          </Button>
        )}
        {!call.canEnd && !call.canCancel && <span className="text-xs">Only the person who placed it, or a calls manager, can end it.</span>}
      </div>
      {error && <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>}
    </div>
  );
}
