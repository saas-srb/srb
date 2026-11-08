import type { Metadata } from "next";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { listBackups } from "@/lib/products/commandos/backups";
import { listDataEvents, listRestores } from "@/lib/products/commandos/data-lifecycle";
import BackupsManager from "./BackupsManager";

export const metadata: Metadata = { title: "Backups & data", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Backups (history, download, restore), the restore history, and the two ways to delete data. Director only. */
export default async function BackupsPage() {
  const user = await requireWorkspaceAccess("company.backups");
  const [backups, restores, events, company] = await Promise.all([listBackups(50), listRestores(30), listDataEvents(30), getCompany(await currentCompanyId())]);
  const d = company?.deletion;
  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Backups & data" }]} title={<>Backups &amp; data</>} description={<>Weekly backups you can download and restore, and the two ways to delete your data. Signed in as {user.email}.</>} />
        <BackupsManager backups={backups} restores={restores} events={events} deletion={d ? { purgeAt: d.purgeAt.toISOString(), requestedBy: d.requestedBy } : null} readOnly={!!d} />
      </div>
    </div>
  );
}
