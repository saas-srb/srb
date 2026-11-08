import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getViewer } from "@/lib/products/agentos/viewer";
import { listAibotsNotifications, markAibotsNotificationsRead } from "@/lib/products/agentos/notifications";

export const dynamic = "force-dynamic";

export default async function AibotsNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/agentos/login");
  const { items } = await listAibotsNotifications(viewer.userId, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const v = await getViewer();
    if (v) await markAibotsNotificationsRead(v.userId, entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const v = await getViewer();
    if (v) await markAibotsNotificationsRead(v.userId);
  }

  return (
    <GenericPanelNotificationsPage
      panel="aibots"
      live
      panelName="AgentOS Management"
      shortCode="AIBOTS"
      description="Track AI chatbot deployments, knowledge base index status & audit log alerts."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
