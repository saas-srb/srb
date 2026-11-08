import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { listPanels } from "@/lib/platform/panels/store";
import { listCompanyJobs } from "@/lib/cron/company-view";
import { listAnnouncements } from "@/lib/notify/center/announcements";
import ScheduledJobsList from "@/components/platform/cron/ScheduledJobsList";

export const metadata: Metadata = { title: "Scheduled jobs", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** What runs on its own, and when: a read-only list for the company's Directors. */
export default async function SchedulesPage() {
  await requireWorkspaceAccess("company.schedules");
  const [jobs, panels, announcements] = await Promise.all([listCompanyJobs(), listPanels().catch(() => []), listAnnouncements().catch(() => [])]);
  const scheduled = announcements.filter((a) => a.status === "scheduled");
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Scheduled jobs" }]}
          title={<>Scheduled jobs</>}
          description={<>Things your workspace does by itself, and when. Backups, reminders, notifications, billing checks and more. Times are shown in your own time zone as well as UTC, which is what the schedules use.</>}
        />
        <ScheduledJobsList jobs={jobs} products={Object.fromEntries(panels.map((p) => [p.key, p.shortName || p.name]))} scheduledAnnouncements={scheduled.map((a) => ({ id: a.id, title: a.title, at: a.scheduledAt }))} />
      </div>
    </div>
  );
}
