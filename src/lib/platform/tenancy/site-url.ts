import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { siteUrl as PLATFORM_OWNER_SITE_URL } from "@/lib/seo";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { COMPANY_DOMAINS_COLLECTION, getCompany, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { companyAppBaseUrl, companyBaseUrl, companySubdomain, platformRootDomain } from "@/lib/platform/tenancy/provisioning";
import { saasAppOrigin } from "@/lib/platform/saas/hosts";
import { loadIntegrationsDoc } from "@/lib/platform/integrations/store";

/**
 * The current company's PUBLIC SITE origin (`https://host`, no trailing
 * slash) — for anything that must point at "this company's website":
 * sitemap/robots, canonical + Open Graph URLs, JSON-LD, the SEO crawler,
 * certificate verification links, payment links, the chatbot's crawl list.
 *
 *  1. the company's primary VERIFIED domain (custom domain or its subdomain)
 *  2. else its automatic subdomain `<slug>.<PLATFORM_ROOT_DOMAIN>`
 *
 * The platform operator keeps `siteUrl` from `src/lib/seo.ts` unless
 * it has a verified primary custom domain (normally the company's own domain,
 * which gives the same string) — so its URLs never change.
 *
 * Works inside a request (company from the Host header) and inside
 * `runAsCompany` (crons, webhooks, scripts). On `*.localhost` (development)
 * the port comes from the request's Host header when there is one.
 */

// Domain changes reach this instance within a minute, same as host routing.
const TTL_MS = 60_000;
const memo = new Map<string, { url: string; at: number }>();

function originOf(domain: CompanyDomain, slug: string, hostHint: string | null): string {
  const host = domain._id;
  // The automatic subdomain is always built from the slug under the current root (dev: http + port).
  if (domain.kind === "subdomain" || host === companySubdomain(slug)) return companyBaseUrl(slug, hostHint);
  if (host === "localhost" || host.endsWith(".localhost")) {
    const port = hostHint?.match(/:(\d+)$/)?.[1] ?? process.env.PORT ?? "3000";
    return `http://${host}:${port}`;
  }
  return `https://${host}`;
}

async function resolveSiteUrl(companyId: string, hostHint: string | null): Promise<string> {
  // The subdomain root may come from Platform Console → Integrations (crons and scripts have no proxy to load it).
  const [company] = await Promise.all([getCompany(companyId), loadIntegrationsDoc()]);
  if (!company) throw new Error(`Unknown company ${companyId}`);
  const db = await getPlatformDb();
  const primary = await db
    .collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION)
    .find({ companyId, status: "verified", isPrimary: true })
    .sort({ verifiedAt: 1, _id: 1 })
    .limit(1)
    .next();

  if (company.isPlatformOwner) {
    // Only a custom domain replaces the owner's long-standing site URL.
    if (!primary || primary.kind === "subdomain" || primary._id === companySubdomain(company.slug)) return PLATFORM_OWNER_SITE_URL;
    // e.g. example.com → "https://example.com", i.e. exactly `siteUrl`.
    return originOf(primary, company.slug, hostHint);
  }
  return primary ? originOf(primary, company.slug, hostHint) : companyBaseUrl(company.slug, hostHint);
}

/** Uncached-by-request variant, for code that already knows which company it's acting for. */
export async function siteUrlForCompany(companyId: string, hostHint: string | null = null): Promise<string> {
  const key = `${companyId}|${hostHint ?? ""}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
  const url = await resolveSiteUrl(companyId, hostHint);
  memo.set(key, { url, at: Date.now() });
  return url;
}

/** Drops memoised site URLs so a primary-domain change applies on this instance immediately. */
export function forgetCompanySiteUrls(): void {
  memo.clear();
}

/** Keyed by company (not argument-less), so a cron looping over companies in one request never reuses another company's URL. */
const siteUrlCached = cache(siteUrlForCompany);

/** The request's Host header, only needed for the port of a `*.localhost` address. */
async function localHostHint(): Promise<string | null> {
  if (platformRootDomain() !== "localhost") return null;
  try {
    return (await headers()).get("host");
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/** The current company's public site origin, e.g. `https://acme.com` — no trailing slash. */
export async function companySiteUrl(): Promise<string> {
  const [companyId, hint] = await Promise.all([currentCompanyId(), localHostHint()]);
  return siteUrlCached(companyId, hint);
}

/** The current company's public site host, e.g. `acme.com` (with port on localhost). */
export async function companySiteHost(): Promise<string> {
  return new URL(await companySiteUrl()).host;
}

/**
 * Where the current company's PRODUCTS live (Workspace, HRMS, Platform Console, …), as an origin without a trailing slash:
 * `app.<primary custom domain>` when it has one, else `<slug>-app.<root>`; the platform operator's is `app.<SaaS host>`.
 * The public website (`siteUrlForCompany`) never serves products.
 */
export async function appUrlForCompany(companyId: string, hostHint: string | null = null): Promise<string> {
  const [company] = await Promise.all([getCompany(companyId), loadIntegrationsDoc()]);
  if (!company) throw new Error(`Unknown company ${companyId}`);
  if (company.isPlatformOwner) return saasAppOrigin(hostHint);
  const db = await getPlatformDb();
  const primary = await db
    .collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION)
    .find({ companyId, status: "verified", isPrimary: true, kind: "custom" })
    .sort({ verifiedAt: 1, _id: 1 })
    .limit(1)
    .next();
  if (primary && !primary._id.endsWith(".localhost")) return `https://app.${primary._id.replace(/^www\./, "")}`;
  return companyAppBaseUrl(company.slug, hostHint);
}
