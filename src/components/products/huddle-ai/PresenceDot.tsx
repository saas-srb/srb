"use client";

import { cn } from "@/lib/utils";

export type PresenceStatus = "online" | "away" | "busy" | "in_meeting" | "offline";

const DOT: Record<PresenceStatus, string> = {
  online: "bg-green-500",
  away: "bg-amber-500",
  busy: "bg-destructive",
  in_meeting: "bg-purple-500",
  offline: "bg-muted-foreground/40",
};

const LABEL: Record<PresenceStatus, string> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  in_meeting: "In a meeting",
  offline: "Offline",
};

export function presenceLabel(status: PresenceStatus): string {
  return LABEL[status];
}

export default function PresenceDot({
  status,
  className,
  ring = false,
}: {
  status: PresenceStatus;
  className?: string;
  /** Add a background-colored ring — for dots overlaid on an avatar. */
  ring?: boolean;
}) {
  return (
    <span
      aria-label={LABEL[status]}
      title={LABEL[status]}
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full",
        DOT[status],
        ring && "ring-2 ring-background",
        className
      )}
    />
  );
}
