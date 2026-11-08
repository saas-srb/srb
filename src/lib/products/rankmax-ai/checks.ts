/**
 * The audit check catalog: every issue the crawler can raise, with its
 * severity, category and a concrete recommendation. Pure data — safe to
 * import from client components (labels, filters).
 */

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const SEVERITY_META: Record<Severity | "passed", { label: string; weight: number; className: string }> = {
  critical: { label: "Critical", weight: 25, className: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
  high: { label: "High", weight: 12, className: "bg-orange-500/15 text-orange-600 dark:text-orange-400" },
  medium: { label: "Medium", weight: 6, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  low: { label: "Low", weight: 2, className: "bg-sky-500/15 text-sky-700 dark:text-sky-400" },
  passed: { label: "Passed", weight: 0, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
};

export const CATEGORIES = ["technical", "on_page", "content", "links", "performance", "mobile", "structured_data"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  technical: "Technical",
  on_page: "On-Page",
  content: "Content",
  links: "Links",
  performance: "Performance",
  mobile: "Mobile",
  structured_data: "Structured Data",
};

/** Which score bucket a category feeds. */
export const SCORE_BUCKET: Record<Category, "technical" | "onPage" | "content"> = {
  technical: "technical",
  links: "technical",
  performance: "technical",
  mobile: "technical",
  structured_data: "technical",
  on_page: "onPage",
  content: "content",
};

export interface CheckDef {
  title: string;
  severity: Severity;
  category: Category;
  description: string;
  recommendation: string;
}

export const CHECKS = {
  fetch_error: {
    title: "Page could not be fetched",
    severity: "critical",
    category: "technical",
    description: "The crawler could not get any response for this URL (timeout, DNS or connection failure).",
    recommendation: "Check the server and hosting logs for this route; make sure it responds within a few seconds.",
  },
  http_4xx: {
    title: "Client error (4xx) response",
    severity: "critical",
    category: "technical",
    description: "The URL returns a 4xx status, so search engines drop it from the index.",
    recommendation: "Restore the page, or 301-redirect the URL to its closest live replacement and update links pointing to it.",
  },
  http_5xx: {
    title: "Server error (5xx) response",
    severity: "critical",
    category: "technical",
    description: "The URL returns a 5xx status. Repeated server errors cause de-indexing and waste crawl budget.",
    recommendation: "Fix the server-side error for this route (check runtime logs) and re-run the audit.",
  },
  redirect_chain: {
    title: "Redirect chain",
    severity: "medium",
    category: "technical",
    description: "The URL goes through more than one redirect before reaching the final page.",
    recommendation: "Point the original URL (and every internal link to it) straight at the final destination with a single 301.",
  },
  temporary_redirect: {
    title: "Temporary (302/307) redirect",
    severity: "low",
    category: "technical",
    description: "A temporary redirect does not pass signals the way a permanent one does.",
    recommendation: "If the move is permanent, change the redirect to a 301/308.",
  },
  redirected_in_sitemap: {
    title: "Redirecting URL listed in sitemap",
    severity: "medium",
    category: "technical",
    description: "The sitemap lists a URL that redirects. Sitemaps should only list final, indexable URLs.",
    recommendation: "List the redirect target in the sitemap instead of this URL.",
  },
  not_https: {
    title: "Page not served over HTTPS",
    severity: "high",
    category: "technical",
    description: "The final URL uses plain HTTP.",
    recommendation: "Serve the page over HTTPS and 301-redirect the HTTP version.",
  },
  canonical_missing: {
    title: "Missing canonical tag",
    severity: "medium",
    category: "technical",
    description: "The page has no rel=canonical, so search engines must guess the preferred URL.",
    recommendation: "Add a self-referencing canonical URL (On-Page SEO → canonical).",
  },
  canonical_other: {
    title: "Canonical points to another URL",
    severity: "low",
    category: "technical",
    description: "The canonical tag names a different URL, so this page will not be indexed itself.",
    recommendation: "Confirm this page is meant to be a duplicate. If not, make the canonical self-referencing.",
  },
  canonical_host_mismatch: {
    title: "Canonical uses a different host",
    severity: "medium",
    category: "technical",
    description: "The canonical URL's host (e.g. www vs non-www) differs from the site's primary host.",
    recommendation: "Use one primary host consistently in canonicals, the sitemap and robots.txt.",
  },
  noindex: {
    title: "Page is set to noindex",
    severity: "high",
    category: "technical",
    description: "A robots meta tag or X-Robots-Tag header tells search engines not to index this page.",
    recommendation: "Remove noindex if the page should rank; otherwise also drop it from the sitemap.",
  },
  nofollow_meta: {
    title: "Page-level nofollow",
    severity: "medium",
    category: "technical",
    description: "A robots meta nofollow stops search engines following every link on the page.",
    recommendation: "Remove the page-level nofollow and use rel=nofollow on individual links where needed.",
  },
  blocked_by_robots: {
    title: "Blocked by robots.txt",
    severity: "high",
    category: "technical",
    description: "robots.txt disallows this URL for Googlebot, so it cannot be crawled.",
    recommendation: "Allow the path in robots.txt if it should be crawled, or remove it from the sitemap and internal links.",
  },
  sitemap_non_indexable: {
    title: "Non-indexable URL in sitemap",
    severity: "high",
    category: "technical",
    description: "The sitemap lists a URL that is noindex, blocked, canonicalised elsewhere or returns an error.",
    recommendation: "Remove the URL from the sitemap (Pages → sitemap settings), or make it indexable.",
  },
  not_in_sitemap: {
    title: "Indexable page missing from sitemap",
    severity: "low",
    category: "technical",
    description: "The page is indexable and linked internally but not listed in the XML sitemap.",
    recommendation: "Include the page in the sitemap so search engines discover and re-crawl it reliably.",
  },
  orphan_page: {
    title: "Orphan page",
    severity: "medium",
    category: "links",
    description: "No crawled page links to this URL; it is only reachable through the sitemap.",
    recommendation: "Link to it from relevant pages or navigation (see Internal Links → opportunities).",
  },
  low_internal_links: {
    title: "Few internal links pointing here",
    severity: "low",
    category: "links",
    description: "The page receives fewer internal links than the configured minimum.",
    recommendation: "Add contextual links from related pages using descriptive anchor text.",
  },
  broken_internal_links: {
    title: "Broken internal links",
    severity: "high",
    category: "links",
    description: "The page links to internal URLs that return an error.",
    recommendation: "Update or remove each broken link listed in the issue details.",
  },
  broken_external_links: {
    title: "Broken external links",
    severity: "low",
    category: "links",
    description: "The page links to external URLs that return an error.",
    recommendation: "Replace dead outbound links with working sources or remove them.",
  },
  links_to_redirects: {
    title: "Internal links to redirecting URLs",
    severity: "low",
    category: "links",
    description: "Internal links point at URLs that redirect, adding a hop for users and crawlers.",
    recommendation: "Update the links to point at the final URL directly.",
  },
  url_structure: {
    title: "Unfriendly URL structure",
    severity: "low",
    category: "technical",
    description: "The URL contains uppercase letters, underscores, query parameters or is very long.",
    recommendation: "Use short, lowercase, hyphen-separated slugs; add a 301 from the old URL if you change it.",
  },
  duplicate_content: {
    title: "Duplicate content",
    severity: "medium",
    category: "content",
    description: "The main text of this page is identical to another crawled page.",
    recommendation: "Consolidate the pages, or canonicalise the duplicate to the primary version.",
  },
  title_missing: {
    title: "Missing title tag",
    severity: "critical",
    category: "on_page",
    description: "The page has no <title>.",
    recommendation: "Add a unique, descriptive title that leads with the page's focus keyword.",
  },
  title_too_long: {
    title: "Title too long",
    severity: "medium",
    category: "on_page",
    description: "The title is longer than the configured maximum and will likely be truncated in results.",
    recommendation: "Shorten the title, keeping the focus keyword near the start.",
  },
  title_too_short: {
    title: "Title too short",
    severity: "low",
    category: "on_page",
    description: "The title is shorter than the configured minimum and may not describe the page well.",
    recommendation: "Expand the title with the focus keyword and a clear value proposition.",
  },
  title_duplicate: {
    title: "Duplicate title",
    severity: "medium",
    category: "on_page",
    description: "Another crawled page uses exactly the same title.",
    recommendation: "Give every page a unique title that reflects its specific content.",
  },
  description_missing: {
    title: "Missing meta description",
    severity: "high",
    category: "on_page",
    description: "Without a description search engines generate a snippet from page text.",
    recommendation: "Write a compelling 120–160 character description that includes the focus keyword.",
  },
  description_too_long: {
    title: "Meta description too long",
    severity: "low",
    category: "on_page",
    description: "The description exceeds the configured maximum and will be truncated.",
    recommendation: "Trim the description to the most important message.",
  },
  description_too_short: {
    title: "Meta description too short",
    severity: "low",
    category: "on_page",
    description: "The description is shorter than the configured minimum.",
    recommendation: "Expand the description to summarise the page and invite the click.",
  },
  description_duplicate: {
    title: "Duplicate meta description",
    severity: "medium",
    category: "on_page",
    description: "Another crawled page uses exactly the same description.",
    recommendation: "Write a unique description for each page.",
  },
  h1_missing: {
    title: "Missing H1",
    severity: "high",
    category: "on_page",
    description: "The page has no H1 heading.",
    recommendation: "Add one H1 that states the page topic and includes the focus keyword.",
  },
  h1_multiple: {
    title: "Multiple H1 headings",
    severity: "medium",
    category: "on_page",
    description: "The page has more than one H1.",
    recommendation: "Keep a single H1 and demote the others to H2/H3.",
  },
  heading_order: {
    title: "Skipped heading levels",
    severity: "low",
    category: "on_page",
    description: "Headings skip a level (e.g. an H3 before any H2), which weakens the content outline.",
    recommendation: "Nest headings in order: H1 → H2 → H3.",
  },
  img_alt_missing: {
    title: "Images missing alt text",
    severity: "medium",
    category: "on_page",
    description: "Some images have no alt attribute, hurting image search and accessibility.",
    recommendation: "Add concise, descriptive alt text to each image (empty alt only for purely decorative images).",
  },
  og_missing: {
    title: "Missing Open Graph tags",
    severity: "low",
    category: "on_page",
    description: "og:title, og:description or og:image is missing, so social shares render poorly.",
    recommendation: "Set Open Graph title, description and image for the page (On-Page SEO → social).",
  },
  twitter_missing: {
    title: "Missing Twitter card tags",
    severity: "low",
    category: "on_page",
    description: "twitter:card is missing.",
    recommendation: "Add Twitter card metadata (summary_large_image) with title, description and image.",
  },
  focus_keyword_placement: {
    title: "Focus keyword not in key places",
    severity: "medium",
    category: "on_page",
    description: "The page's focus keyword is missing from the title, H1, meta description or URL.",
    recommendation: "Work the focus keyword naturally into each location listed in the issue details.",
  },
  thin_content: {
    title: "Thin content",
    severity: "medium",
    category: "content",
    description: "The page has fewer words than the configured minimum.",
    recommendation: "Expand the page with useful, original detail that answers the searcher's intent.",
  },
  low_readability: {
    title: "Hard to read",
    severity: "low",
    category: "content",
    description: "The Flesch reading-ease score is low (long sentences / long words).",
    recommendation: "Use shorter sentences, plain words, and break text up with headings and lists.",
  },
  stale_content: {
    title: "Stale content",
    severity: "low",
    category: "content",
    description: "The page's published/modified date is older than the configured freshness window.",
    recommendation: "Review and update the content, then update its modified date.",
  },
  missing_viewport: {
    title: "Missing viewport meta tag",
    severity: "high",
    category: "mobile",
    description: "Without a viewport tag the page does not render responsively on mobile.",
    recommendation: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  },
  missing_lang: {
    title: "Missing html lang attribute",
    severity: "low",
    category: "technical",
    description: "The <html> element has no lang attribute.",
    recommendation: 'Set lang (e.g. lang="en") on the <html> element.',
  },
  slow_response: {
    title: "Slow server response",
    severity: "medium",
    category: "performance",
    description: "The HTML response took longer than the configured threshold.",
    recommendation: "Cache or statically render the route and reduce server-side work.",
  },
  large_html: {
    title: "Large HTML document",
    severity: "low",
    category: "performance",
    description: "The HTML is over 500 KB, which slows parsing, especially on mobile.",
    recommendation: "Reduce inline data/scripts and paginate or lazy-load long content.",
  },
  render_blocking_scripts: {
    title: "Render-blocking scripts",
    severity: "low",
    category: "performance",
    description: "Scripts in <head> load without async/defer and block rendering.",
    recommendation: "Add async or defer to non-critical scripts, or move them out of <head>.",
  },
  images_no_dimensions: {
    title: "Images without width/height",
    severity: "low",
    category: "performance",
    description: "Images without explicit dimensions cause layout shift (CLS).",
    recommendation: "Set width and height (or use the framework image component).",
  },
  cwv_poor: {
    title: "Poor Core Web Vitals",
    severity: "high",
    category: "performance",
    description: "PageSpeed Insights reports a poor LCP, CLS or TBT for this page.",
    recommendation: "Optimise the largest element, reduce main-thread work and reserve space for media (see details).",
  },
  cwv_needs_improvement: {
    title: "Core Web Vitals need improvement",
    severity: "medium",
    category: "performance",
    description: "PageSpeed Insights reports metrics in the 'needs improvement' range.",
    recommendation: "Review the listed metrics in PageSpeed Insights and address the top opportunities.",
  },
  structured_data_missing: {
    title: "No structured data",
    severity: "low",
    category: "structured_data",
    description: "The page has no JSON-LD structured data.",
    recommendation: "Add relevant schema (WebPage, BreadcrumbList, Article, Service, FAQ…) in Schema / Structured Data.",
  },
  structured_data_invalid: {
    title: "Invalid structured data",
    severity: "high",
    category: "structured_data",
    description: "A JSON-LD block could not be parsed or is missing required properties.",
    recommendation: "Fix the JSON-LD errors listed in the details; validate in Schema / Structured Data.",
  },
  pagination_canonical: {
    title: "Paginated page canonicalised to page 1",
    severity: "low",
    category: "technical",
    description: "A paginated URL points its canonical at the first page, hiding deeper items from search.",
    recommendation: "Give each paginated page a self-referencing canonical.",
  },
} as const satisfies Record<string, CheckDef>;

export type CheckId = keyof typeof CHECKS;

export function isCheckId(v: unknown): v is CheckId {
  return typeof v === "string" && v in CHECKS;
}

/** Page score from a list of issue severities: 100 minus weighted penalties, floored at 0. */
export function scoreFromSeverities(severities: Severity[]): number {
  const penalty = severities.reduce((s, sev) => s + SEVERITY_META[sev].weight, 0);
  return Math.max(0, 100 - penalty);
}

export const ISSUE_STATUSES = ["open", "in_progress", "resolved", "ignored"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const ISSUE_STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  ignored: "Ignored",
};
