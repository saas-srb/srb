import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { listNotifications } from "@/lib/products/sprintos/notifications";
import { markNotificationsReadAction, markAllNotificationsReadAction } from "../notifications-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentPmsUser();
  if (!user) return null;
  const items = await listNotifications(user.id, 100);
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
      panel="pms"
      live
      panelName="Project Management System"
      shortCode="SprintOS"
      description="Task assignments, deadlines, milestones, comments and timesheet updates."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body ?? "", createdAt: new Date(n.createdAt).toISOString(), read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
