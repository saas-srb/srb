/**
 * Per-company analytics, tracking scripts and site-verification settings (CMS → Settings).
 * Pure module (no server-only) so the editor and the public renderer share it.
 * Nothing is on by default, and nothing is limited: a company adds as many tags, scripts,
 * verification tokens, meta tags and verification files as it needs. (The caps below only stop a
 * runaway document from exceeding the database's size limits.)
 */

export interface VerificationFile {
  /** File served at the site root — any name, e.g. `google1a2b3c.html`, `BingSiteAuth.xml`, `ads.txt`. */
  name: string;
  /** Exact file contents. */
  content: string;
}

export interface VerificationMeta {
  /** Which attribute carries the key: `name` (most), `property` (Open Graph / Facebook) or `http-equiv`. */
  attr: "name" | "property" | "http-equiv";
  name: string;
  content: string;
}

export type ScriptPlacement = "head" | "body-start" | "body-end";

export interface CustomScript {
  id: string;
  /** A label for the editor ("Hotjar", "LinkedIn Insight" …). */
  name: string;
  /** Where it loads: early, start of the page, or last (after everything else). */
  placement: ScriptPlacement;
  enabled: boolean;
  /** Pasted exactly as the provider gives it, `<script>` tags included. */
  code: string;
}

export interface TrackingSettings {
  /** Google Analytics 4 measurement IDs (`G-…`) — as many as you need. */
  ga4Ids: string[];
  /** Google Tag Manager containers (`GTM-…`). */
  gtmIds: string[];
  /** Microsoft Clarity project IDs. */
  clarityIds: string[];
  /** Meta (Facebook) Pixel IDs. */
  metaPixelIds: string[];
  /** Tawk.to live chat, `propertyId/widgetId`. Empty = no live chat. */
  tawkId: string;
  /** Google Search Console "HTML tag" verification tokens — one per property. */
  googleSiteVerification: string[];
  /** Bing Webmaster Tools `msvalidate.01` tokens. */
  bingVerification: string[];
  /** Any other verification meta tags (Pinterest, Facebook domain, Yandex …). */
  verificationMeta: VerificationMeta[];
  /** Verification files served at the site root. */
  verificationFiles: VerificationFile[];
  /** Any number of custom scripts / pixels / widgets. */
  scripts: CustomScript[];
}

export const EMPTY_TRACKING: TrackingSettings = {
  ga4Ids: [], gtmIds: [], clarityIds: [], metaPixelIds: [], tawkId: "", googleSiteVerification: [], bingVerification: [],
  verificationMeta: [], verificationFiles: [], scripts: [],
};

/**
 * File names a company may serve at its site root: any text-like file. The names the platform itself serves
 * (robots, sitemaps, manifest) are reserved. Used by the route and (as a lookahead) by the rewrite in next.config.ts.
 */
export const VERIFICATION_FILE_RE = /^(?!robots\.txt$|sitemap[^/]*\.xml$|manifest\.json$)[A-Za-z0-9][A-Za-z0-9._-]{0,119}\.(?:html?|xml|txt|json|js|csv)$/;

const MAX_ITEMS = 500;
const MAX_CODE = 500_000;
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v.slice(0, MAX_ITEMS) : []);
const unique = (a: string[]) => [...new Set(a)];

/** Accepts a bare token or a pasted `<meta name="…" content="TOKEN">` and returns just the token. */
export function metaContent(value: string): string {
  const m = /content\s*=\s*["']([^"']+)["']/i.exec(value);
  return (m ? m[1] : value).trim().slice(0, 500);
}

/** IDs are dropped into inline scripts and URLs, so only this safe character set is allowed — everything else about them is free. */
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_./-]{0,99}$/;
const ids = (v: unknown, legacy?: unknown) => unique([...list(v), ...(legacy ? [legacy] : [])].map((x) => str(x, 100)).filter((x) => ID_RE.test(x)));
const tokens = (v: unknown, legacy?: unknown) => unique([...list(v), ...(legacy ? [legacy] : [])].map((x) => metaContent(str(x, 600))).filter(Boolean));

/** Normalises stored/submitted settings (also reads the earlier single-value shape). */
export function parseTracking(raw: unknown): TrackingSettings {
  const r = rec(raw);
  const scripts: CustomScript[] = list(r.scripts).map((s, i) => {
    const o = rec(s);
    const placement = o.placement === "body-start" || o.placement === "body-end" ? o.placement : "head";
    return {
      id: str(o.id, 40) || `script-${i + 1}`,
      name: str(o.name, 120),
      placement: placement as ScriptPlacement,
      enabled: o.enabled !== false,
      code: typeof o.code === "string" ? o.code.slice(0, MAX_CODE) : "",
    };
  }).filter((s) => s.code.trim());
  // Earlier versions kept two fixed code boxes.
  if (typeof r.headCode === "string" && r.headCode.trim()) scripts.push({ id: "legacy-head", name: "Header code", placement: "head", enabled: true, code: r.headCode.slice(0, MAX_CODE) });
  if (typeof r.bodyCode === "string" && r.bodyCode.trim()) scripts.push({ id: "legacy-body", name: "Footer code", placement: "body-end", enabled: true, code: r.bodyCode.slice(0, MAX_CODE) });

  const metaRaw = list(r.verificationMeta).map((m) => {
    const o = rec(m);
    const attr = o.attr === "property" || o.attr === "http-equiv" ? o.attr : "name";
    return { attr: attr as VerificationMeta["attr"], name: str(o.name, 120), content: metaContent(str(o.content, 600)) };
  });
  return {
    ga4Ids: ids(r.ga4Ids, r.ga4Id),
    gtmIds: ids(r.gtmIds, r.gtmId),
    clarityIds: ids(r.clarityIds, r.clarityId),
    metaPixelIds: ids(r.metaPixelIds, r.metaPixelId),
    tawkId: /^[A-Za-z0-9]{8,64}\/[A-Za-z0-9]{3,20}$/.test(str(r.tawkId, 100)) ? str(r.tawkId, 100) : "",
    googleSiteVerification: tokens(r.googleSiteVerification),
    bingVerification: tokens(r.bingVerification),
    verificationMeta: metaRaw.filter((m) => /^[a-zA-Z][\w.:-]{0,119}$/.test(m.name) && m.content),
    verificationFiles: list(r.verificationFiles)
      .map((f) => ({ name: str(rec(f).name, 130), content: typeof rec(f).content === "string" ? (rec(f).content as string).slice(0, MAX_CODE) : "" }))
      .filter((f) => VERIFICATION_FILE_RE.test(f.name) && f.content.trim()),
    scripts,
  };
}

export interface ParsedScript {
  src?: string;
  inline?: string;
  attrs: Record<string, string>;
}

/**
 * Splits a pasted HTML snippet into its `<script>` tags (which React must load explicitly — scripts inserted
 * via innerHTML never run) and the remaining markup (`<noscript>`, `<meta>`, `<link>`, `<img>` pixels …).
 */
export function splitSnippet(html: string): { scripts: ParsedScript[]; markup: string } {
  const scripts: ParsedScript[] = [];
  const markup = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (_m, attrText: string, body: string) => {
    const attrs: Record<string, string> = {};
    for (const a of attrText.matchAll(/([a-zA-Z_:][\w:.-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) attrs[a[1].toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    const { src, ...rest } = attrs;
    scripts.push({ src: src || undefined, inline: body.trim() || undefined, attrs: rest });
    return "";
  });
  return { scripts, markup: markup.trim() };
}
