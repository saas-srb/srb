import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getFeatureControls } from "@/lib/platform/feature-controls";
import { deliveryTotals, platformEvents } from "@/lib/notify/center/platform";
import { listPanels } from "@/lib/platform/panels/store";
import NotificationControls from "./NotificationControls";

export const metadata: Metadata = { title: "Notification center" };
export const dynamic = "force-dynamic";

export default async function PlatformNotificationCenterPage() {
  const user = await requirePlatformPermission("settings.read");
  const [events, totals, controls, panels] = await Promise.all([platformEvents(), deliveryTotals(), getFeatureControls(), listPanels().catch(() => [])]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Notification center"
        description="Every email, in-app and push notification the platform can send, across all companies. Switch a channel off here and it stops for every company; each company can still turn channels off for itself in its own Notification center. Security and billing emails cannot be turned off."
        crumbs={[{ label: "Administration" }]}
      />
      <NotificationControls events={events} totals={totals} controls={controls} products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))} canEdit={can(user, "settings.manage")} />
    </div>
  );
}
