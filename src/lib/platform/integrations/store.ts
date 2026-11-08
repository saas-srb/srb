import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { productionRootDomain } from "@/lib/platform/tenancy/root-domain";
import type { EncryptedValue } from "@/lib/platform/crypto";

/**
 * Raw storage for platform integrations (`platform_settings`, `_id:
 * "integrations"`) plus a short-lived in-process cache of that document.
 *
 * Deliberately free of `server-only` and of any decryption, so the routing
 * layer (`tenancy/companies.ts`, which the proxy imports) can read the one
 * non-secret value it needs — the platform root domain — without pulling
 * crypto into the proxy. Secrets stay encrypted here; `integrations/index.ts`
 * decrypts them server-side only.
 *
 * The cache lives on `globalThis` so the proxy bundle and the app bundle
 * share it. A save on this instance busts it at once; other instances follow
 * within CACHE_TTL_MS.
 */

export const INTEGRATIONS_DOC_ID = "integrations";
export const CACHE_TTL_MS = 30_000;

/** A stored secret: ciphertext plus the last four characters for display. */
export interface StoredSecret {
  enc: EncryptedValue;
  last4: string;
  updatedAt: Date;
}

export interface IntegrationsDoc {
  _id: typeof INTEGRATIONS_DOC_ID;
  email?: {
    provider?: "resend" | "console" | null;
    resendApiKey?: StoredSecret | null;
    from?: string | null;
  };
  domains?: {
    provider?: "vercel" | "manual" | null;
    vercelToken?: StoredSecret | null;
    vercelProjectId?: string | null;
    vercelTeamId?: string | null;
    rootDomain?: string | null;
  };
  updatedAt?: Date;
  updatedBy?: string | null;
}

interface IntegrationsCache {
  doc: IntegrationsDoc | null;
  at: number;
  loading: Promise<IntegrationsDoc | null> | null;
}
const g = globalThis as unknown as { __platformIntegrations?: IntegrationsCache };
const cache: IntegrationsCache = (g.__platformIntegrations ??= { doc: null, at: 0, loading: null });

/** The stored document (cached briefly). Null when nothing has ever been saved or the DB can't be read. */
export async function loadIntegrationsDoc(): Promise<IntegrationsDoc | null> {
  if (cache.at && Date.now() - cache.at < CACHE_TTL_MS) return cache.doc;
  cache.loading ??= (async () => {
    try {
      const db = await getPlatformDb();
      const doc = await db.collection<IntegrationsDoc>("platform_settings").findOne({ _id: INTEGRATIONS_DOC_ID });
      cache.doc = doc;
      cache.at = Date.now();
      return doc;
    } catch (err) {
      console.error("[integrations] could not read settings; using environment configuration", err);
      return cache.doc;
    } finally {
      cache.loading = null;
    }
  })();
  return cache.loading;
}

/** Whatever was last loaded, without touching the DB (for synchronous callers). */
export function cachedIntegrationsDoc(): IntegrationsDoc | null {
  return cache.doc;
}

/**
 * Marks the cached document stale so the next read goes to the DB. The old
 * copy stays for synchronous readers until that read lands; savers call
 * `loadIntegrationsDoc()` straight after, so this instance switches at once.
 */
export function bustIntegrationsCache(): void {
  cache.at = 0;
}

/**
 * The root domain company subdomains live under, from the DB when set,
 * else `PLATFORM_ROOT_DOMAIN` (first entry), else — on Vercel production only —
 * the domain implied by the production URL (`www.example.com` → `example.com`),
 * else `localhost` (development). Synchronous:
 * reads the cached document, which the proxy (every page request) and the
 * provisioning path load before use.
 */
export function resolvedRootDomain(): string {
  const db = cachedIntegrationsDoc()?.domains?.rootDomain?.trim().toLowerCase();
  if (db) return db;
  return (process.env.PLATFORM_ROOT_DOMAIN ?? "").split(",")[0].trim().toLowerCase() || productionRootDomain() || "localhost";
}
