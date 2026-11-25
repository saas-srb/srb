/**
 * The one model behind PRODUCT SETTINGS DEFAULTS (pure, client-safe). Every product setting resolves the same way:
 *
 *     the company's own stored value  >  the platform's default (Console → Product settings)  >  the product's code default
 *
 * "Own" means the field is stored in the company's settings document. "Reset to default" removes it. A company that never stored a field follows
 * the platform default, and the code default when the platform set none, so with no platform default behaviour is exactly the code's.
 */
export type SettingType = "boolean" | "integer" | "number" | "text" | "time" | "select" | "list" | "days" | "rates";

export interface SettingDef {
  /** The path in the product's stored settings document, e.g. `graceMinutes` or `crawl.maxPages`. */
  key: string;
  label: string;
  type: SettingType;
  /** The built-in value, shown in the Console. At run time the product's own code default applies. */
  builtIn: unknown;
  help?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  /** A list that may not be empty. */
  required?: boolean;
}

/** One stored settings document of a product (always one per company). */
export interface SettingsDoc {
  collection: string;
  docId: string;
  /** Only when a product has two documents in one collection: the name the resolver is called with. */
  id?: string;
  /** Only when the document is not found by `_id: docId`: the (company-scoped) query that finds it. */
  filter?: Record<string, string>;
  title: string;
  settings: SettingDef[];
}

export interface ProductSpec {
  /** The product's key in the settings schema (`lib/platform/settings-schema.ts`). */
  key: string;
  name: string;
  description: string;
  category: string;
  docs: SettingsDoc[];
  /** A rule across fields, checked on the platform's values over the built-in ones. Returns a message, or null. */
  check?: (v: Record<string, unknown>) => string | null;
}

export type Values = Record<string, unknown>;
export type SettingSource = "own" | "platform" | "code";

export const docName = (d: SettingsDoc): string => d.id ?? d.collection;
/** The company-scoped query for a product's settings document. */
export const docQuery = (d: SettingsDoc): Record<string, string> => d.filter ?? { _id: d.docId };

export const allSettings = (spec: ProductSpec): SettingDef[] => spec.docs.flatMap((d) => d.settings);

export function getPath(doc: unknown, path: string): unknown {
  let at = doc;
  for (const part of path.split(".")) {
    if (at === null || typeof at !== "object") return undefined;
    at = (at as Record<string, unknown>)[part];
  }
  return at;
}

/** A copy of `doc` with `path` set; nothing in the original changes. */
export function withPath<T>(doc: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const obj = (doc ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: rest.length ? withPath(obj[head], rest.join("."), value) : value } as T;
}

export const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface TaxRateValue { id: string; name: string; ratePercent: number; isActive: boolean }
export const rateId = (name: string) => `std-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;

/** Checks a value typed for a setting (a form string, a boolean or a list). */
export function parseSetting(def: SettingDef, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const bad = (error: string) => ({ ok: false as const, error: `${def.label}: ${error}` });
  if (def.type === "boolean") return typeof raw === "boolean" ? { ok: true, value: raw } : raw === "true" || raw === "false" ? { ok: true, value: raw === "true" } : bad("choose yes or no.");
  if (def.type === "integer" || def.type === "number") {
    const n = typeof raw === "number" ? raw : String(raw ?? "").trim() === "" ? NaN : Number(raw);
    if (!Number.isFinite(n) || (def.type === "integer" && !Number.isInteger(n))) return bad(def.type === "integer" ? "enter a whole number." : "enter a number.");
    if ((def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) return bad(`enter a number from ${def.min} to ${def.max}.`);
    return { ok: true, value: n };
  }
  if (def.type === "list") {
    const items = [...new Set((Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\n,]/)).map((s) => s.trim()).filter(Boolean))];
    if (items.length > (def.max ?? 100) || items.some((s) => s.length > 120)) return bad(`use at most ${def.max ?? 100} short entries.`);
    if (def.required && items.length === 0) return bad("add at least one entry.");
    return { ok: true, value: items };
  }
  if (def.type === "days") {
    const items = [...new Set((Array.isArray(raw) ? raw : String(raw ?? "").split(",")).filter((x) => String(x).trim() !== "").map(Number))].sort((a, b) => a - b);
    if (!items.every((n) => def.options?.some((o) => Number(o.value) === n))) return bad("choose from the list.");
    if (def.required && items.length === 0) return bad("choose at least one.");
    return { ok: true, value: items };
  }
  if (def.type === "rates") {
    const lines: unknown[] = Array.isArray(raw) ? raw : String(raw ?? "").split("\n").filter((l) => l.trim());
    const rates: TaxRateValue[] = [];
    for (const line of lines) {
      const o = typeof line === "string" ? { name: line.split("|")[0], ratePercent: line.split("|")[1], isActive: true } : (line as Partial<TaxRateValue>);
      const name = String(o.name ?? "").trim().slice(0, 60);
      const pct = String(o.ratePercent ?? "").trim() === "" ? NaN : Number(o.ratePercent);
      if (!name || !Number.isFinite(pct) || pct < 0 || pct > 100) return bad("write one rate per line as Name | percent, with a percent from 0 to 100.");
      if (rates.some((r) => r.id === rateId(name))) return bad(`"${name}" is listed twice.`);
      rates.push({ id: rateId(name), name, ratePercent: pct, isActive: o.isActive !== false });
    }
    return rates.length && rates.length <= 40 ? { ok: true, value: rates } : bad("add 1 to 40 rates.");
  }
  const s = String(raw ?? "").trim();
  if (def.type === "time") return TIME_RE.test(s) ? { ok: true, value: s } : bad("use a time like 09:30.");
  if (def.type === "select") return def.options?.some((o) => o.value === s) ? { ok: true, value: s } : bad("choose from the list.");
  if (!s && def.required) return bad("enter a value.");
  return s.length <= (def.max ?? 200) ? { ok: true, value: s } : bad("that is too long.");
}

/** The value as a person reads it. */
export function describeValue(def: SettingDef, v: unknown): string {
  if (def.type === "boolean") return v ? "Yes" : "No";
  const option = (x: unknown) => def.options?.find((o) => o.value === String(x))?.label ?? String(x);
  if (def.type === "rates") return Array.isArray(v) && v.length ? (v as TaxRateValue[]).map((r) => r.name).join(", ") : "None";
  if (Array.isArray(v)) return v.length ? v.map(option).join(", ") : "None";
  if (v === null || v === undefined || v === "") return "Empty";
  return def.type === "select" ? option(v) : String(v);
}

/**
 * A product's settings for one company: `merged` is what the product already works out (its code defaults overlaid with the stored document `raw`);
 * every setting the company has not stored takes the platform's default when there is one.
 */
export function applyPlatform<T>(doc: SettingsDoc, merged: T, raw: unknown, platform: Values): T {
  let out = merged;
  // The migration's rollback snapshot is bookkeeping: it never reaches the product.
  if (out && typeof out === "object" && "_defaultsBaseline" in out) { const { _defaultsBaseline, ...rest } = out as Record<string, unknown>; void _defaultsBaseline; out = rest as T; }
  for (const s of doc.settings) if (getPath(merged, s.key) !== undefined && getPath(raw, s.key) === undefined && s.key in platform) out = withPath(out, s.key, structuredClone(platform[s.key]));
  return out;
}

export function sourceOf(def: SettingDef, raw: unknown, platform: Values): SettingSource {
  return getPath(raw, def.key) !== undefined ? "own" : def.key in platform ? "platform" : "code";
}

/**
 * The `$set` for a company saving its settings form. A form sends every field, so a field the company never stored is stored only when what it
 * sent DIFFERS from the default it was shown (`inherited`: the resolved value without the company's document): saving a form must not freeze
 * every default. A field already stored stays the company's own. Anything that is not a default-able setting is saved as before.
 */
export function companyPatch(doc: SettingsDoc, raw: unknown, data: object, inherited: unknown): Record<string, unknown> {
  const keys = new Set(doc.settings.map((s) => s.key));
  const out: Record<string, unknown> = {};
  const walk = (value: unknown, path: string) => {
    if (keys.has(path)) {
      if (value !== undefined && (getPath(raw, path) !== undefined || !sameValue(value, getPath(inherited, path)))) out[path] = value;
      return;
    }
    if (doc.settings.some((s) => s.key.startsWith(`${path}.`)) && value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
      return;
    }
    out[path] = value;
  };
  for (const [k, v] of Object.entries(data)) walk(v, k);
  return out;
}
