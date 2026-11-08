import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentChatUser } from "@/lib/messenger-auth";
import { listNotifications, markRead as markChatRead, markAllRead } from "@/lib/products/huddle-ai/notifications";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentChatUser();
  if (!user) return null;
  const items = await listNotifications(user.id, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const u = await getCurrentChatUser();
    if (u) await markChatRead(entries.map((e) => e.id), u.id);
  }
  async function markAll() {
    "use server";
    const u = await getCurrentChatUser();
    if (u) await markAllRead(u.id);
  }
  return (
    <GenericPanelNotificationsPage
      panel="messenger"
      live
      panelName="Team Chat"
      shortCode="MSG"
      description="Mentions, messages, announcements, shared files and channel invites."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body ?? "", createdAt: new Date(n.createdAt).toISOString(), read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
