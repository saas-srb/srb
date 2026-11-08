"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Video, Loader2 } from "lucide-react";
import { useScopeEvents } from "@/components/products/huddle-ai/RealtimeProvider";
import { scopeKey } from "@/lib/products/huddle-ai/event-key";
import type { MessageScope } from "@/components/products/huddle-ai/types";

/**
 * Shows "Meeting in progress · Join" whenever there's an active call in this
 * conversation and the viewer isn't already in it. Polls once on mount + reacts
 * to `call_state` start/end events.
 */
export default function JoinMeetingBanner({ scope }: { scope: MessageScope }) {
  const router = useRouter();
  const [callId, setCallId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const check = () => {
    fetch(`/api/huddle-ai/calls?scopeType=${scope.type}&scopeId=${scope.id}`)
      .then((r) => r.json())
      .then((j) => setCallId(j.call?._id ?? null))
      .catch(() => {});
  };

  useEffect(check, [scope.type, scope.id]);

  useScopeEvents(scopeKey(scope), (event) => {
    if (event.kind === "call_state") {
      const p = event.payload as { action?: string; callId?: string };
      if (p.action === "started") setCallId(p.callId ?? null);
      if (p.action === "ended") setCallId((cur) => (cur === p.callId ? null : cur));
    }
  });

  if (!callId) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-green-500/20 bg-green-500/10 px-4 py-2 text-sm">
      <span className="flex items-center gap-2 font-medium text-green-700 dark:text-green-300">
        <span className="flex size-2 animate-pulse rounded-full bg-green-500" />
        Meeting in progress
      </span>
      <button
        type="button"
        disabled={joining}
        onClick={() => {
          setJoining(true);
          router.push(`/huddle-ai/call/${callId}`);
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700"
      >
        {joining ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />}
        Join
      </button>
    </div>
  );
}
