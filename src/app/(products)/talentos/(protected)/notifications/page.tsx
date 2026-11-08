import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { listNotifications } from "@/lib/products/talentos/notifications";
import { markNotificationsReadAction, markAllNotificationsReadAction } from "../../notifications-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = (await getCurrentHrmsUser())!;
  const { items } = await listNotifications(user, { page: 1, pageSize: 100 });

  async function markRead(entries: { id: string }[]) {
    "use server";
    await markNotificationsReadAction(entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    await markAllNotificationsReadAction();
  }
  return (
    <GenericPanelNotificationsPage
      panel="hrms"
      live
      panelName="Human Resource Management System"
      shortCode="TalentOS"
      description="Leave requests, new joiners, document expiry, birthdays and probation reminders."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body ?? "", createdAt: new Date(n.createdAt).toISOString(), read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
