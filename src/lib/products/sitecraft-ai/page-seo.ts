import type { Metadata } from "next";

/**
 * A CMS page's SEO + structured data. Stored on the page (draft/live/version)
 * so it's edited, published and versioned with the page's content. The SEO
 * product's per-page overrides (`withSeoOverrides`) still layer on top.
 *
 * Pure module — the page builder's editor (client) and the public route
 * (server) both use it.
 */
export interface PageSeo {
  title: string;
  description: string;
  keywords?: string[];
  /** Canonical URL/path. Omitted = no canonical tag. */
  canonical?: string;
  robots?: { index: boolean; follow: boolean };
  /** Social share (Open Graph / Twitter) image. Omitted = no social tags for the page. */
  image?: string;
  imageAlt?: string;
  /** Social title/description when they differ from the page's own. */
  socialTitle?: string;
  socialDescription?: string;
}

/**
 * The page's outer frame — layout only, never content. Maps to the wrapper
 * markup the site's pages have always used (see `CmsPageView`).
 */
export const PAGE_FRAMES = ["default", "accent", "form", "plain", "none"] as const;
export type PageFrame = (typeof PAGE_FRAMES)[number];
export const parsePageFrame = (v: unknown): PageFrame => (PAGE_FRAMES as readonly unknown[]).includes(v) ? (v as PageFrame) : "default";

/**
 * JSON-LD blocks, output in order. A block is either literal schema.org JSON,
 * or `{ "$generate": "<kind>", …params }` — filled from live records at render
 * time so it never drifts from them (see `json-ld-generators.ts`).
 */
export type PageJsonLd = Record<string, unknown>;

const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parsePageSeo(raw: unknown): PageSeo | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = s(r.title, 300);
  if (!title) return null;
  const seo: PageSeo = { title, description: s(r.description, 1000) };
  const keywords = Array.isArray(r.keywords) ? r.keywords.map((k) => s(k, 200)).filter(Boolean).slice(0, 60) : [];
  if (keywords.length) seo.keywords = keywords;
  for (const k of ["canonical", "image", "imageAlt", "socialTitle", "socialDescription"] as const) {
    const v = s(r[k], k === "socialDescription" ? 1000 : 1000);
    if (v) seo[k] = v;
  }
  const robots = r.robots as { index?: unknown; follow?: unknown } | undefined;
  if (robots && typeof robots === "object") seo.robots = { index: robots.index !== false, follow: robots.follow !== false };
  return seo;
}

export function parsePageJsonLd(raw: unknown): PageJsonLd[] {
  return Array.isArray(raw) ? raw.filter((x): x is PageJsonLd => !!x && typeof x === "object" && !Array.isArray(x)).slice(0, 30) : [];
}

/**
 * The page's Next.js metadata — same shape the site's pages have always produced. `siteName` = the brand (CMS → Site Identity);
 * `siteUrl` = the company's public origin (`companySiteUrl()`).
 */
export function buildPageMetadata(seo: PageSeo, path: string, siteName: string, siteUrl: string): Metadata {
  const m: Metadata = { title: seo.title, description: seo.description };
  if (seo.keywords?.length) m.keywords = seo.keywords;
  if (seo.canonical) m.alternates = { canonical: seo.canonical };
  if (seo.robots) m.robots = seo.robots;
  if (seo.image) {
    const title = seo.socialTitle ?? seo.title;
    const description = seo.socialDescription ?? seo.description;
    m.openGraph = {
      title,
      description,
      url: `${siteUrl}${path}`,
      siteName,
      images: [{ url: seo.image, alt: seo.imageAlt ?? title }],
      type: "website",
      locale: "en_US",
    };
    m.twitter = { card: "summary_large_image", title, description, images: [seo.image] };
  }
  return m;
}
