import { isSaasAppHost, isSaasHost } from "@/lib/platform/saas/hosts";
import { APP_SLUG_SUFFIX, isPlatformHost, normalizeHost, type HostSurface } from "@/lib/platform/tenancy/companies";

/**
 * A company has two sides, on two hosts:
 *  - the SITE (`<slug>.<root>` or its own domain, e.g. `acme.com`): only the public website;
 *  - the APP (`<slug>-app.<root>`, `app.<its own domain>`, or `app.<SaaS host>` for the platform operator): the products.
 * A page that belongs to the other side is redirected there, so every link keeps working from either host.
 */

/** First path segments that are products (pages, not APIs): reachable only on an app host. */
const PANEL_SEGMENTS = new Set([
  "commandos",
  "platform",
  "console",
  "talentos",
  "sprintos",
  "spendiq",
  "cohort-ai",
  "cashflow-ai",
  "dealflow-ai",
  "huddle-ai",
  "playbook-ai",
  "contractflow-ai",
  "cybervault",
  "evaliq",
  "agentos",
  "databrain-ai",
  "viralpulse-ai",
  "rankmax-ai",
  "sitecraft-ai",
  "resolveiq",
  "clientos",
]);

/** Public links that work on either host (payment links, certificate and signed-document verification, signer links, portal login/register) and internal rewrite targets. */
const SHARED_SEGMENTS = new Set(["pay", "verify", "sign", "product-unavailable", "workspace-not-found", "company-suspended", "maintenance", "offline-shell", "platform-maintenance", "login", "register"]);

const firstSegment = (pathname: string) => pathname.split("/")[1] ?? "";

export function isPanelPath(pathname: string): boolean {
  return PANEL_SEGMENTS.has(firstSegment(pathname));
}

export function isSharedPath(pathname: string): boolean {
  return SHARED_SEGMENTS.has(firstSegment(pathname));
}

/** What to do with a page request given the side of the company its host serves; null = serve it here. */
export function surfaceRedirect(surface: HostSurface, pathname: string): "to-app" | "to-site" | "app-home" | null {
  if (isSharedPath(pathname)) return null;
  if (surface === "site") return isPanelPath(pathname) ? "to-app" : null;
  if (pathname === "/") return "app-home";
  return isPanelPath(pathname) ? null : "to-site";
}

/** The host that serves the other side of the same company, keeping the port. Null when it can't be derived. */
export function counterpartHost(rawHost: string | null, surface: HostSurface): string | null {
  const host = normalizeHost(rawHost);
  if (!host) return null;
  const port = rawHost?.match(/:\d+$/)?.[0] ?? "";
  let other: string | null = null;
  if (surface === "site") {
    if (isSaasHost(host)) other = `app.${host.replace(/^www\./, "")}`;
    else if (isPlatformHost(host)) {
      const [label, ...rest] = host.split(".");
      other = `${label}${APP_SLUG_SUFFIX}.${rest.join(".")}`;
    } else other = `app.${host.replace(/^www\./, "")}`;
  } else if (isSaasAppHost(host)) other = host.slice(4);
  else if (host.startsWith("app.")) other = host.slice(4);
  else {
    const [label, ...rest] = host.split(".");
    if (label.endsWith(APP_SLUG_SUFFIX)) other = `${label.slice(0, -APP_SLUG_SUFFIX.length)}.${rest.join(".")}`;
  }
  // A redirect to the bare `localhost` is turned into a relative one by the Next server (it is the server's own name), which
  // would loop on the app host in development; `saas.localhost` is the same product website.
  if (other === "localhost") other = "saas.localhost";
  return other ? `${other}${port}` : null;
}
