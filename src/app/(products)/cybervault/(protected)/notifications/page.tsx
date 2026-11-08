import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getViewer } from "@/lib/products/cybervault/viewer";
import { listDlmsNotifications, markDlmsNotificationsRead } from "@/lib/products/cybervault/notifications";

export const dynamic = "force-dynamic";

export default async function DlmsNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/cybervault/login");
  const { items } = await listDlmsNotifications(viewer.userId, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const v = await getViewer();
    if (v) await markDlmsNotificationsRead(v.userId, entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const v = await getViewer();
    if (v) await markDlmsNotificationsRead(v.userId);
  }

  return (
    <GenericPanelNotificationsPage
      panel="dlms"
      live
      panelName="Document Lifecycle Management"
      shortCode="CyberVault"
      description="Track secure document vault uploads, file expiration warnings & access permission alerts."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
