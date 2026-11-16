import type { Metadata } from "next";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import SidePanel from "@/components/products/commandos/SidePanel";
import { requireWorkspaceAccess, getWorkspaceNav } from "@/lib/products/commandos/access";
import { SETTINGS_SCREENS, SLUG_TO_PANEL, productStatus, type ProductFacts, type ProductStatus } from "@/lib/products/commandos/product-status";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { getSavedConnection } from "@/lib/platform/connections/store";
import { listPanels } from "@/lib/platform/panels/store";
import { connectionLabel } from "@/lib/platform/connections/cards";
import AgentosSettingsScreen from "./agentos/AgentosSettingsScreen";
import CashflowAiSettingsScreen from "./cashflow-ai/CashflowAiSettingsScreen";
import CohortAiSettingsScreen from "./cohort-ai/CohortAiSettingsScreen";
import CybervaultSettingsScreen from "./cybervault/CybervaultSettingsScreen";
import EvaliqSettingsScreen from "./evaliq/EvaliqSettingsScreen";
import PlaybookSettingsScreen from "./playbook-ai/PlaybookSettingsScreen";
import RankmaxSettingsScreen from "./rankmax-ai/RankmaxSettingsScreen";
import SitecraftSettingsScreen from "./sitecraft-ai/SitecraftSettingsScreen";
import SpendiqSettingsScreen from "./spendiq/SpendiqSettingsScreen";
import SprintosSettingsScreen from "./sprintos/SprintosSettingsScreen";
import TalentosSettingsScreen from "./talentos/TalentosSettingsScreen";
import ViralpulseSettingsScreen from "./viralpulse-ai/ViralpulseSettingsScreen";
import { SettingsFilters, SettingsGroups } from "@/components/settings/SettingsGrid";
import { IconTile, StatusBadge } from "@/components/settings/SettingsCard";
import { filterCards, readFilter, type SettingsCategory } from "@/components/settings/model";
import { productCardData, slugOf } from "@/components/settings/adapters";
import { PRODUCT_GROUPS, PRODUCT_GROUP_NOTES, SettingsLinkRow } from "./product-groups";

export const metadata: Metadata = { title: "Product settings", robots: { index: false, follow: false } };

const PRODUCT_SETTINGS_PATH = "/commandos/settings/products";

/** The product's existing settings screen, rendered inside the panel (nothing is duplicated: these are the same screens the old pages showed). */
function screenFor(key: string, sp: Record<string, string | string[] | undefined>) {
  const searchParams = Promise.resolve(sp as { tab?: string });
  switch (key) {
    case "talentos": return <TalentosSettingsScreen searchParams={searchParams} />;
    case "sprintos": return <SprintosSettingsScreen />;
    case "cohort-ai": return <CohortAiSettingsScreen />;
    case "cashflow-ai": return <CashflowAiSettingsScreen />;
    case "spendiq": return <SpendiqSettingsScreen />;
    case "agentos": return <AgentosSettingsScreen />;
    case "evaliq": return <EvaliqSettingsScreen />;
    case "viralpulse-ai": return <ViralpulseSettingsScreen searchParams={searchParams as never} />;
    case "rankmax-ai": return <RankmaxSettingsScreen />;
    case "cybervault": return <CybervaultSettingsScreen />;
    case "playbook-ai": return <PlaybookSettingsScreen />;
    case "sitecraft-ai": return <SitecraftSettingsScreen />;
    default: return null;
  }
}

export default async function AllProductSettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireWorkspaceAccess("company.products"); // Director-only item: anyone else sees the locked page inside this shell
  const sp = await searchParams;
  const open = typeof sp.open === "string" ? sp.open : "";
  const session = await getWorkspaceNav();
  const allowed = new Set(session?.nav.allowed ?? []);
  const [ai, google, ...social] = await Promise.all([
    resolveConnection("openai"), resolveConnection("google-service-account"),
    ...["meta", "google", "linkedin", "x"].map((k) => getSavedConnection(k)),
  ]);
  const facts: ProductFacts = { aiReady: Boolean(ai?.values.apiKey), googleReady: Boolean(google), socialConnected: social.some(Boolean) };
  const all = PRODUCT_GROUPS.flatMap((g) => g.products);
  const current = all.find((p) => p.key === open);

  const registry = await listPanels();
  const connections: Record<string, string[]> = {};
  const statuses: Record<string, ProductStatus> = {};
  const locked: Record<string, boolean> = {};
  const filter = readFilter(sp);
  const categories: SettingsCategory[] = PRODUCT_GROUPS.map((g) => ({ key: slugOf(g.label), title: g.label, description: PRODUCT_GROUP_NOTES[g.label] }));
  for (const product of all) {
    const panelKey = SLUG_TO_PANEL[product.key];
    statuses[product.key] = productStatus(product.key, facts);
    connections[product.key] = (registry.find((r) => r.key === panelKey)?.connections ?? []).filter((c) => c !== "storage").map(connectionLabel);
    locked[product.key] = panelKey && session ? !allowed.has(product.key === "resolveiq" ? "panel.support" : `product.${panelKey}`) : false;
  }

  const cardData = PRODUCT_GROUPS.flatMap((g) => g.products.map((p) => ({ ...productCardData({ key: p.key, name: p.name, description: p.description, group: slugOf(g.label), panelKey: SLUG_TO_PANEL[p.key], connections: connections[p.key] ?? [] }, statuses[p.key] ?? "ready", Boolean(locked[p.key])) })));
  const shown = filterCards(cardData, filter);
  const iconOf = new Map(all.map((p) => [p.key, p.icon]));
  const currentData = cardData.find((c) => c.key === current?.key);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-8">
        <PanelPageHeader
          breadcrumbs={[{ label: "Settings", href: "/commandos/settings" }, { label: "Product settings" }]}
          title={<>Product settings</>}
          description={<>Change how each product works.</>}
        />
        <SettingsFilters action={PRODUCT_SETTINGS_PATH} filter={filter} categories={categories} searchPlaceholder="Search by product name" />
        <SettingsGroups cards={shown} categories={categories} iconFor={(c) => iconOf.get(c.key)} />
      </div>

      {current && (
        <SidePanel title={`${current.name} settings`} description={current.description} closeHref={PRODUCT_SETTINGS_PATH} icon={currentData ? <IconTile icon={current.icon} /> : undefined} badge={currentData ? <StatusBadge status={currentData.status} /> : undefined}>
          {(SETTINGS_SCREENS as readonly string[]).includes(current.key) ? (
            screenFor(current.key, sp)
          ) : current.settings.length > 0 ? (
            <div className="divide-y divide-border/40">{current.settings.map((link) => <SettingsLinkRow key={link.href} link={link} />)}</div>
          ) : (
            <p className="text-sm text-muted-foreground">{current.name} has no settings of its own yet. Everything it needs comes from your Integrations and company settings.</p>
          )}
        </SidePanel>
      )}
    </div>
  );
}
