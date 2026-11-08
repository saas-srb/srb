"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellOff,
  CheckCheck,
  Check,
  Clock,
  ArrowRight,
  ExternalLink,
  Sparkles,
  Inbox,
  Filter,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { onNotifySignal } from "@/lib/notify/client";
import type { NotifyPanel } from "@/lib/notify/panels";
import type { FeedNotificationItem } from "@/app/api/notifications/feed/route";

function formatRelativeTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function NotificationDrawer({
  href,
  unread = 0,
  panel,
  actor = "staff",
  panelTitle,
}: {
  /** The full notifications page URL this product links to (e.g. `/dealflow-ai/notifications`) */
  href: string;
  unread?: number;
  panel?: string | null;
  actor?: "staff" | "portal";
  panelTitle?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FeedNotificationItem[]>([]);
  const [liveUnread, setLiveUnread] = useState(unread);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  // Keep unread in sync with prop updates
  useEffect(() => {
    setLiveUnread(unread);
  }, [unread]);

  // Load feed from API
  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (panel) q.set("panel", panel);
      if (actor === "portal") q.set("as", "portal");
      q.set("limit", "40");

      const res = await fetch(`/api/notifications/feed?${q.toString()}`, {
        headers: { "Cache-Control": "no-cache" },
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.items)) {
        setItems(data.items);
        if (typeof data.unreadCount === "number") {
          setLiveUnread(data.unreadCount);
        }
      }
    } catch (err) {
      console.error("Failed to load notifications:", err);
    } finally {
      setLoading(false);
    }
  }, [panel, actor]);

  // When drawer opens, fetch notifications
  useEffect(() => {
    if (open) {
      loadNotifications();
    }
  }, [open, loadNotifications]);

  // Realtime update when new notifications arrive via WebSocket/SSE
  useEffect(() => {
    if (!panel) return;
    const p = (panel === "platform" ? ["platform", "workspace"] : [panel]) as NotifyPanel[];
    return onNotifySignal(p, () => {
      if (open) {
        loadNotifications();
      }
    });
  }, [panel, open, loadNotifications]);

  // Mark single notification read
  const handleMarkRead = async (e: React.MouseEvent, item: FeedNotificationItem) => {
    e.stopPropagation();
    if (item.read) return;

    // Optimistic update
    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
    setLiveUnread((prev) => Math.max(0, prev - 1));

    try {
      await fetch("/api/notifications/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "markRead",
          ids: [item.id],
          panel,
          source: item.source,
          as: actor,
        }),
      });
    } catch {
      // rollback if needed
    }
  };

  // Mark all notifications read
  const handleMarkAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setLiveUnread(0);

    try {
      await fetch("/api/notifications/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "markAllRead",
          panel,
          as: actor,
        }),
      });
    } catch {
      // ignore
    }
  };

  // Click on a notification item
  const handleItemClick = (item: FeedNotificationItem) => {
    if (!item.read) {
      // Mark read
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setLiveUnread((prev) => Math.max(0, prev - 1));
      fetch("/api/notifications/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "markRead",
          ids: [item.id],
          panel,
          source: item.source,
          as: actor,
        }),
      }).catch(() => {});
    }

    setOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  // View All click
  const handleViewAll = () => {
    setOpen(false);
    router.push(href);
  };

  const filteredItems = useMemo(() => {
    if (filter === "unread") return items.filter((n) => !n.read);
    return items;
  }, [items, filter]);

  const count = liveUnread;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            title="Notifications"
            aria-label={count > 0 ? `Notifications (${count} unread)` : "Notifications"}
            data-unread={count}
            className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Bell className="size-4" />
            {count > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground animate-in zoom-in-50 duration-200">
                {count > 99 ? "99+" : count}
              </span>
            )}
          </button>
        }
      />

      <SheetContent
        side="right"
        className="flex h-full w-[min(26rem,calc(100vw-1rem))] flex-col gap-0 border-border/70 p-0 sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="border-b border-border/60 px-5 py-4 pr-12">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Bell className="size-4" />
              </span>
              <div>
                <SheetTitle className="text-base font-semibold leading-tight">
                  Notifications
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground">
                  {count > 0 ? `${count} unread update${count > 1 ? "s" : ""}` : "All caught up"}
                </SheetDescription>
              </div>
            </div>

            {count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleMarkAllRead}
                className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-primary"
                title="Mark all as read"
              >
                <CheckCheck className="size-3.5" />
                Mark all read
              </Button>
            )}
          </div>
        </SheetHeader>

        {/* Filter Tabs */}
        <div className="flex items-center justify-between border-b border-border/40 bg-muted/20 px-4 py-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === "all"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              All ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                filter === "unread"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Unread ({count})
            </button>
          </div>

          {panelTitle && (
            <span className="truncate text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              {panelTitle}
            </span>
          )}
        </div>

        {/* Notifications List */}
        <div className="flex-1 divide-y divide-border/30 overflow-y-auto">
          {loading && items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <p className="text-xs">Loading notifications...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center text-muted-foreground">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-muted/50 text-muted-foreground/60">
                <BellOff className="size-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">No notifications</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {filter === "unread"
                    ? "You have marked all notifications as read."
                    : "No updates or alerts right now. New activity will appear here."}
                </p>
              </div>
            </div>
          ) : (
            filteredItems.map((item) => (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={cn(
                  "group relative flex cursor-pointer items-start gap-3 p-3.5 text-left transition-colors hover:bg-muted/50",
                  !item.read ? "bg-primary/5" : "bg-transparent"
                )}
              >
                {/* Unread indicator */}
                <div className="mt-1 flex size-2 shrink-0 items-center justify-center">
                  {!item.read && (
                    <span className="size-2 rounded-full bg-primary ring-2 ring-background" />
                  )}
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className={cn(
                        "text-xs leading-snug text-foreground",
                        !item.read ? "font-semibold" : "font-medium text-foreground/90"
                      )}
                    >
                      {item.title}
                    </p>
                    <span className="shrink-0 text-[10px] text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(item.createdAt)}
                    </span>
                  </div>

                  {item.body && (
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                      {item.body}
                    </p>
                  )}

                  <div className="mt-2 flex items-center gap-2">
                    {item.sourceLabel && (
                      <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                        {item.sourceLabel}
                      </span>
                    )}

                    {item.priority === "high" && (
                      <span className="inline-flex items-center rounded-md bg-destructive/15 px-1.5 py-0.5 text-[9px] font-semibold text-destructive">
                        High Priority
                      </span>
                    )}

                    {item.link && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        Open <ExternalLink className="size-2.5" />
                      </span>
                    )}
                  </div>
                </div>

                {/* Mark as read button on hover */}
                {!item.read && (
                  <button
                    type="button"
                    onClick={(e) => handleMarkRead(e, item)}
                    title="Mark as read"
                    aria-label="Mark as read"
                    className="shrink-0 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
                  >
                    <Check className="size-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer: View All Notifications Button */}
        <div className="border-t border-border/60 bg-muted/20 p-3">
          <Button
            type="button"
            onClick={handleViewAll}
            className="w-full gap-2 text-xs font-semibold shadow-xs"
          >
            View All Notifications
            <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
