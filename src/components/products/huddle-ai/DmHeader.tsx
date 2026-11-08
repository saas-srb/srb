"use client";

import { useEffect, useState, useTransition } from "react";
import { Pin, PinOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import PresenceDot, { presenceLabel, type PresenceStatus } from "@/components/products/huddle-ai/PresenceDot";
import { useRealtime } from "@/components/products/huddle-ai/RealtimeProvider";
import StartCallButtons from "@/components/products/huddle-ai/call/StartCallButtons";
import { togglePinConversationAction } from "@/app/(products)/huddle-ai/(protected)/dm/actions";

function lastActive(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (t <= 0) return "";
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 2) return "active now";
  if (m < 60) return `active ${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `active ${h}h ago`;
  return `active ${new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export default function DmHeader({
  name,
  subtitle,
  presence,
  lastActiveAt,
  conversationId,
  peerUserId,
  pinned: pinnedInitial = false,
}: {
  name: string;
  subtitle: string | null;
  presence: PresenceStatus;
  lastActiveAt: string | null;
  conversationId: string;
  peerUserId: string;
  pinned?: boolean;
}) {
  const [status, setStatus] = useState<PresenceStatus>(presence);
  const [pinned, setPinned] = useState(pinnedInitial);
  const [, startTransition] = useTransition();
  const { subscribe } = useRealtime();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setStatus(presence), [presence]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.kind === "presence") {
          const p = event.payload as { userId?: string; status?: PresenceStatus };
          if (p.userId === peerUserId && p.status) setStatus(p.status);
        }
      }),
    [subscribe, peerUserId]
  );

  return (
    <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-4">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {name.slice(0, 1).toUpperCase()}
          <PresenceDot status={status} ring className="absolute -right-0.5 -bottom-0.5" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {presenceLabel(status)}
            {status === "offline" && lastActiveAt ? ` · ${lastActive(lastActiveAt)}` : ""}
            {subtitle ? ` · ${subtitle}` : ""}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <StartCallButtons scope={{ type: "dm", id: conversationId }} />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={pinned ? "Unpin conversation" : "Pin conversation"}
          onClick={() =>
            startTransition(async () => {
              const r = await togglePinConversationAction(conversationId);
              setPinned(r.pinned);
            })
          }
        >
          {pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
