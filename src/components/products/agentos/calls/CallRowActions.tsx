"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, LoaderCircle, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ActionButton from "@/components/products/agentos/ActionButton";
import { cancelCallAction, rescheduleCallAction, retryCallAction } from "@/lib/products/agentos/calls/actions";
import { checkScheduleInput, toZonedLocal } from "@/lib/products/agentos/calls/call-ui";
import { describeFailure, overrideReasonProblem, OVERRIDE_REASON_MAX } from "@/lib/products/agentos/calls/guard-messages";

const newKey = () => `retry-${typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`}`;

interface Props {
  callId: string;
  label: string;
  actions: { cancel: boolean; reschedule: boolean; retry: boolean };
  timeZone: string | null;
  isManager: boolean;
  agentId?: string;
}

/** Cancel / move / retry for one call. Retrying is always a person's decision: nothing in AgentOS retries a call by itself. */
export default function CallRowActions({ callId, label, actions, timeZone, isManager, agentId }: Props) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const retryKey = useRef(newKey());

  const retry = async () => {
    if (retryInFlight.current) return; // a double click must not call twice
    retryInFlight.current = true;
    setRetrying(true);
    try {
      const r = await retryCallAction(callId, retryKey.current);
      if (!r.ok) {
        retryKey.current = newKey();
        if (r.failure) {
          const a = describeFailure(r.failure, { isManager, agentId });
          return void toast.error(`${a.title}. ${a.message}`.slice(0, 280), a.hint ? { description: a.hint } : undefined);
        }
        return void toast.error(r.error);
      }
      toast.success("Calling again. Open the new call to follow it.");
      router.refresh();
    } catch {
      toast.error("We couldn't confirm that. Press Retry again - it won't call twice.");
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {actions.retry && (
        <Button type="button" size="sm" variant="outline" onClick={retry} disabled={retrying} aria-label={`Try ${label} again`}>
          {retrying ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}Retry
        </Button>
      )}
      {actions.reschedule && (
        <Button type="button" size="sm" variant="outline" onClick={() => setMoving(true)} disabled={!timeZone} title={timeZone ? undefined : "Set the workspace time zone first"} aria-label={`Move the call to ${label}`}>
          <CalendarClock className="size-3.5" />Reschedule
        </Button>
      )}
      {actions.cancel && (
        <ActionButton
          action={() => cancelCallAction(callId)}
          success="Call cancelled"
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive"
          confirm={{ title: "Cancel this scheduled call?", description: `${label} will not be called. You can schedule a new call any time.`, confirmLabel: "Cancel the call" }}
          aria-label={`Cancel the call to ${label}`}
        >
          <X className="size-3.5" />Cancel
        </ActionButton>
      )}
      {moving && timeZone && <RescheduleDialog callId={callId} label={label} timeZone={timeZone} isManager={isManager} onClose={() => setMoving(false)} />}
    </div>
  );
}

function RescheduleDialog({ callId, label, timeZone, isManager, onClose }: { callId: string; label: string; timeZone: string; isManager: boolean; onClose: () => void }) {
  const router = useRouter();
  const [when, setWhen] = useState(() => toZonedLocal(new Date(Date.now() + 60 * 60_000), timeZone));
  const [reason, setReason] = useState("");
  const [needsReason, setNeedsReason] = useState(false);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<{ title: string; message: string; hint: string | null } | null>(null);
  const check = checkScheduleInput(when, timeZone);
  const reasonProblem = needsReason ? overrideReasonProblem(reason) : null;

  const save = async () => {
    if (inFlight.current || !check.ok || reasonProblem) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const r = await rescheduleCallAction(callId, { scheduleAt: check.at.toISOString(), overrideReason: needsReason && reason.trim() ? reason.trim() : undefined });
      if (!r.ok) {
        if (r.failure) {
          const a = describeFailure(r.failure, { isManager });
          if (a.canOverride) setNeedsReason(true);
          return void setError({ title: a.title, message: a.message, hint: a.hint });
        }
        return void setError({ title: "Couldn't move the call", message: r.error, hint: null });
      }
      toast.success("Call moved");
      onClose();
      router.refresh();
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent>
        <DialogHeader className="p-5 pb-2">
          <DialogTitle>Move the call to {label}</DialogTitle>
          <DialogDescription>Pick a new time in {timeZone}. The calling rules are checked again for the new time.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3 px-5 pb-5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="rs-when">New date and time</Label>
            <Input id="rs-when" type="datetime-local" value={when} min={toZonedLocal(new Date(), timeZone)} onChange={(e) => setWhen(e.target.value)} disabled={pending} />
            {!check.ok && when && <p role="alert" className="text-[11px] text-destructive">{check.error}</p>}
          </div>
          {needsReason && (
            <div className="space-y-1.5">
              <Label htmlFor="rs-reason">Reason for calling outside the calling hours</Label>
              <Textarea id="rs-reason" rows={2} maxLength={OVERRIDE_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} />
              {reason && reasonProblem && <p role="alert" className="text-[11px] text-destructive">{reasonProblem}</p>}
            </div>
          )}
          {error && (
            <div role="alert" className="space-y-0.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-900 dark:text-rose-200">
              <p className="font-semibold">{error.title}</p>
              <p>{error.message}</p>
              {error.hint && <p className="opacity-90">{error.hint}</p>}
            </div>
          )}
          <DialogFooter className="flex-row justify-end gap-2 p-0">
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>Keep the current time</Button>
            <Button type="submit" disabled={pending || !check.ok || Boolean(reasonProblem)}>{pending ? <LoaderCircle className="size-4 animate-spin" /> : <CalendarClock className="size-4" />}Move call</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
