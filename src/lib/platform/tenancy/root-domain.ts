/**
 * Pure helpers (no server imports) for working out the platform's root domain — the domain every company's automatic
 * address `<slug>.<root>` lives under — without it being typed in anywhere, so a production deployment can never fall back
 * to `localhost`. Order used by `resolvedRootDomain()`: Platform Console → Integrations, then `PLATFORM_ROOT_DOMAIN`, then
 * `productionRootDomain()` (Vercel production only), and `localhost` only in development.
 */

type Env = Record<string, string | undefined>;

/** Hosts that can never be a platform root domain. */
function isLocalOrVercelHost(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost") || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.endsWith(".vercel.app");
}

/**
 * The root domain implied by the Vercel production domain (`VERCEL_PROJECT_PRODUCTION_URL`, e.g. `www.example.com` →
 * `example.com`). Null outside Vercel production, and when the production address is only a `*.vercel.app` one (subdomains
 * of vercel.app are not ours to use).
 */
export function productionRootDomain(env: Env = process.env): string | null {
  if (env.VERCEL_ENV !== "production") return null;
  const raw = (env.VERCEL_PROJECT_PRODUCTION_URL ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "");
  if (!raw || isLocalOrVercelHost(raw)) return null;
  return raw.replace(/^www\./, "");
}

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

/**
 * A last-resort guess of the root domain from a request host (`www.example.com` → `example.com`,
 * `app.example.co.in` → `example.co.in`). Null for local, IP and `*.vercel.app` hosts. Only used to avoid ever printing a
 * `localhost` address in production when nothing is configured; configuring `PLATFORM_ROOT_DOMAIN` is the real fix.
 */
export function rootDomainFromHost(rawHost: string | null | undefined): string | null {
  const host = (rawHost ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host || isLocalOrVercelHost(host) || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return null;
  const labels = host.replace(/^www\./, "").split(".");
  const keep = labels.length >= 3 && labels[labels.length - 1].length === 2 && SECOND_LEVEL.has(labels[labels.length - 2]) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** Whether `host` is exactly one label under `root` (`acme.example.com` under `example.com`) — the shape of an automatic company address. */
export function isSubdomainOfRoot(host: string, root: string): boolean {
  if (!root || root === "localhost" || !host.endsWith(`.${root}`)) return false;
  const label = host.slice(0, -(root.length + 1));
  return label.length > 0 && !label.includes(".");
}
