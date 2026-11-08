"use client";

import { Wifi, WifiOff } from "lucide-react";
import { useRealtime } from "@/components/products/huddle-ai/RealtimeProvider";
import { cn } from "@/lib/utils";

export function ConnectionPill() {
  const { connected } = useRealtime();
  return (
    <span
      className={cn(
        "hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium sm:inline-flex",
        connected
          ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
          : "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      )}
      title={connected ? "Realtime connected" : "Reconnecting…"}
    >
      {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
      {connected ? "Live" : "Reconnecting"}
    </span>
  );
}
