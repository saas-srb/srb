import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { listNotifications } from "@/lib/products/cohort-ai/notifications";
import { markTmsNotificationsReadAction, markAllTmsNotificationsReadAction } from "../notifications-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentTmsUser();
  if (!user) return null;
  const items = await listNotifications(user.id, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    await markTmsNotificationsReadAction(entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    await markAllTmsNotificationsReadAction();
  }
  return (
    <GenericPanelNotificationsPage
      panel="tms"
      live
      panelName="Training Management System"
      shortCode="Cohort AI"
      description="Course assignments, session reminders and certification updates."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body ?? "", createdAt: new Date(n.createdAt).toISOString(), read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
