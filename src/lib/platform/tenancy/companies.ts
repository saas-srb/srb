import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import type { BusinessSelection } from "@/lib/platform/business-taxonomy";
import type { DnsRecord } from "@/lib/platform/domains/types";
import { RESERVED_SLUGS } from "@/lib/platform/tenancy/slug";
import { cachedIntegrationsDoc, loadIntegrationsDoc } from "@/lib/platform/integrations/store";
import { productionRootDomain } from "@/lib/platform/tenancy/root-domain";
import { saasAppHosts, saasHosts } from "@/lib/platform/saas/hosts";

/**
 * The company (tenant) registry and host → company routing. Both
 * collections are platform-level (see GLOBAL_COLLECTIONS) and are only ever
 * read through `getPlatformDb()`.
 *
 * A request is routed to a company by its Host header:
 *  1. a platform host (localhost, the Vercel deployment/preview URLs, and
 *     anything in PLATFORM_HOSTS) → the platform-owner company
 *  2. a verified custom domain in `company_domains` (with or without `www.`)
 *  3. `<slug>.<root>` for any root in PLATFORM_ROOT_DOMAINS (plus
 *     `<slug>.localhost` in development) → the company with that slug
 * Anything else resolves to no company at all — never a fallback.
 */

export const COMPANIES_COLLECTION = "companies";
export const COMPANY_DOMAINS_COLLECTION = "company_domains";

export type CompanyStatus = "active" | "suspended";

export interface Company {
  _id: string;
  /** Lowercase, URL-safe; also the platform subdomain `<slug>.<root>`. */
  slug: string;
  name: string;
  status: CompanyStatus;
  /** The company that owns and runs the platform itself (the platform operator). Exactly one. */
  isPlatformOwner: boolean;
  /** The public demo company: unlimited like the platform owner (no seat / module / storage limits, never read-only) so anyone can explore the whole product. Set only by the platform operator (scripts/mark-demo-company.mjs), never by sign-up. */
  isDemo?: boolean;
  /** Defaults from Platform settings at creation (BCP 47 locale, IANA time zone); onboarding can change the time zone. */
  locale?: string;
  timezone?: string;
  /** Line of business (ISIC Rev.4 category + sub-category) chosen at registration. */
  business?: BusinessSelection;
  /** What the sign-up request told us about where the owner is (country code, browser languages, time zone): used to pick the language and style of the AI-written website. */
  signupHints?: { country?: string; languages?: string; timezone?: string };
  /** Products the platform switched off for THIS company only (Platform Console → Companies). The global switch lives in the Product Registry. */
  disabledPanels?: string[];
  /** Overrides the 30-day email-verification deadline for this company (see `email-lapse-rule.ts`). Normally unset. */
  emailVerifyDueAt?: Date;
  /** Set when the Director asked for the company to be deleted for good: it is deleted on `purgeAt`, and until then the request can be cancelled. */
  deletion?: { requestedAt: Date; purgeAt: Date; requestedBy: string };
  /** When and by whom the status was last changed in the Platform Console. */
  statusChangedAt?: Date;
  statusChangedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyDomain {
  /** The hostname itself, lowercase, no port. */
  _id: string;
  companyId: string;
  status: "pending" | "verified";
  /** Value the owner publishes in a `_selfrun-verify.<domain>` TXT record. */
  verificationToken: string;
  isPrimary: boolean;
  /** `subdomain` = the automatic `<slug>.<root>` address; `custom` = the company's own domain. */
  kind?: "subdomain" | "custom";
  /** Last known state at the hosting provider (routing + TLS), from `activeDomainProvider()`. */
  provider?: {
    id: string;
    attached: boolean;
    verified: boolean;
    dnsConfigured: boolean;
    error: string | null;
    checkedAt: Date;
    /** Records the provider still wants published (its own ownership challenge, routing). */
    records?: DnsRecord[];
    /** The provider demanded its own ownership proof at some point — see `domains/custom.ts`. */
    challenged?: boolean;
  };
  /** The same, for the company's app host `app.<domain>` of a custom domain (its own ownership challenge and routing). */
  appProvider?: {
    id: string;
    attached: boolean;
    verified: boolean;
    dnsConfigured: boolean;
    error: string | null;
    checkedAt: Date;
    records?: DnsRecord[];
    challenged?: boolean;
  };
  /** Every DNS record the hosting provider ever asked for, kept after it is published (Settings → Domains → DNS records). */
  dnsLog?: { host: string; type: DnsRecord["type"]; name: string; value: string; reason: string; seenAt: Date }[];
  /** Outcome of the last ownership check of a custom domain (`domains/custom.ts`). */
  lastCheck?: { at: Date; txt: "found" | "missing" | "mismatch" | "error"; detail: string | null };
  createdAt: Date;
  verifiedAt: Date | null;
}

export { RESERVED_SLUGS } from "@/lib/platform/tenancy/slug";

function envList(...names: string[]): string[] {
  return names
    .flatMap((n) => (process.env[n] ?? "").split(","))
    .map((s) => normalizeHost(s))
    .filter((s): s is string => Boolean(s));
}

/** Lowercase, port and trailing dot removed; null for anything that isn't a plausible hostname. */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/:\d+$/, "").replace(/\.$/, "");
  return /^[a-z0-9.-]+$/.test(h) && h.length <= 253 ? h : null;
}

function platformHosts(): Set<string> {
  // The root domain itself and www.<root> (https://www.example.com) are the platform owner's own site: no env entry needed.
  const roots = platformRootDomains().filter((r) => r !== "localhost");
  return new Set(["localhost", "127.0.0.1", ...roots, ...roots.map((r) => `www.${r}`), ...envList("PLATFORM_HOSTS", "VERCEL_URL", "VERCEL_BRANCH_URL")]);
}

/** `localhost`, every `PLATFORM_ROOT_DOMAIN` entry, and the root domain saved in Platform Console → Integrations. */
function platformRootDomains(): string[] {
  const saved = normalizeHost(cachedIntegrationsDoc()?.domains?.rootDomain);
  const configured = [...envList("PLATFORM_ROOT_DOMAIN"), ...(saved ? [saved] : [])];
  // The deployment's production URL is only a guess at the root domain: once one is configured, it is not consulted.
  const derived = configured.length === 0 ? productionRootDomain() : null;
  return ["localhost", ...configured, ...(derived ? [derived] : [])];
}

/**
 * Whether a host belongs to the platform itself — a platform host, a root
 * domain, or any address under one — and so can never be a company's own domain.
 */
export function isPlatformHost(host: string): boolean {
  if (platformHosts().has(host) || saasHosts().has(host)) return true;
  return platformRootDomains().some((root) => host === root || host.endsWith(`.${root}`));
}

// Host → company id. Positive answers are cached longer than negative ones so
// a freshly verified domain starts working quickly.
//
// Invalidation has two layers:
//  - the cache lives on `globalThis`, so the proxy bundle and the app bundle
//    (separate module instances in one process) share it — a change made on
//    this instance applies here at once;
//  - a routing version in `platform_settings` is bumped on every change and
//    checked at most every VERSION_CHECK_MS, so other instances follow within
//    seconds instead of waiting out the TTL.
const HIT_TTL_MS = 60_000;
const MISS_TTL_MS = 5_000;
const VERSION_CHECK_MS = 2_000;
const ROUTING_VERSION_ID = "routing";

/** Which side of a company a host serves: its public website, or its products (Workspace, HRMS, …). */
export type HostSurface = "site" | "app";
export interface HostInfo {
  companyId: string;
  surface: HostSurface;
}

interface RoutingCache {
  hosts: Map<string, { info: HostInfo | null; at: number }>;
  owner: { id: string; at: number } | null;
  version: number | null;
  versionCheckedAt: number;
}
const globalForRouting = globalThis as unknown as { __companyRouting?: RoutingCache };
const routing: RoutingCache = (globalForRouting.__companyRouting ??= { hosts: new Map(), owner: null, version: null, versionCheckedAt: 0 });

/** Clears this process's cache when another instance has changed routing since we last looked. */
async function followRoutingVersion(): Promise<void> {
  if (Date.now() - routing.versionCheckedAt < VERSION_CHECK_MS) return;
  routing.versionCheckedAt = Date.now();
  try {
    const db = await getPlatformDb();
    const doc = await db.collection<{ _id: string; version?: number }>("platform_settings").findOne({ _id: ROUTING_VERSION_ID });
    const version = doc?.version ?? 0;
    if (routing.version !== null && version !== routing.version) {
      routing.hosts.clear();
      routing.owner = null;
    }
    routing.version = version;
  } catch {
    // Routing keeps working from the TTL cache if the version can't be read.
  }
}

export async function getPlatformOwnerCompanyId(): Promise<string | null> {
  await followRoutingVersion();
  if (routing.owner && Date.now() - routing.owner.at < HIT_TTL_MS) return routing.owner.id;
  const db = await getPlatformDb();
  const owner = await db.collection<Company>(COMPANIES_COLLECTION).findOne({ isPlatformOwner: true, status: "active" }, { projection: { _id: 1 } });
  routing.owner = owner ? { id: owner._id, at: Date.now() } : null;
  return owner?._id ?? null;
}

/** The label a company's app host carries after its slug: `<slug>-app.<root>`. Slugs may not end with it (see slug.ts). */
export const APP_SLUG_SUFFIX = "-app";

async function lookupHost(host: string): Promise<HostInfo | null> {
  const bare = host.startsWith("www.") ? host.slice(4) : host;
  // The SaaS product's own hosts run in the platform operator's company scope: the site hosts show its website, the
  // `app.` hosts its products (Platform Console, Workspace, …).
  if (saasHosts().has(host) || saasAppHosts().has(host)) {
    const id = await getPlatformOwnerCompanyId();
    return id ? { companyId: id, surface: saasAppHosts().has(host) ? "app" : "site" } : null;
  }

  const db = await getPlatformDb();
  const companies = db.collection<Company>(COMPANIES_COLLECTION);
  const activeId = async (companyId: string) => (await companies.findOne({ _id: companyId, status: "active" }, { projection: { _id: 1 } }))?._id ?? null;

  // A company's own verified domain wins over the generic platform hosts, so a customer can be served on a domain that
  // used to be the platform's (a deployment's production URL) without any special case. `app.<its domain>` is the same
  // company's products.
  const wwwHost = `www.${bare}`;
  const candidates = [host, bare, wwwHost]; // `acme.com` and `www.acme.com` are one site, whichever was added
  const appBase = host.startsWith("app.") ? host.slice(4) : null;
  // `app.acme.com` is the products of the company whose domain is `acme.com` OR `www.acme.com` (routing treats them as one).
  if (appBase) candidates.push(appBase, appBase.startsWith("www.") ? appBase.slice(4) : `www.${appBase}`);
  const domain = await db
    .collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION)
    .find({ _id: { $in: candidates }, status: "verified" }, { projection: { companyId: 1 } })
    .toArray();
  const direct = domain.find((d) => d._id === host || d._id === bare || d._id === wwwHost);
  if (direct) {
    const id = await activeId(direct.companyId);
    return id ? { companyId: id, surface: "site" } : null;
  }
  const viaApp = appBase ? domain[0] : undefined;
  if (viaApp) {
    const id = await activeId(viaApp.companyId);
    return id ? { companyId: id, surface: "app" } : null;
  }

  if (platformHosts().has(host) || platformHosts().has(bare)) {
    const id = await getPlatformOwnerCompanyId();
    return id ? { companyId: id, surface: "site" } : null;
  }

  for (const root of platformRootDomains()) {
    if (!host.endsWith(`.${root}`)) continue;
    const label = host.slice(0, -(root.length + 1));
    if (!label || label.includes(".") || RESERVED_SLUGS.has(label)) continue;
    const isApp = label.endsWith(APP_SLUG_SUFFIX);
    const slug = isApp ? label.slice(0, -APP_SLUG_SUFFIX.length) : label;
    if (!slug || RESERVED_SLUGS.has(slug)) continue;
    const company = await companies.findOne({ slug, status: "active" }, { projection: { _id: 1 } });
    if (company) return { companyId: company._id, surface: isApp ? "app" : "site" };
  }
  return null;
}

/** The company a host belongs to and which side of it the host serves, or null when no active company owns it. */
export async function resolveHostInfo(rawHost: string | null | undefined): Promise<HostInfo | null> {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  // Also primes the integrations cache the synchronous root-domain accessors read.
  await Promise.all([followRoutingVersion(), loadIntegrationsDoc()]);
  const hit = routing.hosts.get(host);
  if (hit && Date.now() - hit.at < (hit.info ? HIT_TTL_MS : MISS_TTL_MS)) return hit.info;
  const info = await lookupHost(host);
  routing.hosts.set(host, { info, at: Date.now() });
  return info;
}

/** A host that belongs to a SUSPENDED company (its own address, a verified custom domain or `app.` of one): what the "workspace suspended" page needs. */
export interface SuspendedHostInfo {
  companyId: string;
  name: string;
  slug: string;
  suspendedAt: Date | null;
}
const suspendedHosts = new Map<string, { info: SuspendedHostInfo | null; at: number }>();
const SUSPENDED_TTL_MS = 15_000;

/** Same host matching as routing, but for companies whose status is "suspended". Null for any other host (including unknown ones). */
export async function resolveSuspendedHost(rawHost: string | null | undefined): Promise<SuspendedHostInfo | null> {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const hit = suspendedHosts.get(host);
  if (hit && Date.now() - hit.at < SUSPENDED_TTL_MS) return hit.info;
  let info: SuspendedHostInfo | null = null;
  try {
    await loadIntegrationsDoc();
    info = await lookupSuspendedHost(host);
  } catch (err) {
    console.error("[tenancy] suspended-host lookup failed", err);
  }
  if (suspendedHosts.size > 500) suspendedHosts.clear();
  suspendedHosts.set(host, { info, at: Date.now() });
  return info;
}

async function lookupSuspendedHost(host: string): Promise<SuspendedHostInfo | null> {
  if (saasHosts().has(host) || saasAppHosts().has(host) || platformHosts().has(host)) return null;
  const db = await getPlatformDb();
  const companies = db.collection<Company>(COMPANIES_COLLECTION);
  const view = (c: Company | null): SuspendedHostInfo | null => (c && c.status === "suspended" && !c.isPlatformOwner ? { companyId: c._id, name: c.name, slug: c.slug, suspendedAt: c.statusChangedAt ?? null } : null);
  const bare = host.startsWith("www.") ? host.slice(4) : host;
  const appBase = host.startsWith("app.") ? host.slice(4) : null;
  const candidates = [host, bare, `www.${bare}`];
  if (appBase) candidates.push(appBase, appBase.startsWith("www.") ? appBase.slice(4) : `www.${appBase}`);
  const domain = await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).findOne({ _id: { $in: candidates }, status: "verified" }, { projection: { companyId: 1 } });
  if (domain) return view(await companies.findOne({ _id: domain.companyId }));
  for (const root of platformRootDomains()) {
    if (!host.endsWith(`.${root}`)) continue;
    const label = host.slice(0, -(root.length + 1));
    if (!label || label.includes(".") || RESERVED_SLUGS.has(label)) continue;
    const slug = label.endsWith(APP_SLUG_SUFFIX) ? label.slice(0, -APP_SLUG_SUFFIX.length) : label;
    if (!slug || RESERVED_SLUGS.has(slug)) continue;
    return view(await companies.findOne({ slug }));
  }
  return null;
}

export async function resolveCompanyIdByHost(rawHost: string | null | undefined): Promise<string | null> {
  return (await resolveHostInfo(rawHost))?.companyId ?? null;
}

/**
 * Call after any domain or company-status change: applies at once in this
 * process (proxy included) and bumps the shared routing version so every
 * other instance drops its cache within VERSION_CHECK_MS.
 */
export function forgetCompanyRouting(): void {
  suspendedHosts.clear();
  routing.hosts.clear();
  routing.owner = null;
  void getPlatformDb()
    .then((db) => db.collection<{ _id: string; version?: number }>("platform_settings").findOneAndUpdate({ _id: ROUTING_VERSION_ID }, { $inc: { version: 1 } }, { upsert: true, returnDocument: "after" }))
    .then((doc) => {
      // Our own bump isn't news to us.
      if (doc?.version !== undefined) routing.version = doc.version;
    })
    .catch((err) => console.error("[tenancy] routing version bump failed", err));
}

export async function getCompany(companyId: string): Promise<Company | null> {
  const db = await getPlatformDb();
  return db.collection<Company>(COMPANIES_COLLECTION).findOne({ _id: companyId });
}

export async function listActiveCompanyIds(): Promise<string[]> {
  const db = await getPlatformDb();
  const rows = await db.collection<Company>(COMPANIES_COLLECTION).find({ status: "active" }, { projection: { _id: 1 } }).toArray();
  return rows.map((r) => r._id);
}
