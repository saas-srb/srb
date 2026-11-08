import type { CheckId, Category, IssueStatus, Severity } from "@/lib/products/rankmax-ai/checks";
import type { PageOverride, SitemapOverride } from "@/lib/products/rankmax-ai/public";
import type { Stamps } from "@/lib/products/rankmax-ai/db";

export interface ScoreSet {
  overall: number;
  technical: number;
  onPage: number;
  content: number;
}

export type SeverityCounts = Record<Severity, number>;

/** What the last audit saw on a page (the analyser snapshot minus its text and link lists). */
export interface PageCrawl {
  runId: string;
  crawledAt: Date;
  status: number;
  error: string | null;
  finalUrl: string;
  redirectChain: { url: string; status: number }[];
  responseMs: number;
  htmlBytes: number;
  contentType: string | null;
  https: boolean;
  blockedByRobots: boolean;
  xRobotsTag: string | null;
  indexable: boolean;
  /** Why the page is not indexable ("noindex", "canonicalised", "blocked", "status 404"…). */
  indexabilityReason: string | null;
  depth: number;
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
  jsonLd: { types: string[]; valid: boolean; error: string | null }[];
  paginationNext: string | null;
  paginationPrev: string | null;
  renderBlockingScripts: number;
  wordCount: number;
  readability: number | null;
  textHash: string | null;
  firstWords: string;
  datePublished: string | null;
  dateModified: string | null;
  linksIn: number;
  linksOut: number;
  externalOut: number;
  brokenLinksOut: number;
}

export interface PagePerformance {
  strategy: "mobile" | "desktop";
  score: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  fcpMs: number | null;
  speedIndexMs: number | null;
  /** Real-user (CrUX) field data category when Google has it. */
  fieldCategory: string | null;
  checkedAt: Date;
  error: string | null;
}

export interface SeoPage extends Stamps {
  _id: string;
  path: string;
  source: "crawl" | "sitemap" | "manual";
  inSitemap: boolean;
  lastCrawledAt: Date | null;
  crawl: PageCrawl | null;
  scores: ScoreSet | null;
  issueCounts: SeverityCounts;
  focusKeyword: string;
  secondaryKeywords: string[];
  /** Live metadata overrides the public site applies (see `public.ts`). */
  override: PageOverride | null;
  sitemap: SitemapOverride | null;
  performance: PagePerformance | null;
  indexStatus: { verdict: string; coverageState: string | null; lastCrawlTime: string | null; checkedAt: Date } | null;
  search: { clicks: number; impressions: number; ctr: number; position: number; from: string; to: string } | null;
  notes: string;
}

export interface CrawlRun {
  _id: string;
  status: "running" | "completed" | "failed";
  trigger: "manual" | "schedule";
  actorId: string | null;
  actorEmail: string | null;
  origin: string;
  startedAt: Date;
  finishedAt: Date | null;
  pagesCrawled: number;
  sitemapUrls: number;
  externalChecked: number;
  issueCounts: SeverityCounts;
  passedChecks: number;
  totalChecks: number;
  byCategory: Partial<Record<Category, number>>;
  scores: ScoreSet | null;
  indexablePages: number;
  newIssues: number;
  resolvedIssues: number;
  error: string | null;
  notes: string[];
}

export interface SeoIssue {
  _id: string;
  fingerprint: string;
  checkId: CheckId | "manual";
  title: string;
  severity: Severity;
  category: Category;
  path: string;
  description: string;
  recommendation: string;
  details: string[];
  status: IssueStatus;
  assigneeId: string | null;
  source: "audit" | "pagespeed" | "manual";
  notes: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastRunId: string | null;
  occurrences: number;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
  /** "audit" when a re-crawl verified the fix, else the resolving user's id. */
  resolvedBy: string | null;
  createdBy: string | null;
}

export interface SeoLink {
  _id: string;
  runId: string;
  from: string;
  /** Site path for internal links, absolute URL for external ones. */
  to: string;
  internal: boolean;
  anchor: string;
  nofollow: boolean;
  status: number | null;
  redirects: boolean;
}

export const EMPTY_COUNTS: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
