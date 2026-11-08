import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getViewer } from "@/lib/products/playbook-ai/viewer";
import { listSopNotifications, markSopNotificationsRead } from "@/lib/products/playbook-ai/notifications";

export const dynamic = "force-dynamic";

export default async function SopNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/playbook-ai/login");
  const { items } = await listSopNotifications(viewer.userId, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const v = await getViewer();
    if (v) await markSopNotificationsRead(v.userId, entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const v = await getViewer();
    if (v) await markSopNotificationsRead(v.userId);
  }

  return (
    <GenericPanelNotificationsPage
      panel="sop"
      live
      panelName="Standard Operating Procedures"
      shortCode="SOP"
      description="Track SOP document reviews, compliance approvals & operational workflow revisions."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
