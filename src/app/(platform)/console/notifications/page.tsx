import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { requirePlatformAccess } from "@/lib/platform/console/access";
import { listNotifications, markAllRead, markRead } from "@/lib/platform/notifications";

export const dynamic = "force-dynamic";

/** The platform team's own notifications — new support requests and customer replies land here. */
export default async function PlatformNotificationsPage() {
  const user = await requirePlatformAccess();
  const items = await listNotifications(user.id, 100);

  async function markOne(entries: { id: string }[]) {
    "use server";
    const u = await requirePlatformAccess();
    for (const e of entries) await markRead(u.id, e.id);
  }
  async function markEvery() {
    "use server";
    const u = await requirePlatformAccess();
    await markAllRead(u.id);
  }

  return (
    <GenericPanelNotificationsPage
      panel="platform"
      live
      panelName="Platform Administration"
      shortCode="ADMIN"
      description="New support requests, customer replies and other platform alerts."
      initialNotifications={items.map((n) => ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.url ?? undefined }))}
      onMarkRead={markOne}
      onMarkAllRead={markEvery}
    />
  );
}
