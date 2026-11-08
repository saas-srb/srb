"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellOff, CheckCheck, Clock, Settings2 } from "lucide-react";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { usePanelMeta } from "@/components/platform/PanelsProvider";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { cn } from "@/lib/utils";
import { onNotifySignal, refreshNotifyCounts, setLocalUnread, useNotifyState } from "@/lib/notify/client";
import type { NotifyPanel } from "@/lib/notify/panels";

export interface PanelNotificationItem {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  priority?: "normal" | "high";
  link?: string;
  /** Opaque value handed back to `onMarkRead` (e.g. which store the row came from). */
  meta?: string;
}

type MarkRead = (items: { id: string; meta?: string }[]) => Promise<unknown>;

export default function GenericPanelNotificationsPage({
  panel,
  panelName: fallbackName,
  shortCode: fallbackCode,
  description,
  initialNotifications,
  live: _live = false,
  onMarkRead,
  onMarkAllRead,
  unreadEvent,
}: {
  /** Product Registry key — the page then shows the registry's name, not the fallback text below. */
  panel?: string;
  panelName: string;
  shortCode: string;
  description: string;
  initialNotifications?: PanelNotificationItem[];
  /** Kept for callers that still pass it; the page always shows the product's real notifications (an empty list shows the empty state). */
  live?: boolean;
  /** Server actions that persist read state; without them read state is local to the page. */
  onMarkRead?: MarkRead;
  onMarkAllRead?: () => Promise<unknown>;
  /** window event fired with the new unread count so a bell elsewhere on the page can follow. */
  unreadEvent?: string;
}) {
  const router = useRouter();
  const meta = usePanelMeta(panel ?? "");
  const panelName = meta?.name ?? fallbackName;
  const shortCode = meta?.shortName ?? fallbackCode;
  const livePanel = (panel ?? null) as NotifyPanel | null;
  useNotifyState(livePanel === "portal" ? "portal" : "staff");
  // What the server sent is the truth; this page only remembers what the person marked read since, so a refresh never fights it.
  const [locallyRead, setLocallyRead] = useState<Set<string>>(new Set());
  const items: PanelNotificationItem[] = (initialNotifications ?? []).map((n) => (locallyRead.has(n.id) ? { ...n, read: true } : n));
  const unreadCount = items.filter((n) => !n.read).length;

  // A new notification (or a read elsewhere) for this product: re-render the server list at once.
  useEffect(() => {
    if (!livePanel) return;
    const panels: NotifyPanel[] = livePanel === "platform" ? ["platform", "workspace"] : [livePanel];
    return onNotifySignal(panels, () => router.refresh());
  }, [livePanel, router]);

  const announce = (nextUnread: number) => {
    if (unreadEvent) window.dispatchEvent(new CustomEvent(unreadEvent, { detail: nextUnread }));
    if (livePanel) { setLocalUnread(livePanel, nextUnread); setTimeout(refreshNotifyCounts, 600); }
  };

  const markAllRead = () => {
    setLocallyRead(new Set(items.map((n) => n.id)));
    announce(0);
    void onMarkAllRead?.()?.catch(() => {});
  };

  const openItem = (n: PanelNotificationItem) => {
    if (!n.read) {
      setLocallyRead(new Set([...locallyRead, n.id]));
      announce(Math.max(0, unreadCount - 1));
      void onMarkRead?.([{ id: n.id, meta: n.meta }])?.catch(() => {});
    }
    if (n.link) router.push(n.link);
  };

  return (
    <div className="space-y-4">
<PanelPageHeader
        title={<>{panelName} Notifications</>}
        description={description || `Updates, alerts and automations for ${panelName}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {panel === "workspace" || panel === "portal" ? (
              <Link href={`/${panel}/notifications/settings`} className={buttonVariants({ variant: "outline", size: "sm", className: "h-8 gap-1.5 text-xs" })}>
                <Settings2 className="size-3.5 text-primary" /> Settings
              </Link>
            ) : null}
            {unreadCount > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={markAllRead} className="h-8 gap-1.5 text-xs">
                <CheckCheck className="size-3.5 text-primary" /> Mark all read
              </Button>
            ) : null}
          </div>
        }
      />
<div className="space-y-4">

      <GlassCard interactive={false}>
        <CardContent className="pt-4 space-y-3">
          {/* Unread Counter Bar */}
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-2 px-1">
            <span>
              {unreadCount === 0 ? "All caught up" : `${unreadCount} unread notification${unreadCount > 1 ? "s" : ""}`}
            </span>
            <span>Showing recent {items.length} items</span>
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 p-8 text-center text-xs text-muted-foreground">
              <BellOff className="size-6 text-muted-foreground/60" />
              <p className="font-semibold text-foreground">No notifications yet</p>
              <p>You have no pending alerts or notifications for {panelName}.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/50">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full items-start gap-3 p-3.5 text-left transition-colors hover:bg-muted/50",
                      !n.read && "bg-primary/5 dark:bg-primary/10"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-1.5 size-2 shrink-0 rounded-full",
                        n.read ? "bg-transparent" : "bg-primary animate-pulse"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-xs font-semibold break-words", !n.read ? "text-foreground font-bold" : "text-muted-foreground")}>
                          {n.title}
                        </span>
                        {n.priority === "high" && (
                          <span className="rounded-full bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-destructive">
                            High Priority
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground break-words leading-relaxed">
                        {n.body}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-muted-foreground/80">
                        <Clock className="size-3" />
                        {new Date(n.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
