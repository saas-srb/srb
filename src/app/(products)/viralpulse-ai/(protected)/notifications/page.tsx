import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getViewer } from "@/lib/products/viralpulse-ai/viewer";
import { listSmmsNotifications, markSmmsNotificationsRead } from "@/lib/products/viralpulse-ai/notifications";

export const dynamic = "force-dynamic";

export default async function SmmsNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const { items } = await listSmmsNotifications(viewer.userId, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const v = await getViewer();
    if (v) await markSmmsNotificationsRead(v.userId, entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const v = await getViewer();
    if (v) await markSmmsNotificationsRead(v.userId);
  }

  return (
    <GenericPanelNotificationsPage
      panel="smms"
      live
      panelName="Social Media Marketing"
      shortCode="ViralPulse"
      description="Track scheduled social post broadcasts, channel performance alerts & campaign updates."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
