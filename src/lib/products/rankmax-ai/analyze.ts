import "server-only";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

/**
 * Turns one fetched HTML document into the structured SEO snapshot every
 * audit check, the content analyser and the internal-link graph read from.
 * Pure over its input (no I/O).
 */

export interface LinkRef {
  /** Absolute URL as resolved against the page. */
  url: string;
  anchor: string;
  nofollow: boolean;
}

export interface JsonLdBlock {
  types: string[];
  valid: boolean;
  error: string | null;
}

export interface HtmlSnapshot {
  lang: string | null;
  viewport: boolean;
  title: string;
  description: string;
  canonical: string | null;
  robotsMeta: string | null;
  noindex: boolean;
  nofollow: boolean;
  h1: string[];
  h2: string[];
  h3: string[];
  headingOrderIssue: boolean;
  images: number;
  imagesMissingAlt: number;
  missingAltSamples: string[];
  imagesNoDimensions: number;
  og: { title: string | null; description: string | null; image: string | null; type: string | null };
  twitter: { card: string | null; title: string | null; description: string | null; image: string | null };
  jsonLd: JsonLdBlock[];
  internalLinks: LinkRef[];
  externalLinks: LinkRef[];
  paginationNext: string | null;
  paginationPrev: string | null;
  renderBlockingScripts: number;
  wordCount: number;
  readability: number | null;
  textHash: string | null;
  firstWords: string;
  datePublished: string | null;
  dateModified: string | null;
  /** Main text, capped — stored separately for the content analyser and link opportunities. */
  text: string;
}

const clean = (s: string | undefined | null) => (s ?? "").replace(/\s+/g, " ").trim();

function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(groups?.length ?? 1, 1);
}

/** Flesch reading ease (0–100, higher is easier), or null for too little text. */
export function fleschReadingEase(text: string): number | null {
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (words.length < 50) return null;
  const sentences = Math.max(text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().split(/\s+/).length > 2).length, 1);
  const syl = words.reduce((s, w) => s + syllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (syl / words.length);
  return Math.round(Math.min(Math.max(score, 0), 100));
}

function jsonLdTypes(node: unknown, out: string[]) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach((n) => jsonLdTypes(n, out));
    return;
  }
  const n = node as Record<string, unknown>;
  const t = n["@type"];
  if (typeof t === "string") out.push(t);
  else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.push(x));
  if (Array.isArray(n["@graph"])) jsonLdTypes(n["@graph"], out);
}

function findDate(node: unknown, key: "datePublished" | "dateModified"): string | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const d = findDate(n, key);
      if (d) return d;
    }
    return null;
  }
  const n = node as Record<string, unknown>;
  if (typeof n[key] === "string") return n[key] as string;
  return Array.isArray(n["@graph"]) ? findDate(n["@graph"], key) : null;
}

export function analyzeHtml(html: string, pageUrl: string, isInternal: (u: URL) => boolean): HtmlSnapshot {
  const $ = cheerio.load(html);
  const meta = (sel: string) => clean($(sel).first().attr("content")) || null;

  const robotsMeta = [meta('meta[name="robots"]'), meta('meta[name="googlebot"]')].filter(Boolean).join(", ") || null;
  const robotsLower = (robotsMeta ?? "").toLowerCase();

  // Headings in document order, for the outline check.
  const levels: number[] = [];
  const h1: string[] = [];
  const h2: string[] = [];
  const h3: string[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const level = Number(el.tagName.slice(1));
    levels.push(level);
    const text = clean($(el).text()).slice(0, 200);
    if (level === 1) h1.push(text);
    else if (level === 2 && h2.length < 40) h2.push(text);
    else if (level === 3 && h3.length < 40) h3.push(text);
  });
  let headingOrderIssue = false;
  let prev = 0;
  for (const l of levels) {
    if (prev > 0 && l > prev + 1) headingOrderIssue = true;
    prev = l;
  }

  let images = 0;
  let imagesMissingAlt = 0;
  let imagesNoDimensions = 0;
  const missingAltSamples: string[] = [];
  $("img").each((_, el) => {
    images++;
    const img = $(el);
    if (img.attr("alt") === undefined) {
      imagesMissingAlt++;
      if (missingAltSamples.length < 5) missingAltSamples.push((img.attr("src") ?? "").slice(0, 200));
    }
    if (!img.attr("width") || !img.attr("height")) {
      // Absolutely/fixed-positioned images (next/image `fill`, Tailwind `absolute` covers) sit in a sized box and can't shift layout.
      const style = img.attr("style") ?? "";
      const cls = img.attr("class") ?? "";
      if (!/position:\s*(absolute|fixed)/.test(style) && !/(^|\s)(absolute|fixed)(\s|$)/.test(cls)) imagesNoDimensions++;
    }
  });

  const jsonLd: JsonLdBlock[] = [];
  let datePublished: string | null = null;
  let dateModified: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      const data = JSON.parse(raw);
      const types: string[] = [];
      jsonLdTypes(data, types);
      jsonLd.push({ types, valid: true, error: null });
      datePublished ??= findDate(data, "datePublished");
      dateModified ??= findDate(data, "dateModified");
    } catch (err) {
      jsonLd.push({ types: [], valid: false, error: err instanceof Error ? err.message.slice(0, 200) : "Invalid JSON" });
    }
  });
  datePublished ??= meta('meta[property="article:published_time"]');
  dateModified ??= meta('meta[property="article:modified_time"]');

  const internalLinks: LinkRef[] = [];
  const externalLinks: LinkRef[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const a = $(el);
    const href = (a.attr("href") ?? "").trim();
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript|sms|whatsapp):/i.test(href)) return;
    let u: URL;
    try {
      u = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return;
    u.hash = "";
    const key = u.toString();
    const rel = (a.attr("rel") ?? "").toLowerCase();
    const anchor = clean(a.text()) || clean(a.attr("aria-label")) || clean(a.find("img").attr("alt"));
    const ref = { url: key, anchor: anchor.slice(0, 120), nofollow: /\b(nofollow|ugc|sponsored)\b/.test(rel) };
    const dedupe = `${key}|${ref.anchor}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    (isInternal(u) ? internalLinks : externalLinks).push(ref);
  });

  const renderBlockingScripts = $("head script[src]").filter((_, el) => {
    const s = $(el);
    // `nomodule` scripts are legacy polyfills modern browsers skip entirely.
    return s.attr("async") === undefined && s.attr("defer") === undefined && s.attr("nomodule") === undefined && s.attr("type") !== "module";
  }).length;

  const title = clean($("head > title").first().text());
  const description = meta('meta[name="description"]') ?? "";
  const canonical = clean($('link[rel="canonical"]').first().attr("href")) || null;
  const viewport = $('meta[name="viewport"]').length > 0;
  const lang = clean($("html").attr("lang")) || null;
  const og = {
    title: meta('meta[property="og:title"]'),
    description: meta('meta[property="og:description"]'),
    image: meta('meta[property="og:image"]'),
    type: meta('meta[property="og:type"]'),
  };
  const twitter = {
    card: meta('meta[name="twitter:card"]'),
    title: meta('meta[name="twitter:title"]'),
    description: meta('meta[name="twitter:description"]'),
    image: meta('meta[name="twitter:image"]'),
  };
  const paginationNext = clean($('link[rel="next"]').attr("href")) || null;
  const paginationPrev = clean($('link[rel="prev"]').attr("href")) || null;

  // Main text: drop site chrome so duplicate-content and word counts reflect the page itself.
  $("header, footer, nav, script, style, noscript, svg, iframe, template").remove();
  $('[aria-hidden="true"], .sr-only').remove();
  const main = $("main");
  const root = main.length ? main : $("body");
  const text = clean(root.text()).slice(0, 60_000);
  // Readability is scored on body copy only, one block per sentence unit, so headings,
  // cards and buttons without punctuation don't merge into one giant "sentence".
  const prose = root
    .find("p, li, blockquote, dd")
    .map((_, el) => clean($(el).text()))
    .get()
    .filter((t: string) => t.split(" ").length >= 4)
    .map((t: string) => (/[.!?]$/.test(t) ? t : `${t}.`))
    .join(" ");
  const words = text ? text.split(" ").filter((w) => /[A-Za-z0-9]/.test(w)) : [];

  return {
    lang,
    viewport,
    title,
    description,
    canonical,
    robotsMeta,
    noindex: /\bnoindex\b|\bnone\b/.test(robotsLower),
    nofollow: /\bnofollow\b|\bnone\b/.test(robotsLower),
    h1,
    h2,
    h3,
    headingOrderIssue,
    images,
    imagesMissingAlt,
    missingAltSamples,
    imagesNoDimensions,
    og,
    twitter,
    jsonLd,
    internalLinks,
    externalLinks,
    paginationNext,
    paginationPrev,
    renderBlockingScripts,
    wordCount: words.length,
    readability: fleschReadingEase(prose),
    textHash: words.length >= 50 ? createHash("sha1").update(text.toLowerCase()).digest("hex") : null,
    firstWords: words.slice(0, 100).join(" "),
    datePublished,
    dateModified,
    text,
  };
}
