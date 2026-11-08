import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { DEFAULT_PANELS, PANEL_KEY_RE, PLATFORM_ONLY_KEYS, defaultAliases, whiteLabelProductName, type PanelMeta, type PanelRecord } from "@/lib/platform/panels/types";
import type { NavIcon } from "@/lib/products/commandos/nav";
import { productSlugFor } from "@/lib/platform/saas/product-routes";

export const PANELS_COLLECTION = "platform_panels";

/** Products listed here are never routable products of their own (reserved segments the registry must not claim). */
const RESERVED = new Set(["api", ...PLATFORM_ONLY_KEYS, "login", "signup", "admin", "workspace-not-found", "company-suspended", "product-unavailable"]);

const TTL_MS = 10_000;
let cache: { at: number; rows: PanelRecord[] } | null = null;
const disabledCache = new Map<string, { at: number; keys: Set<string> }>();

/** Drops cached registry data in THIS server instance (other instances catch up within a few seconds). */
export function forgetPanelCache(): void {
  cache = null;
  disabledCache.clear();
}

async function col() {
  return (await getPlatformDb()).collection<PanelRecord & { _id: string }>(PANELS_COLLECTION);
}

/** Every product in display order. Until the registry has been seeded, the built-in defaults stand in. */
export async function listPanels(): Promise<PanelRecord[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;
  const c = await col();
  let docs = await c.find({}).toArray();
  // A default product added to the code after the registry was first seeded appears on its own (unless an admin deleted
  // it: deletions leave a marker so it doesn't come back). Failures here never break the page.
  const known = new Set(docs.map((d) => d._id));
  const missing = DEFAULT_PANELS.filter((p) => !known.has(p.key));
  if (docs.length && missing.length) {
    await c.insertMany(missing.map((p) => ({ _id: p.key, ...p })), { ordered: false }).catch(() => {});
    docs = await c.find({}).toArray();
  }
  // Sync default products to updated branded software names if they still carry legacy names
  const defaultByKey = new Map(DEFAULT_PANELS.map((p) => [p.key, p]));
  if (docs.length) {
    const updates: Promise<unknown>[] = [];
    for (const d of docs) {
      const def = defaultByKey.get(d._id || d.key);
      if (def && (!d.name?.startsWith("SelfRun ") || d.name !== def.name)) {
        d.name = def.name;
        d.shortName = def.shortName;
        d.description = def.description;
        updates.push(c.updateOne({ _id: d._id }, { $set: { name: def.name, shortName: def.shortName, description: def.description } }).catch(() => {}));
      }
    }
    if (updates.length) {
      await Promise.all(updates);
    }
  }
  const rows = (docs.length ? docs.filter((d) => !(d as { deleted?: boolean }).deleted).map(({ _id, ...r }) => { const key = r.key ?? _id; return { ...r, key, route: r.route === `/${key}` ? `/${productSlugFor(key)}` : r.route, aliases: r.aliases ?? defaultAliases(key) }; }) : DEFAULT_PANELS)
    .filter((p) => !PLATFORM_ONLY_KEYS.includes(p.key))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  cache = { at: Date.now(), rows };
  return rows;
}

export async function getPanelRecord(key: string): Promise<PanelRecord | null> {
  return (await listPanels()).find((p) => p.key === key) ?? null;
}

/** Products a given company has been switched OFF for by the platform (company-specific deactivation). */
export async function disabledPanelKeys(companyId: string): Promise<Set<string>> {
  const hit = disabledCache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;
  const doc = await (await getPlatformDb()).collection<{ _id: string; disabledPanels?: string[] }>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { disabledPanels: 1 } });
  const keys = new Set(doc?.disabledPanels ?? []);
  disabledCache.set(companyId, { at: Date.now(), keys });
  return keys;
}

/** Product keys that are NOT available to this company: switched off globally or for the company. */
export async function unavailablePanelKeys(companyId: string): Promise<Set<string>> {
  const [panels, disabled] = await Promise.all([listPanels(), disabledPanelKeys(companyId)]);
  const out = new Set<string>(disabled);
  for (const p of panels) if (!p.active && !p.core) out.add(p.key);
  for (const p of panels) if (p.core) out.delete(p.key);
  return out;
}

export async function isPanelAvailable(companyId: string, key: string): Promise<boolean> {
  return !(await unavailablePanelKeys(companyId)).has(key);
}

/** The registry as the browser sees it for one company. */
export async function panelMetaFor(companyId: string | null): Promise<Record<string, PanelMeta>> {
  const [panels, off] = await Promise.all([listPanels(), companyId ? unavailablePanelKeys(companyId) : Promise.resolve(new Set<string>())]);
  return Object.fromEntries(
    panels.map((p) => [
      p.key,
      {
        key: p.key,
        name: whiteLabelProductName(p.name),
        shortName: whiteLabelProductName(p.shortName || p.name),
        description: whiteLabelProductName(p.description),
        headerTitle: whiteLabelProductName(p.headerTitle || p.name),
        headerDescription: whiteLabelProductName(p.headerDescription || p.description),
        icon: p.icon,
        route: p.route,
        order: p.order,
        core: p.core,
        aliases: p.aliases ?? [],
        available: !off.has(p.key),
      } satisfies PanelMeta,
    ]),
  );
}

// ── Admin (Platform Console) ───────────────────────────────────────────────────────────────────────────────────────
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export type PanelInput = Partial<Omit<PanelRecord, "key">> & { key: string };

export async function savePanel(input: PanelInput, mode: "create" | "update"): Promise<{ ok: true; panel: PanelRecord } | { ok: false; error: string }> {
  const key = clean(input.key, 30).toLowerCase();
  if (!PANEL_KEY_RE.test(key) || RESERVED.has(key)) return { ok: false, error: "Use 2–30 lowercase letters, numbers or dashes for the product key (it is the URL segment)." };
  await seedIfEmpty();
  const existingDoc = await (await col()).findOne({ _id: key });
  const existing = existingDoc && !(existingDoc as { deleted?: boolean }).deleted ? existingDoc : null;
  if (mode === "create" && existing) return { ok: false, error: "A product with that key already exists." };
  if (mode === "update" && !existing) return { ok: false, error: "That product no longer exists." };
  const prev = existing ?? null;

  const name = clean(input.name, 60);
  const description = clean(input.description, 200);
  if (!name) return { ok: false, error: "Give the product a name." };
  if (!description) return { ok: false, error: "Give the product a short description." };
  const routeInput = clean(input.route ?? `/${productSlugFor(key)}`, 80);
  const route = routeInput === `/${key}` ? `/${productSlugFor(key)}` : routeInput;
  if (!route.startsWith("/") || route.startsWith("//") || route.includes("\\")) return { ok: false, error: "The route must be a path on this site, like /hrms." };

  const core = prev?.core ?? false;
  const panel: PanelRecord = {
    key,
    name,
    shortName: clean(input.shortName, 30) || name,
    description,
    headerTitle: clean(input.headerTitle, 60),
    headerDescription: clean(input.headerDescription, 200),
    icon: (clean(input.icon, 20) || prev?.icon || "grid") as NavIcon,
    route,
    order: Number.isFinite(Number(input.order)) ? Math.max(0, Math.min(10_000, Math.round(Number(input.order)))) : (prev?.order ?? 999),
    core,
    aliases: [...new Set((Array.isArray(input.aliases) ? input.aliases : []).map((a) => clean(a, 60)).filter((a) => a.length >= 2))].slice(0, 20),
    active: core ? true : input.active !== false,
  };
  await (await col()).updateOne({ _id: key }, { $set: panel, $unset: { deleted: "" } } as never, { upsert: true });
  forgetPanelCache();
  return { ok: true, panel };
}

export async function setPanelActive(key: string, active: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const panel = await getPanelRecord(key);
  if (!panel) return { ok: false, error: "Unknown product." };
  if (panel.core && !active) return { ok: false, error: `${panel.name} is a core product and can't be switched off.` };
  await seedIfEmpty();
  await (await col()).updateOne({ _id: key }, { $set: { active } });
  forgetPanelCache();
  return { ok: true };
}

export async function deletePanel(key: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const panel = await getPanelRecord(key);
  if (!panel) return { ok: false, error: "Unknown product." };
  if (panel.core) return { ok: false, error: `${panel.name} is a core product and can't be deleted.` };
  await seedIfEmpty();
  // Keep a marker instead of the row, so the built-in defaults don't re-add a product an admin deliberately removed.
  await (await col()).updateOne({ _id: key }, { $set: { key, deleted: true } } as never, { upsert: true });
  const db = await getPlatformDb();
  await db.collection(COMPANIES_COLLECTION).updateMany({}, { $pull: { disabledPanels: key } } as never);
  forgetPanelCache();
  return { ok: true };
}

/** Company-specific switch: `active=false` hides and blocks the product for that company only. */
export async function setCompanyPanelActive(companyId: string, key: string, active: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const panel = await getPanelRecord(key);
  if (!panel) return { ok: false, error: "Unknown product." };
  if (panel.core && !active) return { ok: false, error: `${panel.name} is a core product and can't be switched off.` };
  const res = await (await getPlatformDb())
    .collection(COMPANIES_COLLECTION)
    .updateOne({ _id: companyId } as never, active ? ({ $pull: { disabledPanels: key } } as never) : ({ $addToSet: { disabledPanels: key } } as never));
  if (!res.matchedCount) return { ok: false, error: "Company not found." };
  forgetPanelCache();
  return { ok: true };
}

// ── Seeding ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function seedIfEmpty(): Promise<void> {
  const c = await col();
  if ((await c.estimatedDocumentCount()) === 0) await seedPanels();
}

/** Writes the starter registry. Existing products are kept as they are unless `reset` is set (then they return to the defaults). */
export async function seedPanels(opts: { reset?: boolean } = {}): Promise<{ inserted: number; reset: number; kept: number }> {
  const c = await col();
  // The Platform Console is the provider's alone; remove it if an earlier seed listed it.
  await c.deleteMany({ _id: { $in: [...PLATFORM_ONLY_KEYS] } });
  let inserted = 0;
  let reset = 0;
  let kept = 0;
  for (const p of DEFAULT_PANELS) {
    const exists = await c.findOne({ _id: p.key }, { projection: { _id: 1, deleted: 1 } });
    if (!exists) {
      try {
        await c.insertOne({ _id: p.key, ...p });
        inserted++;
      } catch (err) {
        // Another instance seeding at the same moment wrote it first.
        if ((err as { code?: number }).code !== 11000) throw err;
        kept++;
      }
    } else if (opts.reset || (exists as { deleted?: boolean }).deleted) {
      // "Restore defaults" / re-seeding also brings back a default product that had been deleted.
      await c.replaceOne({ _id: p.key }, { ...p });
      reset++;
    } else kept++;
  }
  forgetPanelCache();
  return { inserted, reset, kept };
}

const KEY_ALIASES: Record<string, string> = { teamchat: "messenger", admin: "workspace" };

/** Registry names by key (plus the older aliases some records carry) — for server code that builds a label. */
export async function panelNameMap(): Promise<(key: string, fallback?: string) => string> {
  const names = new Map((await listPanels()).map((p) => [p.key, whiteLabelProductName(p.name)]));
  return (key, fallback) => names.get(KEY_ALIASES[key] ?? key) ?? fallback ?? key;
}
