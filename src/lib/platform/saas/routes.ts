/**
 * The public pages of the SaaS product website. A request on a SaaS host (`hosts.ts`) for one of these paths is
 * rewritten by `proxy.ts` to the same path under `/saas`; everything else on that host (sign-up, Platform Console,
 * API) is served as before.
 */

const EXACT = new Set([
  "/",
  "/products",
  "/features",
  "/pricing",
  "/faqs",
  "/ask",
  "/changelog",
  "/roadmap",
  "/docs",
  "/help",
  "/faq",
  "/tutorials",
  "/blog",
  "/about",
  "/contact",
  "/mission",
  "/what-we-do",
  "/success-stories",
  "/onboarded-businesses",
  "/privacy",
  "/terms",
  "/cookies",
  "/data-policy",
  "/status",
  "/sla",
  "/refund-policy",
  "/dpa",
  "/subprocessors",
  "/data-requests",
  "/grievance",
  "/vulnerability-disclosure",
  "/demo",
  "/gallery",
  "/offers",
  "/vision",
  "/product-vision",
  // Pages of earlier versions of the website: redirected to their new homes by app/saas/[...legacy].
  "/modules",
  "/ai",
  "/automation",
  "/integrations",
  "/security",
  "/how-it-works",
  "/use-cases",
  "/industries",
  "/resources",
  "/login",
  "/register",
  "/robots.txt",
  "/sitemap.xml",
  "/opengraph-image",
  "/og",
]);

const PREFIXES = ["/products/", "/features/", "/docs/", "/pricing/", "/blog/", "/tutorials/", "/modules/", "/use-cases/", "/industries/", "/resources/", "/vision/", "/product-vision/"];

export function isSaasPagePath(pathname: string): boolean {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return EXACT.has(p) || PREFIXES.some((x) => p.startsWith(x));
}
