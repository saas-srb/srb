import { notFound } from "next/navigation";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { SettingsFilters, SettingsGroups } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { CONSOLE_STATUSES, filterCards, readFilter } from "@/components/settings/model";
import SidePanel from "@/components/products/commandos/SidePanel";
import { CONSOLE_CATEGORIES, PLATFORM_CARDS, consoleCardData, platformCard, usageLine } from "@/lib/platform/defaults/console-cards";
import { CONFIG_FIELDS } from "@/lib/platform/config/registry";
import ServerKeysForm from "@/app/(platform)/console/integrations/ServerKeysForm";
import PlatformDefaultTest from "@/app/(platform)/console/integrations/PlatformDefaultTest";

/** Development-only: Platform Console → Integrations on sample facts (404 in production). `?open=<card>`. Used by scripts/shot-console-defaults.ts. */
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const facts = (key: string) => ({ configured: ["openai", "twilio", "resend", "storage", "cron"].includes(key), usage: { usingDefault: 7, usingOwn: 2 } });
  const cards = filterCards(PLATFORM_CARDS.map((c) => consoleCardData(c, facts(c.key))), readFilter(sp, CONSOLE_STATUSES));
  const open = platformCard(typeof sp.open === "string" ? sp.open : "");
  const view = { encryptionConfigured: true, updatedAt: null, fields: Object.fromEntries(Object.values(CONFIG_FIELDS).map((f) => [f.key, { key: f.key, saved: f.key === "OPENAI_API_KEY", source: f.key === "OPENAI_API_KEY" ? ("db" as const) : ("none" as const), value: "", last4: f.key === "OPENAI_API_KEY" ? "9f2a" : null, unreadable: false }])) };
  return (
    <div className="space-y-6 bg-muted/70 p-4">
      <PlatformPageHeader title="Integrations" description="The platform's default for every outside service. A company that saves its own account uses that instead." crumbs={[{ label: "Administration" }]} />
      <SettingsFilters action="/dev-editor-harness/console-defaults" filter={readFilter(sp, CONSOLE_STATUSES)} categories={CONSOLE_CATEGORIES} statuses={CONSOLE_STATUSES} searchPlaceholder="Search by name: email, OpenAI, SMS, storage" />
      <SettingsGroups cards={cards} categories={CONSOLE_CATEGORIES} />
      {open && (
        <SidePanel title={open.name} description={open.description} closeHref="/dev-editor-harness/console-defaults" icon={<IconTile icon={consoleCardData(open, facts(open.key)).icon} />} badge={<StatusBadge status={consoleCardData(open, facts(open.key)).status} />}>
          {open.kind === "default" && <p className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm"><strong>Before you save:</strong> {usageLine(facts(open.key).usage)}. A change here reaches only the companies on the default.</p>}
          {open.note && <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{open.note}</p>}
          {open.panel.keys && <ServerKeysForm view={view} canManage keys={open.panel.keys} />}
          {open.tester && <PlatformDefaultTest cardKey={open.key} />}
        </SidePanel>
      )}
    </div>
  );
}
