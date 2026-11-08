import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getIntegrationsView } from "@/lib/platform/integrations";
import { getConfigView } from "@/lib/platform/config/store";
import IntegrationsForm from "./IntegrationsForm";
import ServerKeysForm from "./ServerKeysForm";

export const metadata: Metadata = { title: "Integrations" };

export default async function PlatformIntegrationsPage() {
  const user = await requirePlatformPermission("integrations.read");
  const [view, config] = await Promise.all([getIntegrationsView(), getConfigView()]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Integrations"
        description="Every key the platform needs, by area: email and domains, then AI, voice, push, file storage and upload safety. Razorpay keys are under Payments. The server environment only holds the database, encryption key, admin account, hosts and cron secret."
        crumbs={[{ label: "Administration" }]}
      />
      <PanelListFilters>
<IntegrationsForm key={view.updatedAt ?? "none"} view={view} adminEmail={user.email} />
<ServerKeysForm key={config.updatedAt ?? "none"} view={config} canManage={can(user, "integrations.manage")} />
</PanelListFilters>
    </div>
  );
}
