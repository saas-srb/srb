import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import NotificationSettings from "@/components/pwa/NotificationSettings";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getPreferences, listDevices } from "@/lib/push/store";

export const metadata: Metadata = { title: "Notification settings", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Every signed-in person's own push preferences and devices (not just admins). */
export default async function NotificationSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  const [preferences, devices] = await Promise.all([getPreferences("staff", user.id), listDevices("staff", user.id)]);
  return (
    <div className="space-y-4 p-1">
      <PanelPageHeader
        breadcrumbs={[{ label: "Notifications", href: "/commandos/notifications" }, { label: "Settings" }]}
        title={<>Notification settings</>}
        description={<>Choose what reaches your phone or computer, and when.</>}
      />
      <div className="mx-auto max-w-3xl">
        <NotificationSettings initialPreferences={preferences} initialDevices={devices} />
      </div>
    </div>
  );
}
