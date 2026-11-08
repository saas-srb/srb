import { NextResponse } from "next/server";
import { emailLapseFor } from "@/lib/platform/email-lapse";
import { getFeatureControls, pdfOff } from "@/lib/platform/feature-controls";
import { pdfTypeOfRequest } from "@/lib/pdf/gate";
import { trialLockedFor } from "@/lib/platform/billing/trial-lock";
import { TRIAL_LOCK_OPEN_PATH } from "@/lib/platform/billing/trial-lock-rule";
import { LAPSE_OPEN_PATH } from "@/lib/platform/email-lapse-rule";
import type { NextRequest } from "next/server";
import { frameAncestorsFor } from "@/lib/products/agentos/calls/public-embed";
import { isMaintenanceOn, isPublicSitePath } from "@/lib/products/sitecraft-ai/maintenance-gate";
import { resolveCompanyIdByHost, resolveHostInfo, resolveSuspendedHost, normalizeHost, type HostInfo } from "@/lib/platform/tenancy/companies";
import { gateApi, gatePage, hardenApiResponse, isAssetPath } from "@/lib/security/gate";
import { gateSessionBinding } from "@/lib/security/session-bind";
import { counterpartHost, surfaceRedirect } from "@/lib/platform/tenancy/surfaces";
import { listPanels, unavailablePanelKeys } from "@/lib/platform/panels/store";
import { isSaasAppHost, isSaasHost } from "@/lib/platform/saas/hosts";
import { getEffectiveMaintenance } from "@/lib/platform/maintenance-state";
import { isTakeoverNow } from "@/lib/platform/maintenance-shared";
import { isSaasPagePath } from "@/lib/platform/saas/routes";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import type { Entitlements } from "@/lib/platform/billing/types";
import { productKeyFromSlug, productSlugFor } from "@/lib/platform/saas/product-routes";

/**
 * First-touch referral capture, server side. A `?ref=CODE` on any page view
 * is stored in an HttpOnly cookie for 30 days (first code wins) so the
 * attribution survives even when the browser blocks localStorage, the visitor
 * bounces through /clientos/login, or they sign up days later. Sign-up actions
 * read this cookie server-side — the client can't forge or drop it.
 */
const COOKIE = "yo_ref";
const MAX_AGE = 30 * 24 * 60 * 60;

// Same name as CMS_SESSION_COOKIE in src/lib/cms-auth.ts (not imported: that module is heavier than the proxy needs).
const CMS_SESSION_COOKIE = "cms_session";

/**
 * Product Registry gate: a product the platform switched off (for every company, or for this one) is not reachable — its
 * pages show "not available" and its API answers 403. The Workspace itself and anything that isn't a registry product
 * pass straight through. Fails open on a lookup error (the product's own checks still apply).
 */
async function panelGate(request: NextRequest, companyId: string | null | undefined): Promise<NextResponse | null> {
  if (!companyId) return null;
  const pathname = request.nextUrl.pathname;
  const parts = pathname.split("/").filter(Boolean);
  const isApi = parts[0] === "api";
  const segment = isApi ? parts[1] : parts[0];
  const panelKey = segment ? productKeyFromSlug(segment) ?? segment : "";
  // A company whose 30 days to verify its email ran out is on hold: its products' APIs and actions refuse, except what lifts the hold.
  // (Public endpoints — careers, leads, consent… — are not product areas and stay up.)
  const mutatingNow = !["GET", "HEAD"].includes(request.method.toUpperCase());
  if ((isApi || mutatingNow) && segment && (segment === "commandos" || productKeyFromSlug(segment)) && !LAPSE_OPEN_PATH.test(pathname)) {
    try {
      if ((await emailLapseFor(companyId)).lapsed) {
        const error = "Your workspace is on hold until its email is verified. Open /commandos/verify-required to verify it.";
        return isApi ? NextResponse.json({ error }, { status: 402, headers: { "Cache-Control": "no-store" } }) : new NextResponse(error, { status: 402, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
      }
    } catch (err) {
      console.error("[email-lapse] gate lookup failed in proxy", err);
    }
  }
  // A free trial that ended without a subscription locks the workspace: pages lead to the subscribe page, APIs and actions refuse.
  // Settings → Billing, sign-in and the subscribe page itself stay open so a plan can be bought.
  if (segment && (segment === "commandos" || productKeyFromSlug(segment)) && !TRIAL_LOCK_OPEN_PATH.test(pathname)) {
    try {
      if (await trialLockedFor(companyId)) {
        const error = "Your free trial has ended. Subscribe to a plan in Settings → Billing to continue.";
        if (isApi) return NextResponse.json({ error }, { status: 402, headers: { "Cache-Control": "no-store" } });
        if (mutatingNow) return new NextResponse(error, { status: 402, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
        return NextResponse.redirect(new URL("/commandos/subscribe-required", request.url));
      }
    } catch (err) {
      console.error("[trial-lock] gate lookup failed in proxy", err);
    }
  }
  try {
    const off = await unavailablePanelKeys(companyId);
    if (off.size === 0) return null;
    const unavailable = (key: string, name: string) => {
      if (isApi) return NextResponse.json({ error: `${name} isn't available for this workspace.` }, { status: 403 });
      const url = new URL("/product-unavailable", request.url);
      url.searchParams.set("panel", key);
      return NextResponse.rewrite(url, { status: 403 });
    };
    // The company's public website is the "website" product: its public pages go offline when it is switched off.
    if (!isApi && off.has("website") && isPublicSitePath(pathname)) return unavailable("website", "The website");
    if (!panelKey || panelKey === "workspace" || !off.has(panelKey)) return null;
    const panel = (await listPanels()).find((p) => p.key === panelKey);
    return panel && !panel.core ? unavailable(panelKey, panel.name) : null;
  } catch (err) {
    console.error("[products] availability check failed in proxy", err);
    return null;
  }
}


/**
 * Subscription gate for the business products, applied to every API call and every Server Action (page views are
 * covered by each product's layout, which sends people to the upgrade page):
 *  - a product that is not in the company's plan answers 403, whatever the caller tries;
 *  - while the subscription is suspended or canceled (read-only) nothing can be created, changed or deleted in a product.
 * Sign-in and password pages stay open. Fails open on a lookup error (each product still checks its own entitlements).
 */
const PLAN_PANELS = new Set(["hrms", "pms", "lms", "fms", "prms", "tms", "ots", "sop", "lpms", "dlms", "cms", "seo", "smms", "aibots", "intelligence", "portal"]);
const OPEN_IN_READ_ONLY = /\/(login|logout|signin|change-password|forgot-password|reset-password|verify-email|handoff)(\/|$)/i;
const entCache = new Map<string, { at: number; ent: Entitlements }>();

async function planGate(request: NextRequest, companyId: string | null | undefined): Promise<NextResponse | null> {
  if (!companyId) return null;
  const pathname = request.nextUrl.pathname;
  const parts = pathname.split("/").filter(Boolean);
  const isApi = parts[0] === "api";
  const segment = isApi ? parts[1] : parts[0];
  const panelKey = segment ? productKeyFromSlug(segment) ?? segment : "";
  if (!panelKey || !PLAN_PANELS.has(panelKey)) return null;
  const mutating = !["GET", "HEAD"].includes(request.method.toUpperCase());
  if (!isApi && !mutating) return null;
  try {
    let hit = entCache.get(companyId);
    if (!hit || Date.now() - hit.at > 20_000) {
      hit = { at: Date.now(), ent: await entitlementsFor(companyId) };
      if (entCache.size > 2000) entCache.clear();
      entCache.set(companyId, hit);
    }
    const { ent } = hit;
    const deny = (status: number, error: string) => (isApi ? NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }) : new NextResponse(error, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } }));
    if (ent.modules !== null && !ent.modules.has(panelKey)) return deny(403, "This product isn't included in your plan. Upgrade in Settings → Billing to unlock it.");
    if (ent.readOnly && mutating && !OPEN_IN_READ_ONLY.test(pathname)) return deny(402, "Your workspace is read-only because its subscription is suspended or has ended. You can still view everything; renew in Settings → Billing to make changes.");
  } catch (err) {
    console.error("[plan] gate lookup failed in proxy", err);
  }
  return null;
}

/** A kind of PDF the platform switched off (Platform Console → Documents & PDFs) answers 403 for every company. Fails open on a lookup error. */
async function pdfGate(request: NextRequest): Promise<NextResponse | null> {
  if (request.method !== "GET") return null;
  const type = pdfTypeOfRequest(request.nextUrl.pathname, request.nextUrl.searchParams);
  if (!type) return null;
  try {
    if (pdfOff(await getFeatureControls(), type.key)) return NextResponse.json({ error: `${type.name} is turned off by the platform.` }, { status: 403, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[pdf] gate lookup failed in proxy", err);
  }
  return null;
}

export async function proxy(request: NextRequest) {
  // API calls: only the product gate applies (everything below is about page views).
  const hostHeader0 = request.headers.get("host") ?? "";
  const onSaasHost0 = (() => {
    const h = normalizeHost(hostHeader0);
    return !!h && (isSaasHost(h) || isSaasAppHost(h));
  })();
  const isApi = request.nextUrl.pathname.startsWith("/api/");
  const pathParts = request.nextUrl.pathname.split("/").filter(Boolean);
  const oldProductSegment = isApi ? pathParts[1] : pathParts[0];
  // The Platform Console now lives at /console. Keep bookmarks to the old route working.
  if (!isApi && (request.nextUrl.pathname === "/platform" || request.nextUrl.pathname.startsWith("/platform/")) && ["GET", "HEAD"].includes(request.method.toUpperCase())) {
    const url = request.nextUrl.clone();
    url.pathname = "/console" + request.nextUrl.pathname.slice("/platform".length);
    return NextResponse.redirect(url, 308);
  }
  const oldProductKey = oldProductSegment ? productKeyFromSlug(oldProductSegment) : undefined;
  const isOldProductPath = !!oldProductKey && oldProductSegment !== productSlugFor(oldProductKey);
  if (!isApi && isOldProductPath && ["GET", "HEAD"].includes(request.method.toUpperCase())) {
    const url = request.nextUrl.clone();
    url.pathname = `/${productSlugFor(oldProductKey!)}` + request.nextUrl.pathname.slice(oldProductSegment!.length + 1);
    return NextResponse.redirect(url, 308);
  }
  // Anything that changes data — a Server Action, a form post, any non-GET route — goes through the same front door as the API.
  const mutating = !["GET", "HEAD"].includes(request.method.toUpperCase());
  if (isApi || mutating) {
    let apiCompany: string | null | undefined;
    try {
      apiCompany = await resolveCompanyIdByHost(hostHeader0);
    } catch {
      apiCompany = undefined;
    }
    // A suspended company's address answers exactly one thing: the reactivation request form (the route does its own origin and rate checks).
    if (apiCompany === null && request.method === "POST" && request.nextUrl.pathname === "/api/reactivation" && (await resolveSuspendedHost(hostHeader0).catch(() => null))) return NextResponse.next();
    const blocked = await gateApi(request, hostHeader0, apiCompany ?? null, onSaasHost0);
    if (blocked) return blocked;
    const planBlocked = await planGate(request, apiCompany);
    if (planBlocked) return planBlocked;
    const pdfBlocked = await pdfGate(request);
    if (pdfBlocked) return pdfBlocked;
    if (!isAssetPath(request.nextUrl.pathname, request.method)) {
      const copied = await gateSessionBinding(request, true);
      if (copied) return copied;
    }
    if (!isApi) return NextResponse.next();
    const out = (await panelGate(request, apiCompany)) ?? NextResponse.next();
    const hardened = hardenApiResponse(out, isAssetPath(request.nextUrl.pathname, request.method) ? "asset" : "other");
    if (isApi && isOldProductPath && oldProductKey) {
      const url = request.nextUrl.clone();
      url.pathname = `/api/${productSlugFor(oldProductKey)}` + request.nextUrl.pathname.slice(`/api/${oldProductSegment}`.length);
      return NextResponse.rewrite(url, { headers: hardened.headers });
    }
    return hardened;
  }

  // The SaaS product's own website: its public pages live under /saas and need no company.
  if (isSaasHost(request.headers.get("host")) && isSaasPagePath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/saas${request.nextUrl.pathname === "/" ? "" : request.nextUrl.pathname.replace(/\/+$/, "")}`;
    return NextResponse.rewrite(url);
  }

  // Every page belongs to the company whose domain it was requested on. A
  // host no company owns gets a plain "no workspace here" page, not an
  // error. A registry lookup failure falls through (fail open): the page's
  // own data access resolves the company again and fails safe on its own.
  let info: HostInfo | null | undefined;
  try {
    info = await resolveHostInfo(request.headers.get("host"));
  } catch (err) {
    console.error("[tenancy] company lookup failed in proxy", err);
  }
  // A signer's link (/sign/<token>) works on any address: the page takes the company from the signature request the token belongs to, never from the host.
  const signLink = (request.nextUrl.pathname.split("/")[1] ?? "") === "sign";
  if (info === null && !signLink) {
    // A suspended company's address explains that, and lets its people ask for reactivation (not the generic "no workspace" page).
    if (request.method === "GET" || request.method === "HEAD") {
      const suspended = await resolveSuspendedHost(request.headers.get("host")).catch(() => null);
      if (suspended) return NextResponse.rewrite(new URL("/company-suspended", request.url), { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.rewrite(new URL("/workspace-not-found", request.url), { status: 404 });
  }
  const companyId = info?.companyId;

  // Page views: scanner traps, scripted scrapers and floods (crawlers are kept off the signed-in products altogether).
  const appSurface = info ? info.surface === "app" : isSaasAppHost(normalizeHost(hostHeader0) ?? "");
  const pageBlocked = await gatePage(request, appSurface);
  if (pageBlocked) return pageBlocked;
  const copiedSession = await gateSessionBinding(request, false);
  if (copiedSession) return copiedSession;

  // A company's website and its products live on different hosts: a page of the other side is sent to its own host
  // (so a link to /commandos from the website, or to / from a product, still lands somewhere right).
  if (info) {
    const action = surfaceRedirect(info.surface, request.nextUrl.pathname);
    if (action) {
      // Built from the Host header, not `request.url`, which can carry the server's own hostname.
      const hostHeader = request.headers.get("host");
      const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || request.nextUrl.protocol.replace(":", "");
      const to = (host: string, path: string) => NextResponse.redirect(new URL(path, `${proto}://${host}`));
      // The product's own app host (SelfRun) opens on the Platform Console; every company's app host opens on its Workspace.
      if (action === "app-home" && hostHeader) return to(hostHeader, isSaasAppHost(hostHeader) ? "/console" : "/commandos");
      const target = action === "app-home" ? null : counterpartHost(hostHeader, action === "to-app" ? "site" : "app");
      if (target) return to(target, `${request.nextUrl.pathname}${request.nextUrl.search}`);
    }
  }

  // Platform maintenance (Platform Console → Maintenance), "takeover" mode: every company's website / products show the maintenance screen for
  // the length of the window and come back on their own after it. Page views only (APIs, webhooks, crons and payment links keep working),
  // and never the product's own hosts, so the platform staff can always end it.
  if (info && !isSaasHost(request.headers.get("host")) && !isSaasAppHost(request.headers.get("host"))) {
    const first = request.nextUrl.pathname.split("/")[1] ?? "";
    if (!["platform-maintenance", "offline-shell", "pay", "verify", "sign"].includes(first)) {
      const m = await getEffectiveMaintenance(info.companyId);
      if (isTakeoverNow(m, info.surface)) {
        return NextResponse.rewrite(new URL("/console-maintenance", request.url), { status: 503, headers: { "Retry-After": String(Math.max(30, Math.ceil((m.endsAt - Date.now()) / 1000))), "Cache-Control": "no-store" } });
      }
    }
  }

  const blocked = await panelGate(request, companyId);
  if (blocked) return blocked;

  // CMS maintenance mode: visitors to the public site get the maintenance page
  // (503, so search engines retry instead of indexing it). Anyone signed in to
  // the CMS still sees the real site, to check their work before reopening.
  if (companyId && isPublicSitePath(request.nextUrl.pathname) && !request.cookies.get(CMS_SESSION_COOKIE) && (await isMaintenanceOn(companyId))) {
    return NextResponse.rewrite(new URL("/maintenance", request.url), { status: 503, headers: { "Retry-After": "3600" } });
  }

  const raw = request.nextUrl.searchParams.get("ref");
  const code = raw?.trim().toUpperCase();
  const response = NextResponse.next();
  if (code && /^[A-Z0-9]{6,10}$/.test(code) && !request.cookies.get(COOKIE)) {
    response.cookies.set(COOKIE, code, { maxAge: MAX_AGE, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  // Anonymous, first-party device id — lets the referral fraud check notice one browser creating several "referred" accounts. HttpOnly, random, carries no personal data.
  if (!request.cookies.get("yo_did")) {
    response.cookies.set("yo_did", crypto.randomUUID(), { maxAge: 365 * 24 * 60 * 60, path: "/", sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  // The agent directory may be shown inside a frame by the websites the company listed on its public agents, and by no other website.
  if (companyId && request.nextUrl.pathname === "/agentos-public/agents") {
    response.headers.set("Content-Security-Policy", `${await frameAncestorsFor(companyId)}; base-uri 'self'; object-src 'none'; form-action 'self'`);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
  }
  // A signed-in page is for that person only: no browser, shared or CDN cache may keep a copy of it.
  if (appSurface) response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

export const config = {
  // Page views and API calls (API calls only get the product gate) — skip Next internals and static files.
  // Everything except Next internals and plain static assets. (Paths with other dots — /.env, /wp-login.php, /backup.sql — DO come through, so the scanner traps in the gate see them.)
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|map|woff2?|ttf|otf|mp4|webm|mp3|wav|pdf|txt|xml|json|webmanifest)$).*)"],
};
