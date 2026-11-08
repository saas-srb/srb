import "server-only";
import { connectionValues } from "@/lib/platform/connections/resolve";
import { siteUrl } from "@/lib/seo";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";

/**
 * SEO product settings: one `seo_settings` document (`_id: "global"`). Secrets
 * are NEVER stored here — Google credentials and API keys come from env vars
 * (see `integrationEnv`), the document only holds non-secret configuration
 * such as the Search Console property and GA4 property id.
 */

export type Device = "desktop" | "mobile";
export type AuditFrequency = "off" | "daily" | "weekly";

export interface SeoSettings {
  _id: "global";
  /** Origin the crawler fetches. Production by default; point at a staging/local server to audit before deploy. */
  siteOrigin: string;
  crawl: {
    maxPages: number;
    concurrency: number;
    timeoutMs: number;
    checkExternalLinks: boolean;
    maxExternalChecks: number;
    /** Path prefixes the crawler skips. */
    excludePrefixes: string[];
  };
  thresholds: {
    titleMin: number;
    titleMax: number;
    descriptionMin: number;
    descriptionMax: number;
    thinContentWords: number;
    slowResponseMs: number;
    staleContentDays: number;
    minInternalLinksIn: number;
  };
  schedule: {
    auditFrequency: AuditFrequency;
    syncSearchData: boolean;
    verifyBacklinks: boolean;
  };
  defaults: { country: string; language: string; device: Device; engine: string };
  integrations: {
    gsc: { enabled: boolean; property: string; lastSyncAt: Date | null; lastError: string | null };
    ga4: { enabled: boolean; propertyId: string; lastSyncAt: Date | null; lastError: string | null };
    psi: { enabled: boolean; strategy: Device };
  };
  updatedAt: Date | null;
  updatedBy: string | null;
}

/** The platform owner's (operator's) defaults — see `defaultSettings()` for everyone else. */
export const OWNER_DEFAULT_SETTINGS: SeoSettings = {
  _id: "global",
  siteOrigin: siteUrl,
  crawl: {
    maxPages: 300,
    concurrency: 5,
    timeoutMs: 15000,
    checkExternalLinks: true,
    maxExternalChecks: 150,
    excludePrefixes: ["/api", "/dealflow-ai", "/cohort-ai", "/talentos", "/sprintos", "/spendiq", "/cashflow-ai", "/playbook-ai", "/rankmax-ai", "/admin", "/commandos", "/huddle-ai", "/clientos", "/verify", "/pay"],
  },
  thresholds: {
    titleMin: 30,
    titleMax: 60,
    descriptionMin: 70,
    descriptionMax: 160,
    thinContentWords: 300,
    slowResponseMs: 1500,
    staleContentDays: 365,
    minInternalLinksIn: 3,
  },
  schedule: { auditFrequency: "weekly", syncSearchData: true, verifyBacklinks: true },
  defaults: { country: "IN", language: "en", device: "desktop", engine: "google" },
  integrations: {
    gsc: { enabled: false, property: "", lastSyncAt: null, lastError: null },
    ga4: { enabled: false, propertyId: "", lastSyncAt: null, lastError: null },
    psi: { enabled: true, strategy: "mobile" },
  },
  updatedAt: null,
  updatedBy: null,
};

/**
 * Defaults for a company that hasn't saved SEO settings: the owner's own
 * values for the platform owner only. Any other company audits its own site
 * (`companySiteUrl()`), has no Search Console property filled in, and nothing
 * scheduled until it opts in — the daily cron must not start crawling a
 * company's site the moment it signs up.
 */
async function defaultSettings(): Promise<SeoSettings> {
  if (await isPlatformOwnerContext()) return OWNER_DEFAULT_SETTINGS;
  return {
    ...OWNER_DEFAULT_SETTINGS,
    siteOrigin: await companySiteUrl(),
    schedule: { auditFrequency: "off", syncSearchData: false, verifyBacklinks: false },
    integrations: { ...OWNER_DEFAULT_SETTINGS.integrations, gsc: { ...OWNER_DEFAULT_SETTINGS.integrations.gsc, property: "" } },
  };
}

/** Deep-merges a stored document over the defaults so new settings keys never read as undefined. */
function withDefaults(doc: Partial<SeoSettings> | null, d: SeoSettings): SeoSettings {
  if (!doc) return structuredClone(d);
  return {
    ...d,
    ...doc,
    _id: "global",
    crawl: { ...d.crawl, ...(doc.crawl ?? {}) },
    thresholds: { ...d.thresholds, ...(doc.thresholds ?? {}) },
    schedule: { ...d.schedule, ...(doc.schedule ?? {}) },
    defaults: { ...d.defaults, ...(doc.defaults ?? {}) },
    integrations: {
      gsc: { ...d.integrations.gsc, ...(doc.integrations?.gsc ?? {}) },
      ga4: { ...d.integrations.ga4, ...(doc.integrations?.ga4 ?? {}) },
      psi: { ...d.integrations.psi, ...(doc.integrations?.psi ?? {}) },
    },
  };
}

export async function getSettings(): Promise<SeoSettings> {
  const col = await seoCollection<SeoSettings>(COLLECTIONS.settings);
  const [doc, defaults] = await Promise.all([col.findOne({ _id: "global" }), defaultSettings()]);
  return withDefaults(doc, defaults);
}

export async function saveSettings(next: SeoSettings, actorId: string): Promise<void> {
  const col = await seoCollection<SeoSettings>(COLLECTIONS.settings);
  const { _id: _ignored, ...rest } = next;
  void _ignored;
  await col.updateOne({ _id: "global" }, { $set: { ...rest, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
}

/** Records an integration's sync outcome without touching anything else. */
export async function markIntegrationSync(key: "gsc" | "ga4", error: string | null): Promise<void> {
  const col = await seoCollection<SeoSettings>(COLLECTIONS.settings);
  const set: Record<string, unknown> = { [`integrations.${key}.lastError`]: error };
  if (!error) set[`integrations.${key}.lastSyncAt`] = new Date();
  await col.updateOne({ _id: "global" }, { $set: set }, { upsert: true });
}

/** Which credentials this workspace has connected (Workspace → Settings → Integrations) — never their values. */
export async function integrationEnv() {
  const sa = await connectionValues("google-service-account");
  const clientEmail = sa?.clientEmail ?? "";
  const privateKey = sa?.privateKey ?? "";
  return {
    google: clientEmail && privateKey ? { clientEmail, privateKey } : null,
    googleClientEmail: clientEmail || null,
    pagespeedKey: (await connectionValues("pagespeed"))?.apiKey ?? null,
  };
}

/** Normalizes a user-entered origin to `scheme://host[:port]`, or null when invalid. */
export function cleanOrigin(v: string): string | null {
  try {
    const u = new URL(v.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin;
  } catch {
    return null;
  }
}
