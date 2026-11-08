import "server-only";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { enabledModules } from "@/lib/platform/onboarding/state";
import { ENTITIES } from "@/lib/products/databrain-ai/catalog/registry";
import { grantedFields, intelAreas, type IntelAccessUser } from "@/lib/products/databrain-ai/catalog/access";
import { ISO_DAY, companyTimezone, isoDay } from "@/lib/products/databrain-ai/dates";
import type { CatalogView, EntityDef, FieldDef, LiveStats, RelationDef, ViewEntity } from "@/lib/products/databrain-ai/catalog/types";

/**
 * The per-request catalog the model sees: registry entities restricted to
 *  (1) products this company's plan includes and has switched on,
 *  (2) entities this user may read (`access.ts`), and
 *  (3) non-sensitive fields within the user's grant,
 * plus light live statistics (cached per company). The validator uses the very
 * same view, so the model cannot reach anything that is absent from it.
 */

const STATS_TTL_MS = 5 * 60 * 1000;
const MAX_LIVE_VALUES = 25;
const statsCache = new Map<string, { at: number; stats: LiveStats }>();

/** Test hook: forget cached statistics. */
export function clearCatalogStatsCache(): void {
  statsCache.clear();
}

async function liveStats(def: EntityDef, fields: ReadonlyMap<string, FieldDef>, companyId: string, tz: string): Promise<LiveStats> {
  const key = `${companyId}:${def.key}`;
  const hit = statsCache.get(key);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.stats;
  const stats: LiveStats = { count: null, from: null, to: null, values: {} };
  try {
    const col = (await getDb()).collection(def.collection);
    stats.count = await col.countDocuments(def.baseFilter, { maxTimeMS: 5000 });
    const dateField = def.dateField ? fields.get(def.dateField) : undefined;
    if (dateField && stats.count > 0) {
      const [row] = await col
        .aggregate<{ lo: unknown; hi: unknown }>([{ $match: { ...def.baseFilter, [dateField.path]: { $ne: null } } }, { $group: { _id: null, lo: { $min: `$${dateField.path}` }, hi: { $max: `$${dateField.path}` } } }], { maxTimeMS: 5000 })
        .toArray();
      const fmt = (v: unknown) => (v instanceof Date ? isoDay(v, tz) : typeof v === "string" && ISO_DAY.test(v.slice(0, 10)) ? v.slice(0, 10) : null);
      stats.from = fmt(row?.lo);
      stats.to = fmt(row?.hi);
    }
    for (const f of fields.values()) {
      if (!f.liveValues) continue;
      const values = (await col.distinct(f.path, def.baseFilter, { maxTimeMS: 5000 })).filter((v): v is string => typeof v === "string" && v.length > 0 && v.length <= 60);
      if (values.length > 0 && values.length <= MAX_LIVE_VALUES) stats.values[f.key] = values.sort();
    }
  } catch (err) {
    console.error(`[intelligence] stats for ${def.key} failed`, err);
  }
  statsCache.set(key, { at: Date.now(), stats });
  return stats;
}

export async function buildCatalogView(user: IntelAccessUser): Promise<CatalogView> {
  const [areas, entitlements, enabled, tz, companyId] = await Promise.all([intelAreas(user), getEntitlements(), enabledModules(), companyTimezone(), currentCompanyId()]);
  const moduleOn = (m: string) => (entitlements.modules === null || entitlements.modules.has(m)) && (!enabled || enabled.has(m));

  const visible = new Map<string, { def: EntityDef; fields: Map<string, FieldDef> }>();
  const restricted: { key: string; label: string }[] = [];
  for (const def of ENTITIES) {
    if (!moduleOn(def.module)) continue; // the company doesn't have this product: the entity simply does not exist for it
    const granted = grantedFields(def, areas);
    if (!granted) {
      restricted.push({ key: def.key, label: def.label });
      continue;
    }
    const fields = new Map<string, FieldDef>();
    for (const f of def.fields) {
      if (f.sensitive) continue;
      if (granted !== "all" && !granted.has(f.key)) continue;
      fields.set(f.key, f);
    }
    visible.set(def.key, { def, fields });
  }

  const entities = new Map<string, ViewEntity>();
  await Promise.all(
    [...visible.values()].map(async ({ def, fields }) => {
      const relations = new Map<string, RelationDef>();
      for (const r of def.relations) if (visible.has(r.to)) relations.set(r.key, r);
      entities.set(def.key, { def, fields, relations, stats: await liveStats(def, fields, companyId, tz) });
    }),
  );
  // Keep registry order for a stable prompt.
  const ordered = new Map([...ENTITIES].filter((d) => entities.has(d.key)).map((d) => [d.key, entities.get(d.key)!] as const));
  return { entities: ordered, restricted, timezone: tz, today: isoDay(new Date(), tz) };
}
