import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getFeatureControls } from "@/lib/platform/feature-controls";
import { platformPdfStats } from "@/lib/notify/center/platform";
import { listPanels } from "@/lib/platform/panels/store";
import { PDF_TYPES } from "@/lib/pdf/catalog";
import DocumentControls from "./DocumentControls";

export const metadata: Metadata = { title: "Documents & PDFs" };
export const dynamic = "force-dynamic";

export default async function PlatformDocumentsPage() {
  const user = await requirePlatformPermission("settings.read");
  const [stats, controls, panels] = await Promise.all([platformPdfStats(), getFeatureControls(), listPanels().catch(() => [])]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Documents & PDFs"
        description="Every PDF the platform produces, with a sample in your own letterhead and how much each is used across all companies. Switch a kind of PDF off and nobody can produce it until you turn it back on."
        crumbs={[{ label: "Administration" }]}
      />
      <DocumentControls types={PDF_TYPES} stats={stats} controls={controls} products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))} canEdit={can(user, "settings.manage")} />
    </div>
  );
}
