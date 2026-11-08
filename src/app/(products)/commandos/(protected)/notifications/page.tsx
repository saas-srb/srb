import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listWorkspaceNotifications } from "@/lib/products/commandos/notifications";
import { hubMarkAllReadAction, hubMarkReadAction } from "@/app/(products)/commandos/hub-actions";

/** The signed-in person's notifications from every source — see `lib/commandos/notifications.ts` (lives under the Staff Hub layout so it keeps the hub's sidebar and header). */
export default async function HubNotificationsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  const items = await listWorkspaceNotifications(user, 100, { sweep: true });

  async function markRead(entries: { id: string; meta?: string }[]) {
    "use server";
    for (const e of entries) await hubMarkReadAction(e.id, e.meta);
  }
  async function markAll() {
    "use server";
    await hubMarkAllReadAction();
  }
  return (
    <GenericPanelNotificationsPage
      panel="workspace"
      live
      panelName="Workspace"
      shortCode="WS"
      description="Updates sent to you by your workspace's automations and, for company managers, by every product."
      unreadEvent="hub:unread"
      initialNotifications={items.map((n) => ({
        id: n.id,
        meta: n.source,
        title: n.sourceLabel ? `${n.title} · ${n.sourceLabel}` : n.title,
        body: n.body ?? "",
        createdAt: new Date(n.createdAt).toISOString(),
        read: n.read,
        priority: n.priority === "high" ? "high" : "normal",
        link: n.url ?? undefined,
      }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
