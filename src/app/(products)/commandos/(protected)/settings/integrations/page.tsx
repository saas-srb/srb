import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { CONNECTION_PROVIDERS, HIDDEN_FROM_COMPANIES } from "@/lib/platform/connections/catalog";
import { listConnectionViews } from "@/lib/platform/connections/store";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { isPlatformEncryptionConfigured } from "@/lib/platform/crypto";
import { listCompanyIntegrations } from "@/lib/products/commandos/company";
import { getTrackingForEdit } from "@/lib/products/sitecraft-ai/tracking";
import { getIntegrationsStatus } from "@/lib/dealflow-ai/integrations";
import DealFlowSyncStatus from "@/components/platform/DealFlowSyncStatus";
import ConnectionsHub, { type HubProvider } from "./ConnectionsHub";

export const metadata: Metadata = { title: "Integrations", robots: { index: false, follow: false } };

/** One place for every third-party service the workspace uses. Configure once; every product and automation uses it. */
export default async function IntegrationsPage() {
  await requireWorkspaceAccess("company.integrations");
  const [views, managed, tracking, dealFlowStatus] = await Promise.all([
    listConnectionViews(),
    listCompanyIntegrations().catch(() => []),
    getTrackingForEdit().catch(() => null),
    getIntegrationsStatus(),
  ]);
  const managedByKey = new Map<string, (typeof managed)[number]>(managed.map((m) => [m.key, m]));
  const trackingOn = !!tracking && (tracking.ga4Ids.length + tracking.gtmIds.length + tracking.clarityIds.length + tracking.metaPixelIds.length + tracking.scripts.length > 0 || !!tracking.tawkId);

  const providers: HubProvider[] = [];
  for (const p of CONNECTION_PROVIDERS.filter((x) => !HIDDEN_FROM_COMPANIES.includes(x.key))) {
    const view = views[p.key];
    let environment = false;
    let statusNote: string | null = null;
    let connected = false;
    if (p.managedElsewhere) {
      const m = managedByKey.get(p.key === "domains" ? "domain" : p.key);
      if (m) {
        connected = m.connected;
        statusNote = m.status;
      } else if (p.key === "website-tracking") {
        connected = trackingOn;
        statusNote = trackingOn ? "Tracking is on" : "Nothing set up yet";
      }
    } else {
      connected = !!view?.saved;
      // Not connected: SelfRun's own account is used for email, push and the services it provides; the card says so.
      if (!connected) environment = p.group === "email" || p.key === "vapid" || (await resolveConnection(p.key))?.source === "platform";
    }
    providers.push({
      key: p.key, name: p.name, group: p.group, description: p.description, usedBy: p.usedBy, fields: p.fields, docsUrl: p.docsUrl ?? null, note: p.note ?? null,
      testable: !!p.testable, managedElsewhere: p.managedElsewhere ?? null, connected, environment, statusNote,
      saved: view ? { values: view.values, secrets: view.secrets, lastTest: view.lastTest, updatedAt: view.updatedAt } : null,
    });
  }

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Integrations" }]}
          title={<>Integrations</>}
          description={<>Connect your own accounts once — email, AI, voice, WhatsApp, push, social, Google and more. Anything you connect is used by your workspace only; anything you leave unconnected runs on SelfRun&apos;s account and counts against your plan. Keys are encrypted and are never shown again.</>}
        />
<div className="space-y-6">
        <ConnectionsHub providers={providers} encryptionReady={isPlatformEncryptionConfigured()} />
        <section id="dealflow-sync" className="space-y-4 border-t border-border/50 pt-6">
          <div>
            <h2 className="text-xl font-semibold">DealFlow AI integrations &amp; sync</h2>
            <p className="text-sm text-muted-foreground">Review DealFlow connection status, lead sources and careers applications here in CommandOS.</p>
          </div>
          <DealFlowSyncStatus integrations={dealFlowStatus} />
        </section>
      </div>
</div>
    </div>
  );
}
