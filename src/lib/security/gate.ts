import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveHostInfo } from "@/lib/platform/tenancy/companies";
import { normalizeHost } from "@/lib/platform/tenancy/companies";
import { isSaasAppHost, isSaasHost } from "@/lib/platform/saas/hosts";
import { clientIpFrom } from "@/lib/security/ip";
import { ban, hit, isBanned } from "@/lib/security/memory-limit";
import { rateLimit } from "@/lib/security/rate-limit";

/**
 * The front door. Every request to `/api/*` (and every Server Action post) passes through here BEFORE any route code runs, and every page
 * view passes the bot / flood checks. It is deny-by-default:
 *
 *   1. The host must be one of the platform's own (a company's site / app host or the product's) — nothing else is served.
 *   2. The browser must say it is on one of those hosts too: a browser's `Origin` / `Sec-Fetch-Site` headers are checked, so another website
 *      (or a page on another company's domain) cannot make a visitor's browser call these APIs. No CORS header is ever sent.
 *   3. Scripted clients (curl, python, scrapers, headless browsers, …) are refused outright; so are IPs that probe for secrets files.
 *   4. A route that needs a signed-in person is refused here, before the handler, when no session cookie is present at all.
 *   5. Floods are slowed per address and per session; sign-in, forms and exports have their own tighter limits; the machine endpoints
 *      (payment webhooks, cron) must arrive with their signature / bearer header or they never reach their handler.
 * What stays in the route / action: who the person is, what they may see (roles, permissions, tenant). This layer never replaces that.
 *
 * Honest limit: headers can be forged by someone determined, so this is a barrier against casual misuse, other websites, scrapers and
 * stolen-link abuse — the hard guarantees are the sessions, roles and per-company data scoping behind it, plus the rate limits above.
 */

const PROD = process.env.NODE_ENV === "production";
/** Dev keeps scripted clients working (our own tests use curl); production — or SECURITY_STRICT=1 — enforces everything. */
export const STRICT = PROD || process.env.SECURITY_STRICT === "1";

export const SESSION_COOKIES = [
  "hub_session", "portal_session", "lms_session", "cms_session", "hrms_session", "pms_session", "prms_session", "tms_session", "fms_session",
  "smms_session", "sop_session", "dlms_session", "seo_session", "ots_session", "lpms_session", "aibots_session", "messenger_session",
];

type Class = "machine" | "bearer-or-session" | "asset" | "public" | "navigation" | "session";
interface Rule { re: RegExp; methods?: string[]; cls: Class; /** Declared body cap in bytes, enforced at the door for machine routes. */ maxBody?: number }

// First match wins. Anything not listed is "session": a signed-in person is required.
const RULES: Rule[] = [
  // Machine-to-machine: signed / bearer requests from payment providers, schedulers and our own build pipeline.
  // Razorpay's webhooks (customer payments in CashFlow, RazorpayX payouts in TalentOS): no browser, no session, only the signature header.
  { re: /^\/api\/(platform\/billing\/webhook|cashflow-ai\/webhooks\/|talentos\/payroll\/webhook)/, cls: "machine" },
  // Voice calls: Twilio (voice / status / transcription callbacks of the conference) and the ElevenLabs post-call webhook. POST only; the handler
  // verifies the signature (HMAC / X-Twilio-Signature) against the company named by the opaque ?t= token. Nothing else under /api/agentos is opened.
  { re: /^\/api\/agentos\/twilio\/(voice|status|transcription)$/, methods: ["POST"], cls: "machine", maxBody: 64 * 1024 },
  { re: /^\/api\/agentos\/voice\/webhook$/, methods: ["POST"], cls: "machine", maxBody: 5_000_000 },
  { re: /\/cron$|^\/api\/wallet\/expiry-sweep$|^\/api\/apps\/builds\/(callback|cron)$|^\/api\/indexing$/, cls: "machine" },
  { re: /^\/api\/lms\/chatbot\/reindex$/, cls: "bearer-or-session" },
  // A provider fetches a signed link (the signature is checked by the handler).
  { re: /^\/api\/smms\/media\/public\//, cls: "asset" },
  // The photos of the agents a company lists on its website (read-only; the route serves public agents only).
  { re: /^\/api\/agentos-public\/avatar\/[^/]+$/, methods: ["GET"], cls: "asset" },
  // Public pictures and files the site itself embeds (also loaded from emails): read-only, rate limited.
  { re: /^\/api\/(platform\/brand-logo|cms\/media|apps\/assets|desktop\/branding|site-verification)\//, methods: ["GET", "HEAD"], cls: "asset" },
  { re: /^\/api\/desktop\/branding$/, methods: ["GET", "HEAD"], cls: "asset" },
  // The browser comes back from another site (provider consent screens) or follows a link.
  { re: /^\/api\/smms\/oauth\/[^/]+\/callback$/, cls: "navigation" },
  { re: /^\/workspace\/(handoff|verify-email)/, cls: "navigation" },
  // A customer paying a payment link is not signed in: these two are called from the public pay page (the link's token authorises the amount,
  // Razorpay confirms the payment). Browser origin and rate limits still apply; the handlers check everything else.
  { re: /^\/api\/cashflow-ai\/payments\/(create-intent|verify)$/, methods: ["POST"], cls: "public" },
  // The customer's own receipt PDF, opened with the link's secret token once the link is paid.
  { re: /^\/api\/cashflow-ai\/payments\/receipt\/[a-f0-9]{32}$/, methods: ["GET"], cls: "public" },
  // A signer answering a signature request (one-time code, sign, decline). No session: the link's secret token (43 characters) is the credential and
  // the handlers look it up, rate limit and check everything. Browser origin and the front door's limits still apply.
  { re: /^\/api\/contractflow-ai\/sign\/[A-Za-z0-9_-]{43}\/(otp-send|otp-check|sign|decline)$/, methods: ["POST"], cls: "public" },
  // The public website talking to its own backend (forms, chat, offers, push sign-up …).
  { re: /^\/api\/(chat|careers|offers|referral|web-push|voice|game|client-error|consent|push\/config|support\/public)(\/|$)/, cls: "public" },
  { re: /^\/api\/leads\/[^/]+$/, methods: ["POST"], cls: "public" },
  // A visitor of the company's website talking to a public voice agent (browser origin and rate limits still apply; the handlers check the rest).
  { re: /^\/api\/agentos-public\/session(\/finish)?$/, methods: ["POST"], cls: "public" },
  { re: /^\/api\/cms\/theme-preview\/exit$/, cls: "public" },
  // Pre-sale video meetings: external clients join without a staff session
  { re: /^\/api\/dealflow-ai\/meetings\/[^/]+(\/token)?$/, cls: "public" },
  { re: /^\/api\/dealflow-ai\/meetings\/(agent-speak|tts)$/, methods: ["POST"], cls: "public" },
  // Server Actions travel sealed through here; the forwarded action is checked again by this gate as a normal action.
  { re: /^\/api\/secure\/action$/, methods: ["POST"], cls: "public" },
];

function matchRule(pathname: string, method: string): Rule | null {
  for (const r of RULES) if (r.re.test(pathname) && (!r.methods || r.methods.includes(method))) return r;
  return null;
}
export function classify(pathname: string, method: string): Class {
  return matchRule(pathname, method)?.cls ?? "session";
}

// ── Scripted clients ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const SCRIPTED = /(curl|wget|python|requests|httpx|aiohttp|urllib|axios|node-fetch|undici|got\/|go-http|okhttp|java\/|libwww|perl|ruby|php|scrapy|mechanize|httpie|postman|insomnia|restsharp|apache-httpclient|headless|phantomjs|selenium|puppeteer|playwright|webdriver|cypress|lighthouse|chrome-lighthouse|spider|crawler|scraper|harvest|libcurl|powershell|winhttp|colly|jsdom|bot\b)/i;
/**
 * AI assistants and AI search that read a public page when someone asks them about the product (ChatGPT, Claude, Perplexity). They are held
 * to the same terms as search engines: the public website only, never the products or the API, at a polite rate. Blocking them made them
 * describe the product from guesses instead of from its own pages.
 */
const SEARCH_BOTS = /(googlebot|chatgpt-user|oai-searchbot|gptbot|claude-user|claude-searchbot|claude-web|claudebot|perplexitybot|perplexity-user|bingbot|duckduckbot|slurp|baiduspider|yandexbot|applebot|facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|pinterestbot|google-inspectiontool|adsbot-google|mediapartners-google|bingpreview)/i;
const AI_SCRAPERS = /(ccbot|anthropic-ai|bytespider|amazonbot|meta-externalagent|diffbot|omgili|imagesiftbot|petalbot|ahrefsbot|semrushbot|mj12bot|dotbot|dataforseobot|barkrowler|screaming frog)/i;

export function userAgentKind(ua: string): "browser" | "search-bot" | "scripted" {
  if (!ua || ua.length < 8) return "scripted";
  if (AI_SCRAPERS.test(ua)) return "scripted";
  if (SEARCH_BOTS.test(ua)) return "search-bot";
  if (/WorkspaceDesktop\//.test(ua)) return "browser";
  if (SCRIPTED.test(ua)) return "scripted";
  return /mozilla\//i.test(ua) ? "browser" : "scripted";
}

// ── Scanner traps: nothing here is real, so anyone asking is probing ───────────────────────────────────────────────────────────────────────
// `/console` is a real Platform Console route. Never classify its subroutes as scanner probes.
const TRAPS = /(^|\/)(\.env(\.|$)|\.git(\/|$)|\.svn|\.aws|\.ssh|\.ds_store|wp-admin|wp-login|wp-content|wp-includes|xmlrpc\.php|phpmyadmin|pma\/|adminer|cgi-bin|phpinfo|vendor\/phpunit|composer\.(json|lock)|server-status|actuator|\.htpasswd|id_rsa|backup\.(sql|zip|tar)|dump\.sql|config\.(php|yml|yaml|ini)|web\.config|boaform|solr|jenkins|manager\/html)/i;

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, ...body }, { status, headers: { "Cache-Control": "no-store", ...extra } });
}
const refuse = () => json(403, { error: "Forbidden" });

// ── Browser origin ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function sameTenant(hostHeader: string, otherUrl: string, companyId: string | null): Promise<boolean> {
  let other: URL;
  try {
    other = new URL(otherUrl);
  } catch {
    return false;
  }
  if (other.host.toLowerCase() === hostHeader.toLowerCase()) return true;
  const otherHost = normalizeHost(other.host);
  const thisHost = normalizeHost(hostHeader);
  if (!otherHost || !thisHost) return false;
  const thisSaas = isSaasHost(thisHost) || isSaasAppHost(thisHost);
  if (thisSaas) return isSaasHost(otherHost) || isSaasAppHost(otherHost);
  if (!companyId) return false;
  const info = await resolveHostInfo(otherHost);
  return info?.companyId === companyId;
}

/** Whether the browser says this request comes from one of this company's own hosts. `null` = it did not say (a non-browser client). */
async function browserOrigin(req: NextRequest, host: string, companyId: string | null): Promise<boolean | null> {
  const h = req.headers;
  const origin = h.get("origin");
  const referer = h.get("referer");
  const site = h.get("sec-fetch-site");
  if (site === "cross-site") return false;
  if (origin && origin !== "null") return sameTenant(host, origin, companyId);
  if (origin === "null") return /WorkspaceDesktop\//.test(h.get("user-agent") ?? "");
  if (site === "same-origin" || site === "same-site") return true;
  if (referer) return sameTenant(host, referer, companyId);
  if (site === "none") return null;
  return null;
}

const NEXT_ACTION = (req: NextRequest) => req.headers.has("next-action");
const LOGINISH = /\/(login|signin|forgot-password|reset-password|register|join|change-password|handoff|verify-email|invite)(\/|$)/i;
const HEAVY = /\/(export|pdf|bank-file|report|reports|statement|template)(\/|$)|\.(csv|xlsx|pdf)$/i;
const AI = /^\/api\/(ai|intelligence|aibots\/chat|voice|lpms\/ai|chat)(\/|$)/;
const UPLOAD = /\/(upload|import|documents|attachments|files|media)(\/|$)/i;
const STREAM = /\/(stream|signal-stream)$/;

function sessionKey(req: NextRequest): string {
  for (const n of SESSION_COOKIES) {
    const v = req.cookies.get(n)?.value;
    if (v) return `${n}:${v.slice(0, 16)}`;
  }
  return "";
}

function tooMany(retryAfter: number, api: boolean) {
  const headers = { "Retry-After": String(retryAfter), "Cache-Control": "no-store" };
  return api
    ? NextResponse.json({ ok: false, error: "Too many requests. Please slow down and try again shortly." }, { status: 429, headers })
    : new NextResponse("Too many requests. Please slow down and try again shortly.", { status: 429, headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Page views: scanner traps, scripted scrapers and floods. `appSurface` = a app host (signed-in work: no crawlers at all).
 * Returns a response to stop the request, or null to carry on.
 */
export async function gatePage(req: NextRequest, appSurface: boolean): Promise<NextResponse | null> {
  const ip = clientIpFrom(req.headers);
  if (STRICT && isBanned(ip)) return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const path = req.nextUrl.pathname;
  if (TRAPS.test(path)) {
    if (STRICT) ban(ip, 60);
    return new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  const ua = req.headers.get("user-agent") ?? "";
  const kind = userAgentKind(ua);
  if (STRICT && !NEXT_ACTION(req)) {
    if (kind === "scripted") return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
    // Signed-in work is never for crawlers; the public site's crawlers are held to a polite rate.
    if (kind === "search-bot" && appSurface) return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const bucket = kind === "search-bot" ? "bot" : appSurface ? "app" : "site";
  const limit = kind === "search-bot" ? 120 : appSurface ? 900 : 300;
  const r = hit(`page:${bucket}:${ip}`, limit, 60_000);
  if (!r.ok) return tooMany(r.retryAfter, false);
  return null;
}

/**
 * Everything under /api and every Server Action post. `companyId` is the company that owns the host (null on the product's own hosts).
 * Returns a response to stop the request, or null to carry on to the route.
 */
export async function gateApi(req: NextRequest, host: string, companyId: string | null, onSaas: boolean): Promise<NextResponse | null> {
  const ip = clientIpFrom(req.headers);
  if (STRICT && isBanned(ip)) return json(404, { error: "Not found" });
  const method = req.method.toUpperCase();
  const path = req.nextUrl.pathname;
  const action = NEXT_ACTION(req) && !path.startsWith("/api/");

  // 1. Only the platform's own hosts are served.
  if (!companyId && !onSaas) return json(404, { error: "Not found" });
  // 2. No CORS, ever: a cross-origin preflight is answered with nothing, so the browser refuses the real request.
  if (method === "OPTIONS") return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store", Allow: "GET, HEAD, POST, PUT, PATCH, DELETE" } });
  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(method)) return json(405, { error: "Method not allowed" });
  if (TRAPS.test(path)) { if (STRICT) ban(ip, 60); return json(404, { error: "Not found" }); }

  const rule = action ? null : matchRule(path, method);
  const cls: Class = rule?.cls ?? "session";
  const ua = req.headers.get("user-agent") ?? "";
  const kind = userAgentKind(ua);

  // 3. Machine endpoints: must carry their signature / bearer, nothing else is expected of them.
  if (cls === "machine") {
    const h = req.headers;
    const signed = h.has("authorization") || [...h.keys()].some((k) => /signature|webhook-secret|x-hub-signature/i.test(k));
    if (!signed) return refuse();
    if (rule?.maxBody && Number(h.get("content-length") ?? 0) > rule.maxBody) return json(413, { error: "Payload too large" });
    const r = hit(`machine:${ip}`, 600, 60_000);
    return r.ok ? null : tooMany(r.retryAfter, true);
  }
  if (cls === "bearer-or-session" && !req.headers.get("authorization")?.startsWith("Bearer ") && !sessionKey(req)) return json(401, { error: "Unauthorized" });

  // 4. Assets: read-only, anyone may fetch, but not in bulk.
  if (cls === "asset") {
    if (!["GET", "HEAD"].includes(method)) return refuse();
    const r = hit(`asset:${ip}`, 600, 60_000);
    return r.ok ? null : tooMany(r.retryAfter, true);
  }

  // 5. Scripted clients are refused (production). The product's own desktop app announces itself.
  if (STRICT && kind !== "browser") return refuse();

  // 6. The browser must be on one of this company's own hosts (CSRF / cross-site / other-company protection).
  if (cls !== "navigation") {
    const origin = await browserOrigin(req, host, companyId);
    const mutating = method !== "GET" && method !== "HEAD";
    if (origin === false) return refuse();
    // A browser always sends Sec-Fetch-Site; its absence (or "none": typed straight into the address bar) on an API call means a script.
    if (STRICT && origin === null) return refuse();
    if (origin === null && mutating && STRICT) return refuse();
  } else {
    if (req.headers.get("sec-fetch-site") === null && STRICT && kind !== "browser") return refuse();
  }

  // 7. Signed-in routes need a session cookie to even reach their handler.
  const sess = sessionKey(req);
  if ((cls === "session" || cls === "navigation") && !action && !sess) return json(401, { error: "Unauthorized" });

  // 8. Rate limits — tighter where abuse hurts (sign-in, AI, exports, uploads, streams), generous elsewhere.
  if (LOGINISH.test(path)) {
    const r = await rateLimit(req, "login-ish", method === "GET" ? 60 : 15, 60);
    if (!r.ok) return tooMany(r.retryAfter, true);
  }
  const who = sess || ip;
  let limit = 900; const win = 60_000; let tag = "api";
  if (AI.test(path)) { limit = 40; tag = "ai"; }
  else if (HEAVY.test(path)) { limit = 20; tag = "heavy"; }
  else if (STREAM.test(path)) { limit = 30; tag = "stream"; }
  else if (UPLOAD.test(path) && method !== "GET") { limit = 40; tag = "upload"; }
  else if (cls === "public") { limit = method === "GET" ? 240 : 40; tag = "public"; }
  else if (action) { limit = 300; tag = "action"; }
  const r1 = hit(`${tag}:${who}`, limit, win);
  if (!r1.ok) return tooMany(r1.retryAfter, true);
  // One address can't open many accounts' worth of requests either (offices share an address, so this is generous).
  const r2 = hit(`ip:${tag}:${ip}`, limit * 6, win);
  if (!r2.ok) return tooMany(r2.retryAfter, true);
  // Public forms are the favourite target of spam: a shared, exact limit as well.
  if (cls === "public" && method !== "GET") {
    const r3 = await rateLimit(req, `pub:${path.split("/").slice(0, 4).join("/")}`, 60, 600);
    if (!r3.ok) return tooMany(r3.retryAfter, true);
  }
  // Declared body size (the handlers read their own caps; this refuses obviously oversized posts before they are read).
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 60 * 1024 * 1024) return json(413, { error: "Payload too large" });
  return null;
}

/** Headers added to every API answer. No CORS header is ever added — that is the point. */
export function hardenApiResponse(res: NextResponse, cls: "asset" | "other" = "other"): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Vary", "Origin, Sec-Fetch-Site");
  if (cls !== "asset") {
    res.headers.set("Cross-Origin-Resource-Policy", "same-site");
    res.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return res;
}
export const isAssetPath = (p: string, m: string) => classify(p, m) === "asset";
