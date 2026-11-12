import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getIntegrationsView, getPreviousProjectView } from "@/lib/platform/integrations";
import { getConfigView } from "@/lib/platform/config/store";
import IntegrationsForm from "./IntegrationsForm";
import ServerKeysForm from "./ServerKeysForm";
import PreviousProjectForm from "./PreviousProjectForm";
import BlobMigrationForm from "./BlobMigrationForm";
import { getDomainSyncOverview } from "@/lib/platform/domains/sync/run";
import { getBlobMigrationView } from "@/lib/storage/blob-migrate-run";

export const metadata: Metadata = { title: "Integrations" };

export default async function PlatformIntegrationsPage() {
  const user = await requirePlatformPermission("integrations.read");
  const [view, config, previous, blobMigration] = await Promise.all([getIntegrationsView(), getConfigView(), getPreviousProjectView(), getBlobMigrationView()]);
  const canManage = can(user, "integrations.manage");
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Integrations"
        description="Every key the platform needs, by area: email and domains, then AI, voice, push, file storage and upload safety. Razorpay keys are under Payments. The server environment only holds the database, encryption key, admin account, hosts and cron secret."
        crumbs={[{ label: "Administration" }]}
      />
      <PanelListFilters>
<IntegrationsForm key={view.updatedAt ?? "none"} view={view} adminEmail={user.email} />
<PreviousProjectForm key={previous.projectId + (previous.tokenLast4 ?? "") + (previous.connected?.at ?? "")} view={previous} canManage={canManage} movedAll={(await getDomainSyncOverview().catch(() => null))?.movedAll ?? false} />
<ServerKeysForm key={config.updatedAt ?? "none"} view={config} canManage={canManage} />
<BlobMigrationForm initial={blobMigration} canManage={canManage} />
</PanelListFilters>
    </div>
  );
}
