"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Video, Check, X, HelpCircle, Loader2, PhoneOff, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  setRsvpAction,
  joinMeetingAction,
  cancelMeetingAction,
  endMeetingAction,
} from "@/app/(products)/huddle-ai/(protected)/meetings/actions";

type Rsvp = "yes" | "no" | "maybe" | null;

export default function MeetingControls({
  id,
  status,
  isHost,
  myRsvp,
}: {
  id: string;
  status: string;
  isHost: boolean;
  myRsvp: Rsvp;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rsvp, setRsvp] = useState<Rsvp>(myRsvp);
  const [error, setError] = useState<string | null>(null);

  const over = status === "ended" || status === "cancelled";

  function pickRsvp(value: Rsvp) {
    setRsvp(value);
    startTransition(() => void setRsvpAction(id, value));
  }

  function join() {
    setError(null);
    startTransition(async () => {
      const res = await joinMeetingAction(id);
      if (res?.error) setError(res.error);
    });
  }

  if (over) {
    return <p className="text-sm text-muted-foreground capitalize">This meeting has {status}.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={pending} onClick={join}>
          {pending ? <Loader2 className="size-4 animate-spin" data-icon="inline-start" /> : <Video className="size-4" data-icon="inline-start" />}
          {status === "live" ? "Join now" : "Start / join"}
        </Button>
        {isHost && (
          <>
            {status === "live" ? (
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => startTransition(async () => { await endMeetingAction(id); router.refresh(); })}
              >
                <PhoneOff className="size-3.5" data-icon="inline-start" />
                End meeting
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Cancel this meeting for everyone?")) return;
                  startTransition(async () => { await cancelMeetingAction(id); router.push("/huddle-ai/meetings"); });
                }}
              >
                <XCircle className="size-3.5" data-icon="inline-start" />
                Cancel
              </Button>
            )}
          </>
        )}
      </div>

      {!isHost && status === "scheduled" && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">RSVP:</span>
          {(
            [
              { v: "yes" as const, icon: Check, label: "Going" },
              { v: "maybe" as const, icon: HelpCircle, label: "Maybe" },
              { v: "no" as const, icon: X, label: "Can't" },
            ]
          ).map(({ v, icon: Icon, label }) => (
            <button
              key={v}
              type="button"
              onClick={() => pickRsvp(v)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                rsvp === v ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-muted"
              )}
            >
              <Icon className="size-3" />
              {label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
