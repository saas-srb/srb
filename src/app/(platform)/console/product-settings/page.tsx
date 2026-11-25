import type { Metadata } from "next";
import Link from "next/link";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { SettingsFilters, SettingsGroups } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { CONSOLE_STATUSES, filterCards, readFilter } from "@/components/settings/model";
import SidePanel from "@/components/products/commandos/SidePanel";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { NO_DEFAULT_CARDS, PRODUCT_DEFAULTS_PATH, PRODUCT_DEFAULT_CATEGORIES, productDefaultCards } from "@/lib/platform/defaults/product/console-cards";
import { PRODUCT_SPECS, productSpec } from "@/lib/platform/defaults/product/specs";
import { platformDefaults, settingUsage } from "@/lib/platform/defaults/product/store";
import ProductDefaultsForm from "./ProductDefaultsForm";

export const metadata: Metadata = { title: "Product settings" };

export default async function PlatformProductSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePlatformPermission("defaults.read");
  const sp = await searchParams;
  const filter = readFilter(sp, CONSOLE_STATUSES);
  const facts = await Promise.all(PRODUCT_SPECS.map(async (p) => ({ key: p.key, values: await platformDefaults(p.key), usage: await settingUsage(p) })));
  const cards = productDefaultCards(Object.fromEntries(facts.map((f) => [f.key, Object.keys(f.values).length])), Object.fromEntries(facts.map((f) => [f.key, f.usage.product])));
  const open = typeof sp.open === "string" ? sp.open : "";
  const card = cards.find((c) => c.key === open);
  const spec = card ? productSpec(card.key) : null;
  const fact = facts.find((f) => f.key === open);
  const other = NO_DEFAULT_CARDS.find((c) => c.key === open);

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Product settings"
        description="The platform's default for product settings. A company that saves its own value keeps it; every other company follows the default shown here, and the built-in value where none is set."
        crumbs={[{ label: "Platform setup" }]}
      />
      <SettingsFilters action={PRODUCT_DEFAULTS_PATH} filter={filter} categories={PRODUCT_DEFAULT_CATEGORIES} statuses={CONSOLE_STATUSES} searchPlaceholder="Search by name: TalentOS, CashFlow" />
      <SettingsGroups cards={filterCards(cards, filter)} categories={PRODUCT_DEFAULT_CATEGORIES} />
      {card && (
        <SidePanel title={card.name} description={card.description} closeHref={PRODUCT_DEFAULTS_PATH} icon={<IconTile icon={card.icon} />} badge={<StatusBadge status={card.status} />}>
          {spec && fact ? (
            <ProductDefaultsForm key={`${spec.key}:${JSON.stringify(fact.values)}`} product={spec.key} docs={spec.docs} values={fact.values} usage={fact.usage.settings} canManage={can(user, "defaults.manage")} />
          ) : other ? (
            <>
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{other.note}</p>
              {other.links?.map((l) => <p key={l.href}><Link href={l.href} className="text-sm font-medium text-primary hover:underline">{l.label}</Link></p>)}
            </>
          ) : null}
        </SidePanel>
      )}
    </div>
  );
}
