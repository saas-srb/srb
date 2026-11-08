import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/mongodb";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import { getCompanyBrand } from "@/lib/platform/branding";
import { writeBlockReason } from "@/lib/platform/billing/enforce";
import { listPanels } from "@/lib/platform/panels/store";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { listRules, logSummary } from "@/lib/notify/center/store";
import { getFeatureControls } from "@/lib/platform/feature-controls";
import { dispatchDue, listAnnouncements } from "@/lib/notify/center/announcements";
import NotificationCenter from "@/components/platform/notification-center/NotificationCenter";

export const metadata: Metadata = { title: "Notification center", robots: { index: false, follow: false } };

/** Every email, in-app and push notification this workspace sends: the list is in the database, per company. */
export default async function NotificationCenterPage() {
  await requireWorkspaceAccess("company.notifications");
  const controls = await getFeatureControls();
  // Anything scheduled that has come due goes out before the list is shown.
  if (!(await writeBlockReason())) await dispatchDue().catch(() => 0);
  const [rules, announcements, panels, summary, people, readOnly] = await Promise.all([
    listRules(),
    listAnnouncements(),
    listPanels().catch(() => []),
    logSummary(),
    (await getDb()).collection<{ email: string; name?: string }>("admin_users").find({ status: { $nin: BLOCKED_STATUSES } }, { projection: { email: 1, name: 1 } }).sort({ email: 1 }).limit(500).toArray(),
    writeBlockReason(),
  ]);
  const roles = [{ value: "super_admin", label: "Director" }, ...ROLE_GROUPS.flatMap((g) => g.roles.map((r) => ({ value: r.value, label: `${r.label} · ${g.module}` })))];

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
        <PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Notification center" }]}
          title={<>Notification center</>}
          description={<>Every email, in-app and push notification your workspace sends. Turn each on or off per channel, change its wording, send or schedule your own announcements and see what was delivered. Your automations are managed in <Link href="/commandos/settings/automations" className="underline">Automations</Link>.</>}
        />
        {!controls.notificationCenter ? (
          <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">The Notification center is turned off for your workspace by SelfRun. Your notifications keep being delivered as they are; contact support if you need to change them.</p>
        ) : null}
        {readOnly && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{readOnly}</p>}
        {controls.notificationCenter && <NotificationCenter
          rules={rules}
          products={panels.map((p) => ({ key: p.key, name: p.shortName || p.name }))}
          roles={roles}
          people={people.map((p) => ({ id: String((p as { _id: unknown })._id), label: p.name ? `${p.name} (${p.email})` : p.email }))}
          announcements={announcements}
          brand={(await getCompanyBrand().catch(() => null))?.name ?? "Your company"}
          summary={summary.last24h}
          canEdit={!readOnly}
          platformOff={controls.events}
        />}
      </div>
    </div>
  );
}
