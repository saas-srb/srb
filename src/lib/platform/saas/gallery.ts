import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getFeatureModules } from "@/lib/platform/saas/modules";
import { GUIDE_FACTS } from "@/lib/platform/saas/guide-facts";
import { EXTRA_SCREENS } from "@/lib/platform/saas/site";

export interface GalleryItem {
  id: string;
  src: string;
  title: string;
  panelKey: string;
  panel: string;
  /** A headline capture (shown first) rather than a screen of a guide. */
  featured: boolean;
}

/** The headline captures that are not a product's own dashboard. */
const SPECIAL: Record<string, { title: string; panel: string }> = {
  branding: { title: "Branding", panel: "workspace" },
  domains: { title: "Custom domains", panel: "workspace" },
  apps: { title: "Apps & downloads", panel: "workspace" },
  automations: { title: "Automations", panel: "workspace" },
  "cms-theme": { title: "Website themes", panel: "cms" },
  "cms-push": { title: "Push notifications", panel: "cms" },
  chatbot: { title: "AI chatbot", panel: "cms" },
};

/** Every real screenshot of the product: the headline captures first, then the screen of every documented step. */
export async function getGallery(): Promise<{ items: GalleryItem[]; panels: { key: string; name: string; count: number }[] }> {
  const mods = await getFeatureModules();
  const name = new Map(mods.map((m) => [m.key, m.name]));
  const extras = new Map(Object.values(EXTRA_SCREENS).flat().map((e) => [e.key, e.title]));
  const dir = path.join(process.cwd(), "public", "selfrun", "screens");
  const keys = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".webp")).map((f) => f.slice(0, -5)).sort() : [];
  const items: GalleryItem[] = [];
  const seen = new Set<string>();
  for (const k of keys) {
    const sp = SPECIAL[k];
    const ex = extras.get(k);
    const panelKey = sp?.panel ?? (name.has(k) ? k : k.split("-")[0]);
    const panel = name.get(panelKey);
    if (!panel) continue;
    const title = sp?.title ?? ex ?? `${panel} — dashboard`;
    seen.add(`${panelKey}|${title.toLowerCase()}`);
    items.push({ id: `s-${k}`, src: `/selfrun/screens/${k}.webp`, title, panelKey, panel, featured: true });
  }
  for (const [pk, routes] of Object.entries(GUIDE_FACTS)) {
    const panel = name.get(pk);
    if (!panel) continue;
    for (const [rk, f] of Object.entries(routes)) {
      const sig = `${pk}|${f.title.toLowerCase()}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      items.push({ id: `g-${pk}-${rk}`, src: `/selfrun/guide/${pk}/${rk}.webp`, title: f.title, panelKey: pk, panel, featured: false });
    }
  }
  const order = new Map(mods.map((m, i) => [m.key, i]));
  items.sort((a, b) => Number(b.featured) - Number(a.featured) || (order.get(a.panelKey) ?? 99) - (order.get(b.panelKey) ?? 99));
  const counts = new Map<string, number>();
  for (const i of items) counts.set(i.panelKey, (counts.get(i.panelKey) ?? 0) + 1);
  const panels = mods.map((m) => ({ key: m.key, name: m.name, count: counts.get(m.key) ?? 0 }));
  return { items, panels };
}
