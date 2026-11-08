import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listIncidents } from "@/lib/platform/status/incidents";
import { uptimePercent } from "@/lib/platform/status/shared";
import IncidentsManager from "./IncidentsManager";

export const metadata: Metadata = { title: "Incidents" };
export const dynamic = "force-dynamic";

export default async function PlatformIncidentsPage() {
  await requirePlatformPermission("settings.read");
  const incidents = await listIncidents(365);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Incidents"
        description="The record behind the public status page and the Uptime SLA. Add an incident when something goes wrong, post updates while you work on it, and resolve it when it ends."
        crumbs={[{ label: "Administration" }]}
      />
      <IncidentsManager incidents={incidents} uptime30={uptimePercent(incidents, 30)} uptime90={uptimePercent(incidents, 90)} />
    </div>
  );
}
