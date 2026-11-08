import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getViewer } from "@/lib/products/evaliq/viewer";
import { listOtsNotifications, markOtsNotificationsRead } from "@/lib/products/evaliq/notifications";

export const dynamic = "force-dynamic";

export default async function OtsNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/evaliq/login");
  const { items } = await listOtsNotifications(viewer.userId, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const v = await getViewer();
    if (v) await markOtsNotificationsRead(v.userId, entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const v = await getViewer();
    if (v) await markOtsNotificationsRead(v.userId);
  }

  return (
    <GenericPanelNotificationsPage
      panel="ots"
      live
      panelName="Online Test System"
      shortCode="EvalIQ"
      description="Track candidate exam submissions, test result evaluation alerts & question bank updates."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
