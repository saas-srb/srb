"use client";

import { useId } from "react";
import { useNotifyState, useToastHost } from "@/lib/notify/client";
import { panelFromHref, type NotifyPanel } from "@/lib/notify/panels";
import NotificationToasts from "@/components/platform/NotificationToasts";
import NotificationDrawer from "@/components/platform/NotificationDrawer";

/**
 * The topbar notification bell every product shares:
 * Clicking opens the Notification Drawer sidebar on the right.
 * Inside the drawer, clicking 'View All Notifications' navigates to the full notifications page (`href`).
 */
export default function PanelBellLink({
  href,
  unread = 0,
  panel,
  actor = "staff",
}: {
  href: string;
  unread?: number;
  panel?: NotifyPanel;
  actor?: "staff" | "portal";
}) {
  const key = panel ?? panelFromHref(href);
  const live = useNotifyState(actor);
  const id = useId();
  const host = useToastHost(id);
  const fromServer = key ? live.counts[key] : undefined;
  const count = fromServer ?? unread;

  return (
    <>
      <NotificationDrawer
        href={href}
        unread={count}
        panel={key ?? undefined}
        actor={actor}
        panelTitle={key ? key.toUpperCase() : undefined}
      />
      {host && <NotificationToasts toasts={live.toasts} />}
    </>
  );
}
