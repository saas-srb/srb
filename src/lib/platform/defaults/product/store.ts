import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { listActiveCompanyIds } from "@/lib/platform/tenancy/companies";
import { KEY_SEPARATOR, isKeyedCollection } from "@/lib/platform/tenancy/collections";
import { allSettings, getPath, parseSetting, type ProductSpec, type SettingsDoc, type Values } from "@/lib/platform/defaults/product/model";
import { productSpec } from "@/lib/platform/defaults/product/specs";

/**
 * The platform's product-setting defaults: one document per product in `platform_settings` (`product_defaults:<product>`), holding only the
 * settings the platform chose. Everything else follows the product's code default. Every change is audited.
 */
interface Stored { _id: string; values?: { k: string; v: unknown }[]; updatedAt?: Date; updatedBy?: string }
const col = async () => (await getPlatformDb()).collection<Stored>("platform_settings");
const idOf = (product: string) => `product_defaults:${product}`;

// Settings are read on busy paths: cached briefly. A save clears this process at once; other server instances follow within the time below.
const TTL_MS = 15_000;
const g = globalThis as unknown as { __productDefaults?: Map<string, { at: number; values: Values }> };
const cache = (g.__productDefaults ??= new Map());

export async function platformDefaults(product: string): Promise<Values> {
  const hit = cache.get(product);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values;
  const spec = productSpec(product);
  const known = new Map(spec ? allSettings(spec).map((s) => [s.key, s]) : []);
  const doc = await (await col()).findOne({ _id: idOf(product) });
  // A stored value that no longer passes the setting's rules (the setting changed since) is ignored.
  const values: Values = {};
  for (const { k, v } of doc?.values ?? []) {
    const def = known.get(k);
    const p = def ? parseSetting(def, v) : null;
    if (p?.ok) values[k] = p.value;
  }
  cache.set(product, { at: Date.now(), values });
  return values;
}

export type SaveDefaultsResult = { ok: true; changed: string[] } | { ok: false; error: string };

/** Replaces the platform's choices for a product: a setting left out goes back to the code default. */
export async function savePlatformDefaults(product: string, input: Record<string, unknown>, actorId: string): Promise<SaveDefaultsResult> {
  const spec: ProductSpec | null = productSpec(product);
  if (!spec) return { ok: false, error: "Unknown product." };
  const defs = new Map(allSettings(spec).map((s) => [s.key, s]));
  const values: Values = {};
  for (const [k, raw] of Object.entries(input ?? {})) {
    const def = defs.get(k);
    if (!def) return { ok: false, error: `"${k.slice(0, 60)}" can't have a platform default.` };
    const p = parseSetting(def, raw);
    if (!p.ok) return p;
    values[k] = p.value;
  }
  const effective = [...defs.values()].reduce<Values>((o, d) => ({ ...o, [d.key]: d.key in values ? values[d.key] : d.builtIn }), {});
  const problem = spec.check?.(effective);
  if (problem) return { ok: false, error: problem };
  cache.delete(product);
  const before = await platformDefaults(product);
  await (await col()).updateOne({ _id: idOf(product) }, { $set: { values: Object.entries(values).map(([k, v]) => ({ k, v })), updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  cache.delete(product);
  const changed = [...defs.keys()].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(values[k]));
  if (changed.length) await recordPlatformAudit({ actorId, action: "settings.product_defaults.update", target: { type: "platform_settings", id: idOf(product) }, details: { changed, cleared: changed.filter((k) => !(k in values)) } });
  return { ok: true, changed };
}

/** The documents of one product settings document across many companies (platform database, so no company scope is applied for us). */
export function companiesFilter(d: SettingsDoc, ids: string[]): Record<string, unknown> {
  if (isKeyedCollection(d.collection)) return { _id: { $in: ids.map((id) => `${id}${KEY_SEPARATOR}${d.docId}`) } };
  return { ...(d.filter ?? { _id: d.docId }), companyId: { $in: ids } };
}

export interface Usage { usingDefault: number; usingOwn: number }

/**
 * How many active companies follow the default and how many stored their own: per setting, and for the product as a whole ("own" = at least
 * one setting of it). Only field presence is read.
 */
export async function settingUsage(spec: ProductSpec): Promise<{ settings: Record<string, Usage>; product: Usage }> {
  const ids = await listActiveCompanyIds();
  const db = await getPlatformDb();
  const settings: Record<string, Usage> = {};
  const owners = new Set<string>();
  for (const d of spec.docs) {
    const filter = companiesFilter(d, ids);
    const rows = await db.collection(d.collection).find(filter as never, { projection: { companyId: 1, ...Object.fromEntries(d.settings.map((s) => [s.key, 1])) } }).toArray();
    for (const s of d.settings) {
      const mine = rows.filter((r) => getPath(r, s.key) !== undefined);
      for (const r of mine) owners.add(String(r.companyId));
      settings[s.key] = { usingOwn: mine.length, usingDefault: ids.length - mine.length };
    }
  }
  return { settings, product: { usingOwn: owners.size, usingDefault: ids.length - owners.size } };
}
