import type { Metadata } from "next";
import Link from "next/link";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { SettingsFilters, SettingsGroups } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { CONSOLE_STATUSES, filterCards, readFilter } from "@/components/settings/model";
import SidePanel from "@/components/products/commandos/SidePanel";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getIntegrationsView, getPreviousProjectView } from "@/lib/platform/integrations";
import { getConfigView } from "@/lib/platform/config/store";
import { CONSOLE_CATEGORIES, CONSOLE_PATH, PLATFORM_CARDS, consoleCardData, platformCard, usageLine } from "@/lib/platform/defaults/console-cards";
import { consoleFacts } from "@/lib/platform/defaults/console";
import { getDomainSyncOverview } from "@/lib/platform/domains/sync/run";
import { getBlobMigrationView } from "@/lib/storage/blob-migrate-run";
import IntegrationsForm from "./IntegrationsForm";
import ServerKeysForm from "./ServerKeysForm";
import PreviousProjectForm from "./PreviousProjectForm";
import BlobMigrationForm from "./BlobMigrationForm";
import PlatformDefaultTest from "./PlatformDefaultTest";

export const metadata: Metadata = { title: "Integrations" };

export default async function PlatformIntegrationsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePlatformPermission("integrations.read");
  const sp = await searchParams;
  const filter = readFilter(sp, CONSOLE_STATUSES);
  const facts = await consoleFacts();
  const cards = filterCards(PLATFORM_CARDS.map((c) => consoleCardData(c, facts[c.key])), filter);
  const open = platformCard(typeof sp.open === "string" ? sp.open : "");
  const canManage = can(user, "integrations.manage");

  let panel: React.ReactNode = null;
  if (open) {
    const p = open.panel;
    const [view, config, previous, blob, domains] = await Promise.all([
      p.email || p.domains ? getIntegrationsView() : null,
      p.keys ? getConfigView() : null,
      p.previousProject ? getPreviousProjectView() : null,
      p.blobMigration ? getBlobMigrationView() : null,
      p.previousProject ? getDomainSyncOverview().catch(() => null) : null,
    ]);
    const usage = facts[open.key].usage;
    panel = (
      <>
        {usage && <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"><strong>Before you save:</strong> {usageLine(usage)}. A change here reaches only the companies on the default; a company&apos;s own account is never changed.</p>}
        {open.note && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{open.note}</p>}
        {open.key === "razorpay" && <p className="text-sm">The platform&apos;s own Razorpay, used only to bill companies for their plan, is under <Link href="/console/payments" className="font-medium text-primary hover:underline">Payments</Link>.</p>}
        {view && canManage && <IntegrationsForm key={view.updatedAt ?? "none"} view={view} adminEmail={user.email} section={p.email ? "email" : "domains"} />}
        {view && !canManage && <p className="text-sm text-muted-foreground">You can see this card&apos;s status; changing it needs the &quot;Manage integrations&quot; permission.</p>}
        {config && p.keys && <ServerKeysForm key={`${open.key}:${config.updatedAt ?? "none"}`} view={config} canManage={canManage} keys={p.keys} />}
        {open.tester && canManage && <PlatformDefaultTest cardKey={open.key} />}
        {previous && <PreviousProjectForm key={previous.projectId + (previous.tokenLast4 ?? "") + (previous.connected?.at ?? "")} view={previous} canManage={canManage} movedAll={domains?.movedAll ?? false} />}
        {blob && <BlobMigrationForm initial={blob} canManage={canManage} />}
      </>
    );
  }

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Integrations"
        description="The platform's default for every outside service. A company that saves its own account uses that instead; without one it uses the default shown here. Product settings stay with each company."
        crumbs={[{ label: "Platform setup" }]}
      />
      <SettingsFilters action={CONSOLE_PATH} filter={filter} categories={CONSOLE_CATEGORIES} statuses={CONSOLE_STATUSES} searchPlaceholder="Search by name: email, OpenAI, SMS, storage" />
      <SettingsGroups cards={cards} categories={CONSOLE_CATEGORIES} />
      {open && (
        <SidePanel title={open.name} description={open.description} closeHref={CONSOLE_PATH} icon={<IconTile icon={consoleCardData(open, facts[open.key]).icon} />} badge={<StatusBadge status={consoleCardData(open, facts[open.key]).status} />}>{panel}</SidePanel>
      )}
    </div>
  );
}
