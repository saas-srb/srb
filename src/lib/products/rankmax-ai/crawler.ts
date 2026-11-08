import "server-only";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { COLLECTIONS, newId, seoCollection } from "@/lib/products/rankmax-ai/db";
import { analyzeHtml, type HtmlSnapshot } from "@/lib/products/rankmax-ai/analyze";
import { fetchUrl, mapLimit, type FetchResult } from "@/lib/products/rankmax-ai/fetch";
import { parseRobots, isAllowed, type ParsedRobots } from "@/lib/products/rankmax-ai/robots-parse";
import { discoverSitemaps, saveSitemapRecords, toOrigin } from "@/lib/products/rankmax-ai/sitemaps";
import { getSettings, type SeoSettings } from "@/lib/products/rankmax-ai/settings";
import { CHECKS, SCORE_BUCKET, scoreFromSeverities, type CheckId, type Category, type Severity } from "@/lib/products/rankmax-ai/checks";
import { reconcileIssues, type IssueFinding } from "@/lib/products/rankmax-ai/issues";
import { recordAudit } from "@/lib/products/rankmax-ai/audit";
import { EMPTY_COUNTS, type CrawlRun, type PageCrawl, type ScoreSet, type SeoLink, type SeoPage, type SeverityCounts } from "@/lib/products/rankmax-ai/types";

/**
 * The website crawler behind Website Audit. One run:
 *   1. reads the audited origin's robots.txt and sitemaps (seed URLs),
 *   2. crawls breadth-first through internal links up to `maxPages`,
 *   3. checks internal link targets (from the crawl) and a capped set of external links,
 *   4. evaluates every check in `checks.ts`, per page and across pages,
 *   5. scores pages, stores snapshots + the link graph, and reconciles issues
 *      (new ones open, fixed ones auto-resolve, regressions re-open).
 *
 * Only one run may be in flight; a "running" run older than 20 minutes is
 * treated as dead (the function that owned it timed out).
 */

const STALE_RUN_MS = 20 * 60 * 1000;
const SKIP_EXT = /\.(pdf|png|jpe?g|gif|webp|avif|svg|ico|css|js|mjs|json|xml|txt|zip|mp4|webm|mp3|woff2?|ttf|eot)$/i;

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

interface CrawledPage {
  path: string;
  depth: number;
  inSitemap: boolean;
  res: FetchResult;
  snap: HtmlSnapshot | null;
}

function normalizePath(u: URL): string {
  let p = u.pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return `${p}${u.search}`;
}

export class CrawlBusyError extends Error {}

/** Starts a run and returns its id once the crawl has finished (or failed). */
export async function runCrawl(opts: { trigger: CrawlRun["trigger"]; actorId: string | null; actorEmail: string | null }): Promise<CrawlRun> {
  const runs = await seoCollection<CrawlRun>(COLLECTIONS.runs);
  await runs.updateMany(
    { status: "running", startedAt: { $lt: new Date(Date.now() - STALE_RUN_MS) } },
    { $set: { status: "failed", finishedAt: new Date(), error: "Run did not finish (the server timed out or restarted)." } }
  );
  // Atomic single-run lock: the unique _id makes two simultaneous starts race on one insert.
  const locks = await seoCollection<{ _id: string; at: Date }>(COLLECTIONS.settings);
  await locks.deleteOne({ _id: "crawl-lock", at: { $lt: new Date(Date.now() - STALE_RUN_MS) } });
  try {
    await locks.insertOne({ _id: "crawl-lock", at: new Date() });
  } catch {
    throw new CrawlBusyError("An audit is already running.");
  }
  try {
    return await runLocked(opts);
  } finally {
    await locks.deleteOne({ _id: "crawl-lock" });
  }
}

async function runLocked(opts: { trigger: CrawlRun["trigger"]; actorId: string | null; actorEmail: string | null }): Promise<CrawlRun> {
  const runs = await seoCollection<CrawlRun>(COLLECTIONS.runs);
  const settings = await getSettings();
  const run: CrawlRun = {
    _id: newId(),
    status: "running",
    trigger: opts.trigger,
    actorId: opts.actorId,
    actorEmail: opts.actorEmail,
    origin: settings.siteOrigin,
    startedAt: new Date(),
    finishedAt: null,
    pagesCrawled: 0,
    sitemapUrls: 0,
    externalChecked: 0,
    issueCounts: { ...EMPTY_COUNTS },
    passedChecks: 0,
    totalChecks: 0,
    byCategory: {},
    scores: null,
    indexablePages: 0,
    newIssues: 0,
    resolvedIssues: 0,
    error: null,
    notes: [],
  };
  await runs.insertOne(run);

  try {
    const result = await crawl(run, settings);
    Object.assign(run, result, { status: "completed", finishedAt: new Date() });
  } catch (err) {
    console.error("[seo crawl]", err);
    run.status = "failed";
    run.finishedAt = new Date();
    run.error = err instanceof Error ? err.message : "Crawl failed";
  }
  await runs.replaceOne({ _id: run._id }, run);
  if (opts.actorId) {
    await recordAudit({
      actorId: opts.actorId,
      actorEmail: opts.actorEmail,
      action: "run",
      entity: "audit_run",
      entityId: run._id,
      entityLabel: `Website audit (${run.origin})`,
      summary:
        run.status === "completed"
          ? `${run.pagesCrawled} pages, score ${run.scores?.overall ?? "—"}, ${run.newIssues} new / ${run.resolvedIssues} resolved issues`
          : `Failed: ${run.error}`,
    });
  }
  return run;
}

async function crawl(run: CrawlRun, settings: SeoSettings): Promise<Partial<CrawlRun>> {
  const origin = settings.siteOrigin;
  const originUrl = new URL(origin);
  const primaryHost = new URL(await companySiteUrl()).host;
  const internalHosts = new Set([bareHost(originUrl.host), bareHost(primaryHost)]);
  const isInternal = (u: URL) => internalHosts.has(bareHost(u.host));
  const t = settings.thresholds;
  const excluded = (path: string) => settings.crawl.excludePrefixes.some((p) => p && (path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)));
  const notes: string[] = [];

  // ── robots.txt + sitemaps ────────────────────────────────────────────────
  const robotsRes = await fetchUrl(`${origin}/robots.txt`, { timeoutMs: 10000 });
  const robots: ParsedRobots | null = robotsRes.status === 200 && robotsRes.body ? parseRobots(robotsRes.body) : null;
  if (!robots) notes.push(`robots.txt not readable (${robotsRes.error ?? `HTTP ${robotsRes.status}`}); treating everything as allowed.`);
  const discovery = await discoverSitemaps(origin, { primaryHost });
  await saveSitemapRecords(discovery.records);
  const sitemapPaths = new Set<string>();
  for (const u of discovery.urls) {
    try {
      const parsed = new URL(u.loc);
      if (isInternal(parsed)) sitemapPaths.add(normalizePath(parsed));
    } catch {
      // reported on the sitemap record
    }
  }
  if (sitemapPaths.size === 0) notes.push("No sitemap URLs found — crawling from the home page only.");

  // ── crawl (BFS over a shared queue, bounded concurrency) ────────────────
  const pagesCol = await seoCollection<SeoPage>(COLLECTIONS.pages);
  const manualPaths = (await pagesCol.find({ source: "manual" }, { projection: { path: 1 } }).toArray()).map((p) => p.path);
  const queue: { path: string; depth: number }[] = [];
  const queued = new Set<string>();
  const enqueue = (path: string, depth: number) => {
    if (queued.has(path) || excluded(path) || SKIP_EXT.test(path.split("?")[0])) return;
    if (queued.size >= settings.crawl.maxPages) return;
    queued.add(path);
    queue.push({ path, depth });
  };
  enqueue("/", 0);
  for (const p of sitemapPaths) enqueue(p, 1);
  for (const p of manualPaths) enqueue(p, 1);

  const crawled = new Map<string, CrawledPage>();
  let active = 0;
  await new Promise<void>((resolve) => {
    const pump = () => {
      if (queue.length === 0 && active === 0) return resolve();
      while (active < settings.crawl.concurrency && queue.length > 0) {
        const item = queue.shift()!;
        active++;
        fetchUrl(`${origin}${item.path}`, { timeoutMs: settings.crawl.timeoutMs })
          // One retry on a network-level failure, so a momentary blip isn't reported as a critical issue.
          .then((res) => (res.status === 0 ? fetchUrl(`${origin}${item.path}`, { timeoutMs: settings.crawl.timeoutMs }) : res))
          .then((res) => {
            let snap: HtmlSnapshot | null = null;
            if (res.status === 200 && res.body && (res.contentType ?? "").includes("html")) {
              snap = analyzeHtml(res.body, res.finalUrl, isInternal);
              for (const l of snap.internalLinks) {
                if (l.nofollow) continue;
                enqueue(normalizePath(new URL(l.url)), item.depth + 1);
              }
            }
            crawled.set(item.path, { path: item.path, depth: item.depth, inSitemap: sitemapPaths.has(item.path), res, snap });
          })
          .catch((err) => console.error("[seo crawl] page", item.path, err))
          .finally(() => {
            active--;
            pump();
          });
      }
    };
    pump();
  });
  if (queued.size >= settings.crawl.maxPages) notes.push(`Stopped at the ${settings.crawl.maxPages}-page limit (Settings → crawl).`);

  // ── link graph ───────────────────────────────────────────────────────────
  const incoming = new Map<string, Set<string>>();
  const links: SeoLink[] = [];
  const externalTargets = new Set<string>();
  for (const page of crawled.values()) {
    if (!page.snap) continue;
    for (const l of page.snap.internalLinks) {
      const to = normalizePath(new URL(l.url));
      if (to !== page.path) {
        if (!incoming.has(to)) incoming.set(to, new Set());
        incoming.get(to)!.add(page.path);
      }
      const target = crawled.get(to);
      links.push({
        _id: newId(),
        runId: run._id,
        from: page.path,
        to,
        internal: true,
        anchor: l.anchor,
        nofollow: l.nofollow,
        status: target ? target.res.status : null,
        redirects: !!target && target.res.chain.length > 0,
      });
    }
    for (const l of page.snap.externalLinks) {
      externalTargets.add(l.url);
      links.push({ _id: newId(), runId: run._id, from: page.path, to: l.url, internal: false, anchor: l.anchor, nofollow: l.nofollow, status: null, redirects: false });
    }
  }

  // External link checks: capped, and hosts that block bots (403/429/999) count as "unverified", not broken.
  const externalStatus = new Map<string, number>();
  if (settings.crawl.checkExternalLinks) {
    const targets = Array.from(externalTargets).slice(0, settings.crawl.maxExternalChecks);
    await mapLimit(targets, 6, async (url) => {
      let r = await fetchUrl(url, { method: "HEAD", timeoutMs: 8000, guard: true, wantBody: false });
      if (r.status === 405 || r.status === 404 || r.status === 0) r = await fetchUrl(url, { timeoutMs: 10000, guard: true, wantBody: false });
      externalStatus.set(url, r.status);
    });
    if (externalTargets.size > targets.length) notes.push(`Checked ${targets.length} of ${externalTargets.size} external links (limit in Settings).`);
  }
  for (const l of links) if (!l.internal && externalStatus.has(l.to)) l.status = externalStatus.get(l.to)!;
  const isBrokenExternal = (s: number | null | undefined) => s !== null && s !== undefined && (s === 0 || s === 404 || s === 410 || s >= 500);

  // ── per-page evaluation ──────────────────────────────────────────────────
  const findings: IssueFinding[] = [];
  const pageFindings = new Map<string, { checkId: CheckId; severity: Severity; category: Category }[]>();
  let totalChecks = 0;
  let failedChecks = 0;
  const add = (path: string, checkId: CheckId, details: string[] = []) => {
    findings.push({ path, checkId, details });
    const c = CHECKS[checkId];
    if (!pageFindings.has(path)) pageFindings.set(path, []);
    pageFindings.get(path)!.push({ checkId, severity: c.severity, category: c.category });
    failedChecks++;
  };
  const check = (cond: boolean, path: string, checkId: CheckId, details: string[] = []) => {
    totalChecks++;
    if (cond) add(path, checkId, details);
  };

  const crawls = new Map<string, PageCrawl>();
  const byTitle = new Map<string, string[]>();
  const byDescription = new Map<string, string[]>();
  const byHash = new Map<string, string[]>();
  const pageMeta = await pagesCol.find({}, { projection: { path: 1, focusKeyword: 1 } }).toArray();
  const focusByPath = new Map(pageMeta.map((p) => [p.path, p.focusKeyword]));
  const now = Date.now();

  for (const page of crawled.values()) {
    const { res, snap, path } = page;
    const finalUrl = new URL(res.finalUrl);
    const blockedByRobots = robots ? !isAllowed(robots, path).allowed : false;
    const xRobots = (res.xRobotsTag ?? "").toLowerCase();
    const noindex = (snap?.noindex ?? false) || /\bnoindex\b|\bnone\b/.test(xRobots);
    let canonicalPath: string | null = null;
    let canonicalHost: string | null = null;
    if (snap?.canonical) {
      try {
        const c = new URL(snap.canonical, res.finalUrl);
        canonicalPath = normalizePath(c);
        canonicalHost = c.host;
      } catch {
        canonicalPath = null;
      }
    }
    const canonicalElsewhere = canonicalPath !== null && canonicalPath !== path && canonicalPath !== normalizePath(finalUrl);
    let indexabilityReason: string | null = null;
    if (res.status === 0) indexabilityReason = res.error ?? "unreachable";
    else if (res.status >= 400) indexabilityReason = `status ${res.status}`;
    else if (res.chain.length > 0) indexabilityReason = "redirects";
    else if (noindex) indexabilityReason = "noindex";
    else if (blockedByRobots) indexabilityReason = "blocked by robots.txt";
    else if (canonicalElsewhere) indexabilityReason = "canonicalised";
    const indexable = indexabilityReason === null && !!snap;

    // Status / fetch
    check(res.status === 0, path, "fetch_error", res.error ? [res.error] : []);
    check(res.status >= 400 && res.status < 500, path, "http_4xx", [`HTTP ${res.status}`]);
    check(res.status >= 500, path, "http_5xx", [`HTTP ${res.status}`]);
    check(res.chain.length > 1, path, "redirect_chain", [[...res.chain.map((c) => `${c.url} (${c.status})`), res.finalUrl].join(" → ")]);
    check(res.chain.some((c) => c.status === 302 || c.status === 307), path, "temporary_redirect", res.chain.map((c) => `${c.url} → ${c.status}`));
    check(page.inSitemap && res.chain.length > 0, path, "redirected_in_sitemap", [`Final URL: ${res.finalUrl}`]);
    check(finalUrl.protocol !== "https:" && originUrl.protocol === "https:", path, "not_https");
    check(blockedByRobots && (page.inSitemap || (incoming.get(path)?.size ?? 0) > 0), path, "blocked_by_robots", [`Matched: ${robots ? isAllowed(robots, path).rule?.path ?? "" : ""}`]);
    check(page.inSitemap && !indexable, path, "sitemap_non_indexable", indexabilityReason ? [`Reason: ${indexabilityReason}`] : []);
    check(!page.inSitemap && indexable && sitemapPaths.size > 0, path, "not_in_sitemap");
    const segments = path.split("?")[0];
    const urlProblems = [
      /[A-Z]/.test(segments) && "uppercase letters",
      /_/.test(segments) && "underscores",
      path.includes("?") && "query parameters",
      path.length > 100 && `${path.length} characters long`,
    ].filter(Boolean) as string[];
    // A page that canonicalises elsewhere is a deliberate duplicate (e.g. /contact?category=…):
    // its own content, metadata and performance don't get indexed, so only canonical checks apply.
    const deliberateDuplicate = canonicalElsewhere && res.status === 200;
    check(urlProblems.length > 0 && res.status < 400 && !deliberateDuplicate, path, "url_structure", urlProblems);

    if (snap && res.status === 200 && deliberateDuplicate) {
      const toSelfWithoutQuery = canonicalPath === path.split("?")[0];
      check(!toSelfWithoutQuery, path, "canonical_other", [`Canonical: ${snap.canonical}`]);
      check(!!canonicalHost && bareHost(canonicalHost) === bareHost(primaryHost) && canonicalHost !== primaryHost, path, "canonical_host_mismatch", [`Canonical host ${canonicalHost}, primary ${primaryHost}`]);
    } else if (snap && res.status === 200) {
      const title = snap.title;
      const desc = snap.description;
      if (title) byTitle.set(title, [...(byTitle.get(title) ?? []), path]);
      if (desc) byDescription.set(desc, [...(byDescription.get(desc) ?? []), path]);
      if (snap.textHash && indexable) byHash.set(snap.textHash, [...(byHash.get(snap.textHash) ?? []), path]);

      check(!snap.canonical, path, "canonical_missing");
      check(!!canonicalHost && bareHost(canonicalHost) === bareHost(primaryHost) && canonicalHost !== primaryHost, path, "canonical_host_mismatch", [`Canonical host ${canonicalHost}, primary ${primaryHost}`]);
      check(noindex && (page.inSitemap || (incoming.get(path)?.size ?? 0) > 0), path, "noindex", [snap.robotsMeta ? `meta robots: ${snap.robotsMeta}` : `X-Robots-Tag: ${res.xRobotsTag}`]);
      check(snap.nofollow, path, "nofollow_meta", [snap.robotsMeta ?? ""]);
      check(!title, path, "title_missing");
      check(!!title && title.length > t.titleMax, path, "title_too_long", [`${title.length} characters (max ${t.titleMax})`]);
      check(!!title && title.length < t.titleMin, path, "title_too_short", [`${title.length} characters (min ${t.titleMin})`]);
      check(!desc, path, "description_missing");
      check(!!desc && desc.length > t.descriptionMax, path, "description_too_long", [`${desc.length} characters (max ${t.descriptionMax})`]);
      check(!!desc && desc.length < t.descriptionMin, path, "description_too_short", [`${desc.length} characters (min ${t.descriptionMin})`]);
      check(snap.h1.length === 0, path, "h1_missing");
      check(snap.h1.length > 1, path, "h1_multiple", snap.h1.slice(0, 5));
      check(snap.headingOrderIssue, path, "heading_order");
      check(snap.imagesMissingAlt > 0, path, "img_alt_missing", [`${snap.imagesMissingAlt} of ${snap.images} image(s)`, ...snap.missingAltSamples]);
      const ogMissing = [!snap.og.title && "og:title", !snap.og.description && "og:description", !snap.og.image && "og:image"].filter(Boolean) as string[];
      check(ogMissing.length > 0, path, "og_missing", ogMissing);
      check(!snap.twitter.card, path, "twitter_missing");
      const focus = (focusByPath.get(path) ?? "").trim().toLowerCase();
      if (focus) {
        const slug = decodeURIComponent(path).toLowerCase().replace(/[-_/]+/g, " ");
        const missing = [
          !title.toLowerCase().includes(focus) && "title",
          !snap.h1.some((h) => h.toLowerCase().includes(focus)) && "H1",
          !desc.toLowerCase().includes(focus) && "meta description",
          !slug.includes(focus) && !focus.split(" ").every((w) => slug.includes(w)) && "URL",
        ].filter(Boolean) as string[];
        check(missing.length > 0, path, "focus_keyword_placement", [`"${focusByPath.get(path)}" missing from: ${missing.join(", ")}`]);
      }
      check(indexable && snap.wordCount < t.thinContentWords, path, "thin_content", [`${snap.wordCount} words (min ${t.thinContentWords})`]);
      check(snap.readability !== null && snap.readability < 30, path, "low_readability", [`Flesch reading ease ${snap.readability}`]);
      const modified = snap.dateModified ?? snap.datePublished;
      const modifiedMs = modified ? Date.parse(modified) : NaN;
      check(Number.isFinite(modifiedMs) && now - modifiedMs > t.staleContentDays * 86400000, path, "stale_content", [`Last updated ${modified?.slice(0, 10)}`]);
      check(!snap.viewport, path, "missing_viewport");
      check(!snap.lang, path, "missing_lang");
      check(res.ms > t.slowResponseMs, path, "slow_response", [`${res.ms} ms (threshold ${t.slowResponseMs} ms)`]);
      check(res.bytes > 500 * 1024, path, "large_html", [`${Math.round(res.bytes / 1024)} KB`]);
      check(snap.renderBlockingScripts > 0, path, "render_blocking_scripts", [`${snap.renderBlockingScripts} script(s)`]);
      check(snap.imagesNoDimensions > 0, path, "images_no_dimensions", [`${snap.imagesNoDimensions} image(s)`]);
      check(snap.jsonLd.length === 0 && indexable, path, "structured_data_missing");
      check(snap.jsonLd.some((j) => !j.valid), path, "structured_data_invalid", snap.jsonLd.filter((j) => !j.valid).map((j) => j.error ?? "Invalid JSON"));
      const isPaginated = /[?&](page|p)=\d+/.test(path) && !/[?&](page|p)=1\b/.test(path);
      check(isPaginated && canonicalPath !== null && canonicalPath === path.replace(/[?&](page|p)=\d+/, "").replace(/\?$/, ""), path, "pagination_canonical");

      const brokenInternal = snap.internalLinks.filter((l) => {
        const target = crawled.get(normalizePath(new URL(l.url)));
        return !!target && (target.res.status >= 400 || target.res.status === 0);
      });
      check(brokenInternal.length > 0, path, "broken_internal_links", brokenInternal.slice(0, 20).map((l) => `${normalizePath(new URL(l.url))} (${crawled.get(normalizePath(new URL(l.url)))?.res.status || "no response"}) "${l.anchor}"`));
      const toRedirects = snap.internalLinks.filter((l) => (crawled.get(normalizePath(new URL(l.url)))?.res.chain.length ?? 0) > 0);
      check(toRedirects.length > 0, path, "links_to_redirects", toRedirects.slice(0, 20).map((l) => `${normalizePath(new URL(l.url))} → ${crawled.get(normalizePath(new URL(l.url)))?.res.finalUrl}`));
      const brokenExternal = snap.externalLinks.filter((l) => isBrokenExternal(externalStatus.get(l.url)));
      check(brokenExternal.length > 0, path, "broken_external_links", brokenExternal.slice(0, 20).map((l) => `${l.url} (${externalStatus.get(l.url) || "no response"})`));
    }

    crawls.set(path, {
      runId: run._id,
      crawledAt: new Date(),
      status: res.status,
      error: res.error,
      finalUrl: res.finalUrl,
      redirectChain: res.chain,
      responseMs: res.ms,
      htmlBytes: res.bytes,
      contentType: res.contentType,
      https: finalUrl.protocol === "https:",
      blockedByRobots,
      xRobotsTag: res.xRobotsTag,
      indexable,
      indexabilityReason,
      depth: page.depth,
      lang: snap?.lang ?? null,
      viewport: snap?.viewport ?? false,
      title: snap?.title ?? "",
      description: snap?.description ?? "",
      canonical: snap?.canonical ?? null,
      robotsMeta: snap?.robotsMeta ?? null,
      noindex,
      nofollow: snap?.nofollow ?? false,
      h1: snap?.h1 ?? [],
      h2: snap?.h2 ?? [],
      h3: snap?.h3 ?? [],
      headingOrderIssue: snap?.headingOrderIssue ?? false,
      images: snap?.images ?? 0,
      imagesMissingAlt: snap?.imagesMissingAlt ?? 0,
      missingAltSamples: snap?.missingAltSamples ?? [],
      imagesNoDimensions: snap?.imagesNoDimensions ?? 0,
      og: snap?.og ?? { title: null, description: null, image: null, type: null },
      twitter: snap?.twitter ?? { card: null, title: null, description: null, image: null },
      jsonLd: snap?.jsonLd ?? [],
      paginationNext: snap?.paginationNext ?? null,
      paginationPrev: snap?.paginationPrev ?? null,
      renderBlockingScripts: snap?.renderBlockingScripts ?? 0,
      wordCount: snap?.wordCount ?? 0,
      readability: snap?.readability ?? null,
      textHash: snap?.textHash ?? null,
      firstWords: snap?.firstWords ?? "",
      datePublished: snap?.datePublished ?? null,
      dateModified: snap?.dateModified ?? null,
      linksIn: incoming.get(path)?.size ?? 0,
      linksOut: snap ? new Set(snap.internalLinks.map((l) => normalizePath(new URL(l.url)))).size : 0,
      externalOut: snap ? new Set(snap.externalLinks.map((l) => l.url)).size : 0,
      brokenLinksOut: 0,
    });
  }

  // ── cross-page checks ───────────────────────────────────────────────────
  totalChecks += 3 * Array.from(crawled.values()).filter((p) => p.snap && p.res.status === 200).length;
  for (const [title, paths] of byTitle) {
    if (paths.length > 1) for (const p of paths) add(p, "title_duplicate", [`"${title.slice(0, 80)}" also on: ${paths.filter((x) => x !== p).slice(0, 5).join(", ")}`]);
  }
  for (const [, paths] of byDescription) {
    if (paths.length > 1) for (const p of paths) add(p, "description_duplicate", [`Also on: ${paths.filter((x) => x !== p).slice(0, 5).join(", ")}`]);
  }
  for (const [, paths] of byHash) {
    if (paths.length > 1) for (const p of paths) add(p, "duplicate_content", [`Same text as: ${paths.filter((x) => x !== p).slice(0, 5).join(", ")}`]);
  }
  for (const [path, c] of crawls) {
    if (!c.indexable) continue;
    totalChecks += 2;
    if (path !== "/" && c.linksIn === 0) add(path, "orphan_page", crawled.get(path)?.inSitemap ? ["Only reachable through the sitemap"] : []);
    else if (path !== "/" && c.linksIn < t.minInternalLinksIn) add(path, "low_internal_links", [`${c.linksIn} linking page(s) (min ${t.minInternalLinksIn})`]);
  }
  for (const [path, c] of crawls) {
    c.brokenLinksOut = findings.filter((f) => f.path === path && (f.checkId === "broken_internal_links" || f.checkId === "broken_external_links")).reduce((s, f) => s + f.details.length, 0);
  }

  // ── scores ───────────────────────────────────────────────────────────────
  const pageScores = new Map<string, ScoreSet>();
  const counts = new Map<string, SeverityCounts>();
  for (const path of crawls.keys()) {
    const f = pageFindings.get(path) ?? [];
    const sev = (bucket?: "technical" | "onPage" | "content") => f.filter((x) => !bucket || SCORE_BUCKET[x.category] === bucket).map((x) => x.severity);
    pageScores.set(path, {
      overall: scoreFromSeverities(sev()),
      technical: scoreFromSeverities(sev("technical")),
      onPage: scoreFromSeverities(sev("onPage")),
      content: scoreFromSeverities(sev("content")),
    });
    const c = { ...EMPTY_COUNTS };
    for (const x of f) c[x.severity]++;
    counts.set(path, c);
  }
  const avg = (k: keyof ScoreSet) => {
    const vals = Array.from(pageScores.values()).map((s) => s[k]);
    return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
  };
  const scores: ScoreSet = { overall: avg("overall"), technical: avg("technical"), onPage: avg("onPage"), content: avg("content") };

  // ── persist ──────────────────────────────────────────────────────────────
  const contentCol = await seoCollection<{ _id: string; text: string; updatedAt: Date }>(COLLECTIONS.pageContent);
  const existingPaths = new Set((await pagesCol.find({}, { projection: { path: 1 } }).toArray()).map((p) => p.path));
  const nowDate = new Date();
  for (const [path, c] of crawls) {
    const page = crawled.get(path)!;
    const update = {
      inSitemap: page.inSitemap,
      lastCrawledAt: nowDate,
      crawl: c,
      scores: pageScores.get(path)!,
      issueCounts: counts.get(path)!,
      updatedAt: nowDate,
    };
    if (existingPaths.has(path)) {
      await pagesCol.updateOne({ path }, { $set: update });
    } else {
      await pagesCol.insertOne({
        _id: newId(),
        path,
        source: page.inSitemap ? "sitemap" : "crawl",
        focusKeyword: "",
        secondaryKeywords: [],
        override: null,
        sitemap: null,
        performance: null,
        indexStatus: null,
        search: null,
        notes: "",
        createdAt: nowDate,
        createdBy: null,
        updatedBy: null,
        ...update,
      });
    }
    if (page.snap) await contentCol.replaceOne({ _id: path }, { text: page.snap.text, updatedAt: nowDate }, { upsert: true });
  }
  // Pages that dropped out of the site (no longer discovered) keep their history but lose "in sitemap".
  await pagesCol.updateMany({ path: { $nin: Array.from(crawls.keys()) }, inSitemap: true }, { $set: { inSitemap: false } });

  const linksCol = await seoCollection<SeoLink>(COLLECTIONS.links);
  await linksCol.deleteMany({});
  if (links.length > 0) {
    for (let i = 0; i < links.length; i += 2000) await linksCol.insertMany(links.slice(i, i + 2000));
  }
  await linksCol.createIndex({ from: 1 }).catch(() => {});
  await linksCol.createIndex({ to: 1 }).catch(() => {});

  const reconcile = await reconcileIssues(findings, {
    source: "audit",
    runId: run._id,
    paths: Array.from(crawls.keys()),
    checkIds: (Object.keys(CHECKS) as CheckId[]).filter((c) => c !== "cwv_poor" && c !== "cwv_needs_improvement"),
  });

  const issueCounts = { ...EMPTY_COUNTS };
  const byCategory: Partial<Record<Category, number>> = {};
  for (const f of findings) {
    issueCounts[CHECKS[f.checkId].severity]++;
    const cat = CHECKS[f.checkId].category;
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  return {
    pagesCrawled: crawls.size,
    sitemapUrls: sitemapPaths.size,
    externalChecked: externalStatus.size,
    issueCounts,
    byCategory,
    passedChecks: Math.max(totalChecks - failedChecks, 0),
    totalChecks,
    scores,
    indexablePages: Array.from(crawls.values()).filter((c) => c.indexable).length,
    newIssues: reconcile.created + reconcile.reopened,
    resolvedIssues: reconcile.resolved,
    notes,
  };
}

/** Maps a sitemap-listed production URL onto the audited origin — re-exported for callers that fetch single pages. */
export { toOrigin };

export async function listRuns(limit = 30): Promise<CrawlRun[]> {
  const runs = await seoCollection<CrawlRun>(COLLECTIONS.runs);
  return runs.find({}).sort({ startedAt: -1 }).limit(limit).toArray();
}

export async function getRun(id: string): Promise<CrawlRun | null> {
  const runs = await seoCollection<CrawlRun>(COLLECTIONS.runs);
  return runs.findOne({ _id: id });
}

export async function latestCompletedRun(): Promise<CrawlRun | null> {
  const runs = await seoCollection<CrawlRun>(COLLECTIONS.runs);
  return runs.find({ status: "completed" }).sort({ startedAt: -1 }).limit(1).next();
}
