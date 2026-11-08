import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getViewer } from "@/lib/products/rankmax-ai/viewer";
import { listSeoNotifications, markSeoNotificationsRead } from "@/lib/products/rankmax-ai/notifications";

export const dynamic = "force-dynamic";

export default async function SeoNotificationsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/rankmax-ai/login");
  const { items } = await listSeoNotifications(viewer.userId, 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const v = await getViewer();
    if (v) await markSeoNotificationsRead(v.userId, entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const v = await getViewer();
    if (v) await markSeoNotificationsRead(v.userId);
  }

  return (
    <GenericPanelNotificationsPage
      panel="seo"
      live
      panelName="Search Engine Optimization"
      shortCode="SEO"
      description="Track technical SEO audit alerts, keyword ranking changes & backlink updates."
      initialNotifications={items.map((n) => ({ id: n._id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
