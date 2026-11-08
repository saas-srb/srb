import type { Metadata } from "next";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";
import { BASE_KEYWORDS } from "@/lib/platform/saas/product-seo";

const OG_SIZE = { width: 1200, height: 630 };
/** The brand's X/Twitter handle, if it has one (`SAAS_TWITTER_HANDLE`, such as @selfrun): added to every card so shares credit the account. */
const TWITTER = process.env.SAAS_TWITTER_HANDLE ? `@${process.env.SAAS_TWITTER_HANDLE.replace(/^@/, "")}` : "";

function uniq(list: string[], max = 30) {
  const seen = new Set<string>();
  return list.filter((k) => { const t = k.trim().toLowerCase(); if (!t || seen.has(t)) return false; seen.add(t); return true; }).slice(0, max);
}

/** A sentence-safe trim to the length search results show (about 160 characters). */
export function trimDescription(text: string, max = 158): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(", "));
  return `${(stop > 90 ? cut.slice(0, stop) : cut.slice(0, cut.lastIndexOf(" "))).replace(/[,;:.\s]+$/, "")}.`;
}

/** The link-preview image of a page: drawn on request by /og with the page's own title. */
export function ogImageUrl(title: string, sub?: string, tag?: string): string {
  const q = new URLSearchParams({ title: title.slice(0, 90) });
  if (sub) q.set("sub", sub.slice(0, 140));
  if (tag) q.set("tag", tag.slice(0, 40));
  return `/og?${q.toString()}`;
}

export interface PageMetaInput {
  /** The page's path, such as /pricing. Used for the canonical address and the share URL. */
  path: string;
  /** The title before the brand suffix. Under about 55 characters. */
  title: string;
  description: string;
  /** Page-specific search keywords; the platform's own are added after them. */
  keywords?: string[];
  /** A short label for the preview image, such as "Product" or "Guide". */
  tag?: string;
  type?: "website" | "article";
  noindex?: boolean;
  /** For articles. */
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  section?: string;
  /** Add the platform keywords after the page's own (default true). */
  baseKeywords?: boolean;
}

/**
 * Every page's metadata, complete: title, description, keywords, canonical and language alternates, Open Graph (Facebook, LinkedIn,
 * WhatsApp, Slack, Telegram, Discord), Twitter/X card, a page-specific preview image, and robots directives for Google and Bing.
 */
export function pageMeta(i: PageMetaInput): Metadata {
  const description = trimDescription(i.description);
  const fullTitle = `${i.title} | ${SAAS_BRAND.name}`;
  const image = ogImageUrl(i.title, description, i.tag);
  const images = [{ url: image, ...OG_SIZE, alt: `${i.title}: ${SAAS_BRAND.name}` }];
  // Search results show about 60 characters: a long title keeps its own words and drops the brand suffix; a very long one is cut at a word.
  const room = 60 - ` | ${SAAS_BRAND.name}`.length;
  const shortTitle = i.title.length <= 60 ? i.title : `${i.title.slice(0, 58).replace(/\s+\S*$/, "")}…`;
  return {
    title: i.title.length <= room ? i.title : { absolute: shortTitle },
    description,
    keywords: uniq([...(i.keywords ?? []), ...(i.baseKeywords === false ? [] : BASE_KEYWORDS)]),
    alternates: { canonical: i.path, languages: { "en-IN": i.path, en: i.path, "x-default": i.path } },
    robots: i.noindex
      ? { index: false, follow: false }
      : { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    openGraph: {
      type: i.type ?? "website",
      url: i.path,
      siteName: SAAS_BRAND.name,
      locale: "en_IN",
      title: fullTitle,
      description,
      images,
      ...(i.type === "article" ? { publishedTime: i.publishedTime, modifiedTime: i.modifiedTime ?? i.publishedTime, authors: i.authors, section: i.section } : {}),
    },
    twitter: { card: "summary_large_image", title: fullTitle, description, images: [image], ...(TWITTER ? { site: TWITTER, creator: TWITTER } : {}) },
  };
}
