import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { listNotifications } from "@/lib/products/spendiq/notifications";
import { markPrmsNotificationsReadAction, markAllPrmsNotificationsReadAction } from "../notifications-actions";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentPrmsUser();
  if (!user) return null;
  const items = await listNotifications(user.id, 100);
  async function markRead(entries: { id: string }[]) {
    "use server";
    await markPrmsNotificationsReadAction(entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    await markAllPrmsNotificationsReadAction();
  }
  return (
    <GenericPanelNotificationsPage
      panel="prms"
      live
      panelName="Procurement Management System"
      shortCode="SpendIQ"
      description="Requisitions, approvals, purchase orders and vendor updates."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body ?? "", createdAt: new Date(n.createdAt).toISOString(), read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
