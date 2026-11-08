"use client";

import { useEffect, useId } from "react";
import { setLocalUnread, useNotifyState, useToastHost } from "@/lib/notify/client";
import NotificationToasts from "@/components/platform/NotificationToasts";
import NotificationDrawer from "@/components/platform/NotificationDrawer";

/** Tells the bell the unread count changed (fired by the notifications page after marking read). */
export const UNREAD_EVENT = "hub:unread";

/** The Staff Hub's notification bell: live unread count (follows the shared realtime stream), refreshed on focus and every minute. */
export default function NotificationBell({ initial }: { initial: number }) {
  const live = useNotifyState("staff");
  const id = useId();
  const host = useToastHost(id);
  const count = live.counts.workspace ?? initial;

  useEffect(() => {
    const onSet = (e: Event) => setLocalUnread("workspace", Number((e as CustomEvent<number>).detail) || 0);
    window.addEventListener(UNREAD_EVENT, onSet);
    return () => window.removeEventListener(UNREAD_EVENT, onSet);
  }, []);

  return (
    <>
      <NotificationDrawer
        href="/commandos/notifications"
        unread={count}
        panel="workspace"
        actor="staff"
        panelTitle="CommandOS"
      />
      {host && <NotificationToasts toasts={live.toasts} />}
    </>
  );
}
