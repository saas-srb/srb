"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Hash, Lock, Pin } from "lucide-react";
import { useRealtime } from "@/components/products/huddle-ai/RealtimeProvider";
import PresenceDot, { type PresenceStatus } from "@/components/products/huddle-ai/PresenceDot";
import { cn } from "@/lib/utils";

export interface ConversationRow {
  href: string;
  key: string;
  title: string;
  subtitle: string | null;
  timestamp: string | null;
  unread: number;
  pinned?: boolean;
  presence?: PresenceStatus;
  channelVisibility?: "public" | "private";
  kind: "dm" | "channel";
}

function relative(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d` : new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ConversationList({
  rows,
  header,
  action,
  emptyLabel,
}: {
  rows: ConversationRow[];
  header: string;
  action?: React.ReactNode;
  emptyLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { subscribe } = useRealtime();
  const lastRefresh = useRef(0);

  useEffect(
    () =>
      subscribe((event) => {
        if (["message", "read", "channel", "message_delete"].includes(event.kind)) {
          const now = Date.now();
          if (now - lastRefresh.current > 1200) {
            lastRefresh.current = now;
            router.refresh();
          }
        }
      }),
    [subscribe, router]
  );

  const sorted = [...rows].sort((a, b) => {
    if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
    return (b.timestamp ?? "").localeCompare(a.timestamp ?? "");
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/60 px-3">
        <span className="text-sm font-semibold text-foreground">{header}</span>
        {action}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sorted.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{emptyLabel}</p>}
        {sorted.map((row) => {
          const active = pathname === row.href;
          return (
            <Link
              key={row.key}
              href={row.href}
              className={cn(
                "mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                active ? "bg-primary/10 text-foreground" : "hover:bg-muted/60"
              )}
            >
              <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {row.kind === "channel" ? (
                  row.channelVisibility === "private" ? (
                    <Lock className="size-3.5" />
                  ) : (
                    <Hash className="size-3.5" />
                  )
                ) : (
                  row.title.slice(0, 1).toUpperCase()
                )}
                {row.kind === "dm" && row.presence && (
                  <PresenceDot status={row.presence} ring className="absolute -right-0.5 -bottom-0.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1">
                  <span className={cn("truncate text-sm", row.unread > 0 ? "font-semibold text-foreground" : "font-medium")}>
                    {row.title}
                  </span>
                  {row.pinned && <Pin className="size-3 shrink-0 text-muted-foreground" />}
                </span>
                {row.subtitle && (
                  <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span>
                )}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[10px] text-muted-foreground">{relative(row.timestamp)}</span>
                {row.unread > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                    {row.unread > 99 ? "99+" : row.unread}
                  </span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
