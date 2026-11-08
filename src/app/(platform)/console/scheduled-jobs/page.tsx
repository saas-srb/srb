import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { alertEmails, listJobStatus, schedulerMode } from "@/lib/cron/status";
import { listPanels } from "@/lib/platform/panels/store";
import JobsTable from "./JobsTable";

export const metadata: Metadata = { title: "Cron jobs (scheduled jobs)" };
export const dynamic = "force-dynamic";

export default async function ScheduledJobsPage() {
  const user = await requirePlatformPermission("settings.read");
  const [jobs, panels, alerts] = await Promise.all([listJobStatus(), listPanels().catch(() => []), alertEmails()]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Cron jobs"
        description="Every job the platform runs on a schedule: what it does, when it runs (UTC), whether it ran when it was due and what it did last time. Pause a job, change its schedule, run it now and choose who is emailed when one fails. Each run is recorded for 30 days."
        crumbs={[{ label: "Administration" }]}
      />
      <JobsTable alerts={alerts} jobs={jobs} products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))} mode={await schedulerMode()} canRun={can(user, "settings.manage")} />
    </div>
  );
}
