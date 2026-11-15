import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getSettings } from "@/lib/products/sitecraft-ai/settings";
import SettingsEditor from "@/components/products/sitecraft-ai/SettingsEditor";
import TrackingEditor from "@/components/products/sitecraft-ai/TrackingEditor";
import { getTrackingForEdit } from "@/lib/products/sitecraft-ai/tracking";

export default async function SitecraftSettingsScreen() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.products"); // Director-only item: anyone else sees the locked page inside this shell

  const [settings, tracking] = await Promise.all([getSettings(), getTrackingForEdit()]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "SiteCraft AI" },
        ]}
        title={<>SiteCraft AI Settings</>}
        description={<>Global settings. Brand, contact details and social links are under Site Identity.</>}
      />
      <SettingsEditor initial={settings} />
      <TrackingEditor initial={tracking} />
    </div>
  );
}
