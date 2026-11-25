import "server-only";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import { lockedModules } from "@/lib/platform/products/routes";

/**
 * The products a company does NOT have (not bought, or not in its plan). Cached briefly: it is asked on every request.
 * Fails open — a lookup error locks nothing (each product's own data access fails by itself if the database is down).
 */
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; keys: Set<string> }>();

export async function lockedModuleKeys(companyId: string): Promise<Set<string>> {
  const hit = cache.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.keys;
  try {
    const entitlements = await entitlementsFor(companyId);
    const keys = lockedModules(entitlements.modules);
    // "website" is the public marketing site: without it only the working public pages stay (see `website.ts`).
    if (!entitlements.sites) keys.add("website");
    if (cache.size > 2000) cache.clear();
    cache.set(companyId, { at: Date.now(), keys });
    return keys;
  } catch (err) {
    console.error("[products] ownership lookup failed", err);
    return new Set();
  }
}

/** Called after a company's products or plan change, so this server follows at once. */
export function forgetCompanyAvailability(companyId: string): void {
  cache.delete(companyId);
}
