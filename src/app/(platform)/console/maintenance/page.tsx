import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getMaintenanceState } from "@/lib/platform/maintenance-state";
import MaintenanceForm from "./MaintenanceForm";

export const metadata: Metadata = { title: "Maintenance" };
export const dynamic = "force-dynamic";

export default async function PlatformMaintenancePage() {
  await requirePlatformPermission("settings.read");
  const m = await getMaintenanceState();
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Maintenance"
        description="Announce and run maintenance for every company's website and app at once. It starts, counts down and ends on its own."
        crumbs={[{ label: "Administration" }]}
      />
      <MaintenanceForm initial={m} />
    </div>
  );
}
