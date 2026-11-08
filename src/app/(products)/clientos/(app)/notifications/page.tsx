import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { listPortalNotifications, markPortalRead, markAllPortalRead } from "@/lib/products/clientos/notifications";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Notifications · {brand} {product:portal}");

export default async function NotificationsPage() {
  const user = await guardPortalPage();
  const items = await listPortalNotifications(user.id, 60);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const u = await guardPortalPage();
    await markPortalRead(entries.map((e) => e.id), u.id);
  }
  async function markAll() {
    "use server";
    const u = await guardPortalPage();
    await markAllPortalRead(u.id);
  }
  return (
    <GenericPanelNotificationsPage
      panel="portal"
      live
      panelName="Client Portal"
      shortCode="PORTAL"
      description="Updates on your projects, invoices, documents and support requests."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body ?? "", createdAt: new Date(n.createdAt).toISOString(), read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
