import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import NotificationSettings from "@/components/pwa/NotificationSettings";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getPreferences, listDevices } from "@/lib/push/store";
import { brandedMetadata } from "@/lib/platform/branding/metadata";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Notification settings · {brand} {product:portal}");

export default async function PortalNotificationSettingsPage() {
  const user = await guardPortalPage();
  const [preferences, devices] = await Promise.all([getPreferences("portal", user.id), listDevices("portal", user.id)]);
  return (
    <div className="space-y-4 p-1">
      <PanelPageHeader
        breadcrumbs={[{ label: "Notifications", href: "/clientos/notifications" }, { label: "Settings" }]}
        title={<>Notification settings</>}
        description={<>Choose what reaches your phone or computer, and when.</>}
      />
      <div className="mx-auto max-w-3xl">
        <NotificationSettings initialPreferences={preferences} initialDevices={devices} />
      </div>
    </div>
  );
}
