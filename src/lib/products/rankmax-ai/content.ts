import "server-only";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { keywordsCol, normalizeKeyword, type Keyword } from "@/lib/products/rankmax-ai/keywords";
import type { SeoIssue, SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Content SEO: how well a page's text serves its target keywords — keyword
 * usage/placement, structure, length, coverage of related terms, internal
 * linking, readability, freshness, duplication and featured-snippet
 * potential. Works from the latest crawl snapshot + stored page text, the
 * page's focus keyword and the tracked keywords targeting it. SEO only — no
 * content planning/marketing workflow.
 */

export interface ContentAnalysis {
  path: string;
  score: number;
  focusKeyword: string;
  wordCount: number;
  readability: number | null;
  readabilityLabel: string;
  occurrences: number;
  density: number | null;
  placements: { label: string; ok: boolean }[];
  structure: { h1: number; h2: number; h3: number; outline: { level: number; text: string }[]; orderOk: boolean };
  coverage: { term: string; present: boolean; source: string }[];
  intents: string[];
  linksIn: number;
  linksOut: number;
  freshness: { date: string | null; days: number | null; stale: boolean };
  duplicate: boolean;
  snippetOpportunities: string[];
  recommendations: string[];
}

function countPhrase(text: string, phrase: string): number {
  if (!phrase) return 0;
  const rx = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "gi");
  return (text.match(rx) ?? []).length;
}

export function readabilityLabel(score: number | null): string {
  if (score === null) return "Not enough text";
  if (score >= 70) return "Easy";
  if (score >= 50) return "Fairly easy";
  if (score >= 30) return "Difficult";
  return "Very difficult";
}

const QUESTION = /^(what|how|why|when|which|who|where|can|is|are|does|do|should|will)\b/i;

export function analyzeContent(page: SeoPage, text: string, targeting: Keyword[], related: Keyword[], issues: SeoIssue[], thresholds: { thinContentWords: number; staleContentDays: number; minInternalLinksIn: number }): ContentAnalysis {
  const c = page.crawl;
  const lower = text.toLowerCase();
  const focus = (page.focusKeyword || targeting.find((k) => k.type === "primary")?.keyword || targeting[0]?.keyword || "").trim();
  const f = focus.toLowerCase();
  const occurrences = countPhrase(text, f);
  const words = c?.wordCount ?? 0;
  const density = f && words ? Math.round(((occurrences * f.split(" ").length) / words) * 1000) / 10 : null;
  const slug = decodeURIComponent(page.path).toLowerCase().replace(/[-_/]+/g, " ");
  const placements = f
    ? [
        { label: "SEO title", ok: (page.override?.title ?? c?.title ?? "").toLowerCase().includes(f) },
        { label: "H1", ok: (c?.h1 ?? []).some((h) => h.toLowerCase().includes(f)) },
        { label: "Meta description", ok: (page.override?.description ?? c?.description ?? "").toLowerCase().includes(f) },
        { label: "URL", ok: slug.includes(f) || f.split(" ").every((w) => slug.includes(w)) },
        { label: "First 100 words", ok: (c?.firstWords ?? "").toLowerCase().includes(f) },
        { label: "A subheading (H2/H3)", ok: [...(c?.h2 ?? []), ...(c?.h3 ?? [])].some((h) => h.toLowerCase().includes(f)) },
      ]
    : [];

  const outline = [...(c?.h1 ?? []).map((t) => ({ level: 1, text: t })), ...(c?.h2 ?? []).map((t) => ({ level: 2, text: t })), ...(c?.h3 ?? []).map((t) => ({ level: 3, text: t }))];
  const terms = new Map<string, string>();
  for (const s of page.secondaryKeywords) terms.set(s.toLowerCase(), "Secondary keyword");
  for (const k of targeting) {
    if (k.keyword.toLowerCase() !== f) terms.set(k.keyword.toLowerCase(), "Tracked keyword");
    for (const r of k.relatedKeywords) if (!terms.has(r.toLowerCase())) terms.set(r.toLowerCase(), "Related keyword");
  }
  for (const k of related) if (!terms.has(k.keyword.toLowerCase()) && k.keyword.toLowerCase() !== f) terms.set(k.keyword.toLowerCase(), "Same cluster");
  const coverage = Array.from(terms.entries()).slice(0, 40).map(([term, source]) => ({ term, source, present: countPhrase(lower, term) > 0 }));

  const date = c?.dateModified ?? c?.datePublished ?? null;
  const ms = date ? Date.parse(date) : NaN;
  const days = Number.isFinite(ms) ? Math.floor((Date.now() - ms) / 86400000) : null;
  const stale = days !== null && days > thresholds.staleContentDays;
  const duplicate = issues.some((i) => i.checkId === "duplicate_content" && (i.status === "open" || i.status === "in_progress"));

  const snippetOpportunities: string[] = [];
  const questionHeadings = [...(c?.h2 ?? []), ...(c?.h3 ?? [])].filter((h) => QUESTION.test(h.trim()));
  if (questionHeadings.length) snippetOpportunities.push(`${questionHeadings.length} question heading(s) — answer each in the first 40–50 words beneath it: ${questionHeadings.slice(0, 3).map((q) => `“${q}”`).join(", ")}`);
  for (const k of targeting) {
    if (k.currentPosition !== null && k.currentPosition >= 2 && k.currentPosition <= 10) {
      snippetOpportunities.push(`“${k.keyword}” ranks #${k.currentPosition} — a concise definition, numbered steps or a comparison table can win the featured snippet.`);
    }
  }
  if (!(c?.jsonLd ?? []).some((j) => j.types.includes("FAQPage")) && questionHeadings.length >= 2) snippetOpportunities.push("Add FAQ structured data for the question headings (Schema → FAQ).");

  const recs: string[] = [];
  let score = 100;
  if (!f) {
    recs.push("Set a focus keyword for this page so its content can be measured against it.");
    score -= 15;
  } else {
    const missing = placements.filter((p) => !p.ok).map((p) => p.label);
    if (missing.length) {
      recs.push(`Use “${focus}” in: ${missing.join(", ")}.`);
      score -= Math.min(missing.length * 5, 25);
    }
    if (occurrences === 0) {
      recs.push(`The focus keyword never appears in the body text.`);
      score -= 10;
    } else if (density !== null && density > 3) {
      recs.push(`Keyword density is ${density}% — reduce repetition (aim for ~0.5–2.5%) and use variations.`);
      score -= 5;
    }
  }
  if (words < thresholds.thinContentWords) {
    recs.push(`Only ${words} words — expand to at least ${thresholds.thinContentWords} with genuinely useful detail.`);
    score -= 15;
  }
  if ((c?.h1.length ?? 0) !== 1) {
    recs.push(c?.h1.length ? "Use exactly one H1." : "Add an H1 that states the topic.");
    score -= 8;
  }
  if ((c?.h2.length ?? 0) === 0 && words > 300) {
    recs.push("Break the text up with H2 subheadings that cover the subtopics searchers expect.");
    score -= 6;
  }
  if (c?.headingOrderIssue) {
    recs.push("Fix skipped heading levels (H1 → H2 → H3).");
    score -= 3;
  }
  const missingTerms = coverage.filter((t) => !t.present);
  if (missingTerms.length > 0 && coverage.length > 0) {
    recs.push(`Cover related terms not yet mentioned: ${missingTerms.slice(0, 6).map((t) => `“${t.term}”`).join(", ")}.`);
    score -= Math.min(Math.round((missingTerms.length / coverage.length) * 15), 15);
  }
  if (c?.readability !== null && c?.readability !== undefined && c.readability < 30) {
    recs.push(`Readability is ${readabilityLabel(c.readability).toLowerCase()} (Flesch ${c.readability}) — shorten sentences and simplify wording.`);
    score -= 5;
  }
  if ((c?.linksIn ?? 0) < thresholds.minInternalLinksIn) {
    recs.push(`Only ${c?.linksIn ?? 0} internal page(s) link here — see Internal Links for suggested sources.`);
    score -= 5;
  }
  if ((c?.linksOut ?? 0) < 3 && words > 300) {
    recs.push("Link out to 2–5 related pages on the site with descriptive anchors.");
    score -= 3;
  }
  if (stale) {
    recs.push(`Last updated ${days} days ago — refresh facts, examples and the modified date.`);
    score -= 5;
  }
  if (duplicate) {
    recs.push("The text duplicates another page — consolidate or canonicalise.");
    score -= 10;
  }
  const intents = Array.from(new Set(targeting.map((k) => k.intent).filter((x): x is NonNullable<Keyword["intent"]> => !!x)));
  if (intents.includes("transactional") && !/(contact|get a quote|book|buy|enroll|apply|pricing|price)/i.test(text)) {
    recs.push("Target keywords are transactional but the page has no clear call to action (quote, contact, pricing, apply…).");
    score -= 4;
  }
  if (intents.includes("informational") && words < 600) {
    recs.push("Target keywords are informational — deeper explanatory content tends to rank better for them.");
    score -= 3;
  }

  return {
    path: page.path,
    score: Math.max(0, Math.min(100, score)),
    focusKeyword: focus,
    wordCount: words,
    readability: c?.readability ?? null,
    readabilityLabel: readabilityLabel(c?.readability ?? null),
    occurrences,
    density,
    placements,
    structure: { h1: c?.h1.length ?? 0, h2: c?.h2.length ?? 0, h3: c?.h3.length ?? 0, outline, orderOk: !c?.headingOrderIssue },
    coverage,
    intents,
    linksIn: c?.linksIn ?? 0,
    linksOut: c?.linksOut ?? 0,
    freshness: { date, days, stale },
    duplicate,
    snippetOpportunities,
    recommendations: recs,
  };
}

/** Content analysis for one page (loads everything it needs). */
export async function contentForPage(page: SeoPage): Promise<ContentAnalysis> {
  const [settings, text, keywords, issues] = await Promise.all([
    getSettings(),
    (await seoCollection<{ _id: string; text: string }>(COLLECTIONS.pageContent)).findOne({ _id: page.path }).then((d) => d?.text ?? ""),
    (await keywordsCol()).find({ status: { $ne: "archived" } }).toArray(),
    (await seoCollection<SeoIssue>(COLLECTIONS.issues)).find({ path: page.path }).toArray(),
  ]);
  const targeting = keywords.filter((k) => k.targetUrl === page.path || (page.focusKeyword && k.normalized === normalizeKeyword(page.focusKeyword)));
  const clusters = new Set(targeting.map((k) => k.cluster).filter(Boolean));
  const groups = new Set(targeting.map((k) => k.groupId).filter(Boolean));
  const related = keywords.filter((k) => !targeting.includes(k) && ((k.cluster && clusters.has(k.cluster)) || (k.groupId && groups.has(k.groupId))));
  return analyzeContent(page, text, targeting, related, issues, settings.thresholds);
}

/** Lightweight analysis for every crawled page — the Content SEO overview table. */
export async function contentOverview(): Promise<ContentAnalysis[]> {
  const [settings, pages, keywords, issues, texts] = await Promise.all([
    getSettings(),
    (await seoCollection<SeoPage>(COLLECTIONS.pages)).find({ "crawl.indexable": true }).toArray(),
    (await keywordsCol()).find({ status: { $ne: "archived" } }).toArray(),
    (await seoCollection<SeoIssue>(COLLECTIONS.issues)).find({ checkId: "duplicate_content" }).toArray(),
    (await seoCollection<{ _id: string; text: string }>(COLLECTIONS.pageContent)).find({}).toArray(),
  ]);
  const textBy = new Map(texts.map((t) => [t._id, t.text]));
  return pages.map((p) => {
    const targeting = keywords.filter((k) => k.targetUrl === p.path || (p.focusKeyword && k.normalized === normalizeKeyword(p.focusKeyword)));
    return analyzeContent(p, textBy.get(p.path) ?? "", targeting, [], issues.filter((i) => i.path === p.path), settings.thresholds);
  });
}
