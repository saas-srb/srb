import { notFound } from "next/navigation";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { SettingsFilters, SettingsGroups } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { CONSOLE_STATUSES, filterCards, readFilter } from "@/components/settings/model";
import SidePanel from "@/components/products/commandos/SidePanel";
import ProductDefaultsList from "@/components/settings/ProductDefaultsList";
import ProductDefaultsForm from "@/app/(platform)/console/product-settings/ProductDefaultsForm";
import { PRODUCT_DEFAULT_CATEGORIES, productDefaultCards } from "@/lib/platform/defaults/product/console-cards";
import { productSpec } from "@/lib/platform/defaults/product/specs";
import { describeValue } from "@/lib/platform/defaults/product/model";

/** Development-only: Platform Console → Product settings and a company's "Defaults" list on sample facts (404 in production). `?open=<product>`. */
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const path = "/dev-editor-harness/product-defaults";
  const cards = productDefaultCards({ talentos: 2 }, { talentos: { usingDefault: 7, usingOwn: 2 } });
  const open = typeof sp.open === "string" ? sp.open : "";
  const card = cards.find((c) => c.key === open);
  const spec = productSpec(open);
  const talentos = productSpec("talentos")!;
  const states = talentos.docs[0].settings.slice(0, 5).map((s, i) => ({ key: s.key, label: s.label, section: talentos.docs[0].title, value: describeValue(s, s.builtIn), defaultValue: describeValue(s, s.builtIn), source: i < 2 ? ("own" as const) : ("code" as const) }));
  return (
    <div className="space-y-6 bg-muted/70 p-4">
      <PlatformPageHeader title="Product settings" description="The platform's default for product settings. A company that saves its own value keeps it." crumbs={[{ label: "Administration" }]} />
      <SettingsFilters action={path} filter={readFilter(sp, CONSOLE_STATUSES)} categories={PRODUCT_DEFAULT_CATEGORIES} statuses={CONSOLE_STATUSES} searchPlaceholder="Search by name: TalentOS, CashFlow" />
      <SettingsGroups cards={filterCards(cards, readFilter(sp, CONSOLE_STATUSES))} categories={PRODUCT_DEFAULT_CATEGORIES} />
      <ProductDefaultsList product="talentos" states={states} />
      {card && spec && (
        <SidePanel title={card.name} description={card.description} closeHref={path} icon={<IconTile icon={card.icon} />} badge={<StatusBadge status={card.status} />}>
          <ProductDefaultsForm product={spec.key} docs={spec.docs} values={{ graceMinutes: 10 }} usage={Object.fromEntries(spec.docs.flatMap((d) => d.settings).map((s) => [s.key, { usingDefault: 7, usingOwn: 2 }]))} canManage />
        </SidePanel>
      )}
    </div>
  );
}
