import "server-only";
import { listPanels } from "@/lib/platform/panels/store";
import { DEFAULT_PANELS } from "@/lib/platform/panels/types";
import { MODULE_COPY, type ModuleCopy } from "@/lib/platform/saas/content";
import { FEATURE_GROUPS, type FeatureGroup } from "@/lib/platform/saas/site";
import { selfRunProductName } from "@/lib/platform/saas/product-routes";

export interface FeatureModule extends ModuleCopy {
  key: string;
  name: string;
  description: string;
}

/** Every catalog product with marketing copy, named and described by the Product Registry, in registry order. */
export async function getFeatureModules(): Promise<FeatureModule[]> {
  const panels = await listPanels().catch(() => []);
  const byKey = new Map(DEFAULT_PANELS.map((panel) => [panel.key, panel]));
  for (const panel of panels) byKey.set(panel.key, panel);

  return [...byKey.values()]
    .filter((panel) => MODULE_COPY[panel.key])
    .map((panel) => ({ ...MODULE_COPY[panel.key], key: panel.key, name: selfRunProductName(panel.name), description: MODULE_COPY[panel.key].short ?? panel.description }));
}

/** The feature groups with their modules resolved (empty groups dropped). */
export async function getFeatureGroups(): Promise<(FeatureGroup & { items: FeatureModule[] })[]> {
  const mods = await getFeatureModules();
  const byKey = new Map(mods.map((m) => [m.key, m]));
  const used = new Set<string>();
  const groups = FEATURE_GROUPS.map((g) => {
    const items = g.modules.flatMap((k) => (byKey.get(k) ? (used.add(k), [byKey.get(k)!]) : []));
    return { ...g, items };
  });
  // A module the registry holds but no group names still belongs on the page.
  const rest = mods.filter((m) => !used.has(m.key));
  if (rest.length) groups.push({ id: "more", title: "More modules", lead: "Further modules in the platform.", icon: "layers", modules: rest.map((m) => m.key), items: rest });
  return groups.filter((g) => g.items.length > 0);
}
