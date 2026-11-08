import type { MetaClient } from "./client";

/**
 * Targeting search (Meta `GET /search`) and audience/delivery helpers. Results are cached in memory per scope (the company's ad account)
 * for an hour so typing in a picker does not spend the account's rate limit.
 */

export interface TargetingOption {
  id: string;
  name: string;
  /** Path of the option in Meta's taxonomy, when given. */
  path?: string[];
  audienceLower?: number;
  audienceUpper?: number;
  /** Demographics: the targeting key it belongs under. */
  kind?: string;
}
export interface GeoOption {
  key: string;
  name: string;
  type: string;
  countryCode?: string;
  countryName?: string;
  region?: string;
  regionId?: number;
  supportsCity?: boolean;
  supportsRegion?: boolean;
}
export interface LocaleOption {
  id: number;
  name: string;
}

const TTL = 60 * 60_000;
const MAX = 500;
const cache = new Map<string, { at: number; value: unknown }>();
export function clearSearchCache(): void {
  cache.clear();
}
async function cached<T>(scope: string, key: string, fn: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const k = `${scope}|${key}`;
  const hit = cache.get(k);
  if (hit && now() - hit.at < TTL) return hit.value as T;
  const value = await fn();
  if (cache.size >= MAX) cache.delete(cache.keys().next().value as string);
  cache.set(k, { at: now(), value });
  return value;
}

export type TargetingClass = "interests" | "behaviors" | "life_events" | "industries" | "income" | "family_statuses";

interface RawOpt {
  id?: string;
  name?: string;
  path?: string[];
  audience_size?: number;
  audience_size_lower_bound?: number;
  audience_size_upper_bound?: number;
  type?: string;
}
const mapOpt = (r: RawOpt, kind?: string): TargetingOption | null =>
  r.id && r.name ? { id: String(r.id), name: r.name, path: r.path, audienceLower: r.audience_size_lower_bound ?? r.audience_size, audienceUpper: r.audience_size_upper_bound ?? r.audience_size, kind } : null;

export async function searchInterests(c: MetaClient, scope: string, q: string, limit = 25): Promise<TargetingOption[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  return cached(scope, `interest:${term.toLowerCase()}:${limit}`, async () => {
    const r = await c.get<{ data?: RawOpt[] }>("search", { type: "adinterest", q: term, limit });
    return (r.data ?? []).map((x) => mapOpt(x)).filter((x): x is TargetingOption => x !== null);
  });
}

export async function suggestInterests(c: MetaClient, scope: string, names: string[], limit = 25): Promise<TargetingOption[]> {
  const list = names.map((n) => n.trim()).filter(Boolean).slice(0, 20);
  if (!list.length) return [];
  return cached(scope, `isug:${list.join("|").toLowerCase()}:${limit}`, async () => {
    const r = await c.get<{ data?: RawOpt[] }>("search", { type: "adinterestsuggestion", interest_list: list, limit });
    return (r.data ?? []).map((x) => mapOpt(x)).filter((x): x is TargetingOption => x !== null);
  });
}

/** Behaviours and demographic classes are lists (the `q` parameter is ignored by Meta), so we filter by the typed text here. */
export async function listTargetingCategory(c: MetaClient, scope: string, cls: Exclude<TargetingClass, "interests">, q = ""): Promise<TargetingOption[]> {
  const all = await cached(scope, `cat:${cls}`, async () => {
    const r = await c.get<{ data?: RawOpt[] }>("search", { type: "adTargetingCategory", class: cls, limit: 1000 });
    return (r.data ?? []).map((x) => mapOpt(x, cls === "behaviors" ? undefined : cls)).filter((x): x is TargetingOption => x !== null);
  });
  const t = q.trim().toLowerCase();
  return (t ? all.filter((o) => o.name.toLowerCase().includes(t) || (o.path ?? []).join(" ").toLowerCase().includes(t)) : all).slice(0, 50);
}

export async function searchGeo(c: MetaClient, scope: string, q: string, types: ("country" | "region" | "city" | "zip")[] = ["country", "region", "city"], limit = 15): Promise<GeoOption[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  return cached(scope, `geo:${types.join(",")}:${term.toLowerCase()}:${limit}`, async () => {
    const r = await c.get<{ data?: Array<{ key?: string; name?: string; type?: string; country_code?: string; country_name?: string; region?: string; region_id?: number; supports_city?: boolean; supports_region?: boolean }> }>("search", { type: "adgeolocation", location_types: types, q: term, limit });
    return (r.data ?? []).filter((x) => x.key && x.name).map((x) => ({ key: String(x.key), name: x.name!, type: x.type ?? "", countryCode: x.country_code, countryName: x.country_name, region: x.region, regionId: x.region_id, supportsCity: x.supports_city, supportsRegion: x.supports_region }));
  });
}

export async function searchLocales(c: MetaClient, scope: string, q: string, limit = 15): Promise<LocaleOption[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  return cached(scope, `loc:${term.toLowerCase()}:${limit}`, async () => {
    const r = await c.get<{ data?: Array<{ key?: number; name?: string }> }>("search", { type: "adlocale", q: term, limit });
    return (r.data ?? []).filter((x) => typeof x.key === "number" && x.name).map((x) => ({ id: x.key!, name: x.name! }));
  });
}

/** Checks that interest names still exist (interests are retired by Meta over time). */
export async function validateInterests(c: MetaClient, names: string[]): Promise<{ name: string; valid: boolean; id?: string }[]> {
  if (!names.length) return [];
  const r = await c.get<{ data?: Array<{ name?: string; valid?: boolean; id?: string }> }>("search", { type: "adinterestvalid", interest_list: names });
  return (r.data ?? []).map((x) => ({ name: x.name ?? "", valid: x.valid === true, id: x.id }));
}

export interface DeliveryEstimate {
  ready: boolean;
  dailyActiveUsers: number | null;
  monthlyLower: number | null;
  monthlyUpper: number | null;
}

/** `GET /act_{id}/delivery_estimate`. Required by Meta: optimization_goal, targeting_spec. Node fields are not documented, so each is optional. */
export async function deliveryEstimate(c: MetaClient, actId: string, p: { optimizationGoal: string; targetingSpec: Record<string, unknown>; promotedObject?: Record<string, unknown> }): Promise<DeliveryEstimate> {
  const r = await c.get<{ data?: Array<{ estimate_ready?: boolean; estimate_dau?: number; estimate_mau_lower_bound?: number; estimate_mau_upper_bound?: number; estimate_mau?: number }> }>(`${actId}/delivery_estimate`, {
    optimization_goal: p.optimizationGoal,
    targeting_spec: p.targetingSpec,
    ...(p.promotedObject ? { promoted_object: p.promotedObject } : {}),
  });
  const d = r.data?.[0];
  return { ready: d?.estimate_ready !== false && Boolean(d), dailyActiveUsers: d?.estimate_dau ?? null, monthlyLower: d?.estimate_mau_lower_bound ?? d?.estimate_mau ?? null, monthlyUpper: d?.estimate_mau_upper_bound ?? d?.estimate_mau ?? null };
}
