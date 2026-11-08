/**
 * Registry of every SEO data source the product knows, and how far its numbers
 * can be trusted. The UI labels each metric with its source so first-party
 * VERIFIED data (Google's own, or our own crawl) is never confused with a
 * third-party ESTIMATE (keyword tools, backlink indexes, competitor data).
 *
 * To add a provider (e.g. a SERP rank-tracking API or a backlink index):
 * write an adapter next to `gsc.ts` that writes into the same collections —
 * rankings via `upsertRank(…)` with a new `RankSource`, backlinks via the
 * `seo_backlinks` shape with `source: "<provider>"` — and register it here.
 */

export type Trust = "verified" | "measured" | "estimated" | "manual";

export interface ProviderInfo {
  id: string;
  label: string;
  trust: Trust;
  provides: string[];
  configuredBy: string;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "crawler", label: "Built-in crawler", trust: "verified", provides: ["Website audit", "Technical & on-page checks", "Internal links", "Sitemap & robots validation"], configuredBy: "Built in" },
  { id: "gsc", label: "Google Search Console", trust: "verified", provides: ["Impressions, clicks, CTR, average position", "Keyword positions", "Index status", "Sitemap status"], configuredBy: "Service account + property" },
  { id: "ga4", label: "Google Analytics 4", trust: "verified", provides: ["Organic search sessions & users"], configuredBy: "Service account + property id" },
  { id: "psi", label: "PageSpeed Insights", trust: "measured", provides: ["Core Web Vitals (lab + CrUX category)", "Performance score"], configuredBy: "Optional PAGESPEED_API_KEY" },
  { id: "import", label: "CSV import (any SEO tool)", trust: "estimated", provides: ["Keyword metrics", "Rank-tracker positions", "Backlinks", "Competitor data"], configuredBy: "Upload in each module" },
  { id: "manual", label: "Manual entry", trust: "manual", provides: ["Any metric a user records"], configuredBy: "—" },
];

export const TRUST_META: Record<Trust, { label: string; className: string }> = {
  verified: { label: "Verified", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  measured: { label: "Measured", className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  estimated: { label: "Estimated", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  manual: { label: "Manual", className: "bg-muted text-muted-foreground" },
};
