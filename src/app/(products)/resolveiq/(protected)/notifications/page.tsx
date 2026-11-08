import { redirect } from "next/navigation";
import GenericPanelNotificationsPage from "@/components/platform/panel/GenericPanelNotificationsPage";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { listPanelNotifications, markPanelRead } from "@/lib/notify";

export const dynamic = "force-dynamic";

/** Updates on this person's own requests (SelfRun AI replies and status changes). Each person sees only theirs. */
export default async function SupportNotificationsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  const items = await listPanelNotifications(user.id, "support", 100);

  async function markRead(entries: { id: string }[]) {
    "use server";
    const u = await getCurrentHubUser();
    if (u) await markPanelRead(u.id, "support", entries.map((e) => e.id));
  }
  async function markAll() {
    "use server";
    const u = await getCurrentHubUser();
    if (u) await markPanelRead(u.id, "support");
  }
  return (
    <GenericPanelNotificationsPage
      panel="support"
      panelName="Help & Support"
      shortCode="HELP"
      description="Replies and status updates on your support requests."
      initialNotifications={items.map((n) => ({ id: n.id, title: n.title, body: n.body, createdAt: n.createdAt, read: n.read, link: n.link ?? undefined, priority: n.priority === "high" ? "high" : "normal" }))}
      onMarkRead={markRead}
      onMarkAllRead={markAll}
    />
  );
}
