import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { createHash } from "node:crypto";
import * as cheerio from "cheerio";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { fetchUrl } from "@/lib/products/rankmax-ai/fetch";
import { getSiteInfo } from "@/lib/products/sitecraft-ai/site-info";
import { getCompanyBrand } from "@/lib/platform/branding";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { ensureVectorStore } from "@/lib/chatbot-config";
import {
  uploadTextToVectorStore,
  removeFromVectorStore,
  type VectorStoreUploadResult,
} from "@/lib/kb-openai";
import { KbRunLogger, type KbRunType } from "@/lib/kb-runs";
import { baseSitemap } from "@/app/sitemap";

export const KB_WEBSITE_PAGES_COLLECTION = "kb_website_pages";

/** Routes the crawler must never fetch (the chat page itself, admin, etc.). */
const CRAWL_EXCLUDES = new Set<string>(["/ask"]);

const SYNTHETIC_COMPANY_FACTS_URL = "synthetic://company-facts";

export type KbPageStatus = "pending" | "indexed" | "failed" | "stale";

export interface KbWebsitePage {
  _id: ObjectId;
  /** Canonical absolute URL (or the `synthetic://` key). */
  url: string;
  title: string;
  contentHash: string;
  charCount: number;
  status: KbPageStatus;
  openaiFileId: string | null;
  vectorStoreFileId: string | null;
  chunkCount: number | null;
  usageBytes: number | null;
  lastIndexedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedKbWebsitePage {
  _id: string;
  url: string;
  path: string;
  title: string;
  status: KbPageStatus;
  charCount: number;
  chunkCount: number | null;
  usageBytes: number | null;
  lastIndexedAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

let indexesEnsured = false;

async function getPagesCollection(): Promise<Collection<KbWebsitePage>> {
  const db = await getDb();
  const collection = db.collection<KbWebsitePage>(KB_WEBSITE_PAGES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await collection.createIndex({ url: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

// ---------------------------------------------------------------------------
// Crawl target discovery — reuse the sitemap's route discovery + exclusions.
// ---------------------------------------------------------------------------

/**
 * `CHATBOT_CRAWL_BASE_URL` is one platform-wide env var (for crawling a
 * staging/local copy of the company's own site), so only the platform owner
 * honours it — any other company always crawls its own site.
 */
export async function chatbotCrawlBaseOverride(): Promise<string | null> {
  const override = process.env.CHATBOT_CRAWL_BASE_URL;
  return override && (await isPlatformOwnerContext()) ? override : null;
}

export async function listCrawlTargets(): Promise<{ path: string; url: string }[]> {
  const [entries, siteUrl] = await Promise.all([baseSitemap(), companySiteUrl()]);
  const targets: { path: string; url: string }[] = [];
  for (const entry of entries) {
    const raw = typeof entry.url === "string" ? entry.url : String(entry.url);
    let path: string;
    try {
      path = new URL(raw).pathname || "/";
    } catch {
      path = raw.startsWith("/") ? raw : `/${raw}`;
    }
    if (CRAWL_EXCLUDES.has(path)) continue;
    targets.push({ path, url: `${siteUrl}${path === "/" ? "" : path}` });
  }
  return targets;
}

// ---------------------------------------------------------------------------
// Fetch + extract
// ---------------------------------------------------------------------------

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\u00A0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface ExtractedPage {
  title: string;
  description: string;
  text: string;
  faqs: { question: string; answer: string }[];
}

function extractFaqsFromJsonLd($: cheerio.CheerioAPI): { question: string; answer: string }[] {
  const faqs: { question: string; answer: string }[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    if (!raw) return;
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;
      const type = n["@type"];
      const isFaq = type === "FAQPage" || (Array.isArray(type) && type.includes("FAQPage"));
      if (!isFaq || !Array.isArray(n.mainEntity)) continue;
      for (const q of n.mainEntity as Record<string, unknown>[]) {
        const question = typeof q.name === "string" ? q.name.trim() : "";
        const accepted = q.acceptedAnswer as Record<string, unknown> | undefined;
        const answer = accepted && typeof accepted.text === "string" ? accepted.text.trim() : "";
        if (question && answer) faqs.push({ question, answer });
      }
    }
  });
  return faqs;
}

export function extractContent(html: string): ExtractedPage {
  const $ = cheerio.load(html);
  const title =
    $("head > title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "Untitled";
  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const faqs = extractFaqsFromJsonLd($);

  // Drop site chrome and non-content elements so page chunks aren't polluted
  // with the nav mega-menu, footer link farm, or the floating chat button.
  $("header, footer, nav, script, style, noscript, svg, form, iframe").remove();
  $('[aria-hidden="true"], .sr-only').remove();

  const main = $("main");
  const bodyText = (main.length ? main : $("body")).text();
  const text = normalizeWhitespace(bodyText);

  return { title, description, text, faqs };
}

function buildPageDocument(page: ExtractedPage, url: string): string {
  const parts = [`# ${page.title}`, "", `Source URL: ${url}`, ""];
  if (page.description) parts.push(`Summary: ${page.description}`, "");
  parts.push(page.text);
  if (page.faqs.length > 0) {
    parts.push("", "## Frequently Asked Questions", "");
    for (const f of page.faqs) parts.push(`Q: ${f.question}`, `A: ${f.answer}`, "");
  }
  return parts.join("\n");
}

async function fetchHtml(url: string): Promise<string> {
  // SSRF-guarded (public hosts only, redirects re-checked, size-capped) — the URL comes from a company-controlled site.
  const res = await fetchUrl(url, { timeoutMs: 15_000 });
  if (res.status === 0 || res.status >= 400 || res.body === null) throw new Error(res.error || `HTTP ${res.status}`);
  return res.body;
}

function hashOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Synthetic "company facts" document — authoritative contact / org data that
// isn't reliably scrapable as prose.
// ---------------------------------------------------------------------------

async function buildCompanyFactsDocument(): Promise<{ title: string; text: string }> {
  const siteUrl = await companySiteUrl();
  // Contact details + social links as currently published in CMS → Site Identity.
  const { contact, social, brand } = await getSiteInfo();
  const name = (brand.namePrimary + brand.nameAccent).trim() || (await getCompanyBrand()).name;
  // Only what the company has published itself (HRMS → Company, CMS → Site Identity).
  const company = await getCompanyDetails().catch(() => null);
  const email = company?.email || contact.email;
  const phone = company?.phone || contact.phoneDisplay;
  const address = [company?.addressLine1, company?.addressLine2, company?.city, company?.state, company?.postalCode].filter((x) => x?.trim()).join(", ") || contact.address.replace(/\n/g, ", ");
  const lines = [
    `# ${name} — Company Facts`,
    "",
    "This is authoritative reference information about the company.",
    "",
    `Name: ${company?.legalName || name}`,
    `Website: ${siteUrl}`,
    ...(email ? [`Primary contact email: ${email}`] : []),
    ...(contact.email ? [`Support email: ${contact.email}`] : []),
    ...(phone ? [`Phone: ${phone}`] : []),
    ...(contact.whatsappHref ? [`WhatsApp: ${contact.whatsappHref}`] : []),
    ...(address ? [`Office address: ${address}`] : []),
    ...(contact.mapsUrl ? [`Map: ${contact.mapsUrl}`] : []),
    "",
    ...(social.length ? ["Social profiles:", ...social.map((s) => `- ${s.name}: ${s.href}`), ""] : []),
    "To start a project or get a quote, visit the contact page at " + `${siteUrl}/contact` + (email ? " or email " + email : "") + ".",
  ];
  return { title: `${name} — Company Facts`, text: lines.join("\n") };
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

function slugForUrl(url: string): string {
  return (
    url
      .replace(/^https?:\/\//, "")
      .replace(/^synthetic:\/\//, "synthetic-")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 100) || "page"
  );
}

async function indexOnePage(
  vectorStoreId: string,
  url: string,
  doc: { title: string; text: string },
  logger: KbRunLogger
): Promise<void> {
  const collection = await getPagesCollection();
  const contentHash = hashOf(doc.text);
  const existing = await collection.findOne({ url });

  // Detach any previous OpenAI file for this URL before re-uploading.
  if (existing?.vectorStoreFileId || existing?.openaiFileId) {
    await removeFromVectorStore({
      vectorStoreId,
      vectorStoreFileId: existing.vectorStoreFileId,
      fileId: existing.openaiFileId,
    });
  }

  let result: VectorStoreUploadResult;
  try {
    result = await uploadTextToVectorStore({
      vectorStoreId,
      filename: `${slugForUrl(url)}.md`,
      text: doc.text,
      attributes: {
        source_type: url.startsWith("synthetic://") ? "synthetic" : "website",
        url,
        title: doc.title.slice(0, 200),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    await collection.updateOne(
      { url },
      {
        $set: {
          title: doc.title,
          contentHash,
          charCount: doc.text.length,
          status: "failed",
          lastError: message,
          updatedAt: new Date(),
        },
        $setOnInsert: { url, createdAt: new Date(), lastIndexedAt: null },
      },
      { upsert: true }
    );
    logger.recordFailed();
    logger.log("error", `${url} — ${message}`);
    return;
  }

  const now = new Date();
  const status: KbPageStatus = result.status === "completed" ? "indexed" : result.status === "failed" ? "failed" : "pending";
  await collection.updateOne(
    { url },
    {
      $set: {
        title: doc.title,
        contentHash,
        charCount: doc.text.length,
        status,
        openaiFileId: result.fileId,
        vectorStoreFileId: result.vectorStoreFileId,
        chunkCount: result.chunkCount,
        usageBytes: result.usageBytes,
        lastIndexedAt: now,
        lastError: result.lastError,
        updatedAt: now,
      },
      $setOnInsert: { url, createdAt: now },
    },
    { upsert: true }
  );

  if (status === "indexed") {
    logger.recordIndexed();
    logger.log("info", `Indexed ${url} (${result.chunkCount ?? "?"} chunks)`);
  } else {
    logger.recordFailed();
    logger.log("warn", `${url} finished with status ${result.status}`);
  }
}

// ---------------------------------------------------------------------------
// Orchestrators
// ---------------------------------------------------------------------------

export interface IndexWebsiteOptions {
  baseUrl: string;
  incremental?: boolean;
  triggeredBy: string;
  /** Restrict to these absolute URLs (used by "re-index selected pages"). */
  onlyUrls?: string[];
}

function websiteRunType(opts: { onlyUrls?: string[]; incremental?: boolean }): KbRunType {
  return opts.onlyUrls ? "website_page" : opts.incremental ? "website_incremental" : "website_full";
}

/** Creates the run record synchronously and returns a handle to execute later. */
export async function beginWebsiteIndex(
  opts: Pick<IndexWebsiteOptions, "triggeredBy" | "incremental" | "onlyUrls">
): Promise<{ runId: string; logger: KbRunLogger }> {
  const logger = await KbRunLogger.start(websiteRunType(opts), opts.triggeredBy);
  return { runId: String(logger.id), logger };
}

/** Runs the crawl+index for an already-started run (safe to `after()`). */
export async function runWebsiteIndex(logger: KbRunLogger, opts: IndexWebsiteOptions): Promise<void> {
  try {
    const vectorStoreId = await ensureVectorStore();
    const collection = await getPagesCollection();

    const allTargets = await listCrawlTargets();
    const targets = opts.onlyUrls
      ? allTargets.filter((t) => opts.onlyUrls!.includes(t.url))
      : allTargets;

    // Total = crawlable pages + 1 synthetic doc (unless a subset re-index).
    const includeSynthetic = !opts.onlyUrls || opts.onlyUrls.includes(SYNTHETIC_COMPANY_FACTS_URL);
    logger.setTotal(targets.length + (includeSynthetic ? 1 : 0));
    logger.log("info", `Starting ${websiteRunType(opts)} — ${targets.length} page(s) from ${opts.baseUrl}`);
    await logger.flush();

    const existingByUrl = new Map<string, KbWebsitePage>();
    for (const doc of await collection.find({}).toArray()) existingByUrl.set(doc.url, doc);

    let processed = 0;
    const CONCURRENCY = 3;
    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async ({ path, url }) => {
          const fetchUrl = `${opts.baseUrl.replace(/\/$/, "")}${path === "/" ? "" : path}`;
          try {
            const html = await fetchHtml(fetchUrl);
            const extracted = extractContent(html);
            if (!extracted.text || extracted.text.length < 80) {
              logger.recordSkipped();
              logger.log("warn", `Skipped ${url} — too little content`);
              return;
            }
            const document = { title: extracted.title, text: buildPageDocument(extracted, url) };
            const prev = existingByUrl.get(url);
            if (
              opts.incremental &&
              prev &&
              prev.status === "indexed" &&
              prev.contentHash === hashOf(document.text)
            ) {
              logger.recordSkipped();
              return;
            }
            await indexOnePage(vectorStoreId, url, document, logger);
          } catch (err) {
            const message = err instanceof Error ? err.message : "fetch failed";
            logger.recordFailed();
            logger.log("error", `${url} — ${message}`);
          }
        })
      );
      processed += batch.length;
      if (processed % 9 === 0) await logger.flush();
    }

    if (includeSynthetic) {
      const facts = await buildCompanyFactsDocument();
      await indexOnePage(vectorStoreId, SYNTHETIC_COMPANY_FACTS_URL, facts, logger);
    }

    await logger.finish("completed");
    await cmsEvents.indexFinished(true, "Your website was re-read; the chatbot answers from the latest pages.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexing failed";
    logger.log("error", message);
    await logger.finish("failed", message);
    await cmsEvents.indexFinished(false, message);
  }
}

/** Convenience: start a run and execute it inline (used by scripts/tests). */
export async function indexWebsite(opts: IndexWebsiteOptions): Promise<string> {
  const { runId, logger } = await beginWebsiteIndex(opts);
  await runWebsiteIndex(logger, opts);
  return runId;
}

// ---------------------------------------------------------------------------
// Admin reads / mutations
// ---------------------------------------------------------------------------

function serializePage(doc: KbWebsitePage): SerializedKbWebsitePage {
  let path = doc.url;
  try {
    path = new URL(doc.url).pathname;
  } catch {
    path = doc.url;
  }
  return {
    _id: String(doc._id),
    url: doc.url,
    path,
    title: doc.title,
    status: doc.status,
    charCount: doc.charCount,
    chunkCount: doc.chunkCount ?? null,
    usageBytes: doc.usageBytes ?? null,
    lastIndexedAt: doc.lastIndexedAt ? new Date(doc.lastIndexedAt).toISOString() : null,
    lastError: doc.lastError ?? null,
    updatedAt: new Date(doc.updatedAt).toISOString(),
  };
}

export async function listIndexedPages(): Promise<SerializedKbWebsitePage[]> {
  const collection = await getPagesCollection();
  const docs = await collection.find({}).sort({ url: 1 }).toArray();
  return docs.map(serializePage);
}

export interface WebsiteKbSummary {
  totalPages: number;
  indexedPages: number;
  failedPages: number;
  totalChunks: number;
  lastIndexedAt: string | null;
}

export async function getWebsiteKbSummary(): Promise<WebsiteKbSummary> {
  const collection = await getPagesCollection();
  const docs = await collection.find({}).toArray();
  const indexed = docs.filter((d) => d.status === "indexed");
  const lastIndexedAt = docs
    .map((d) => (d.lastIndexedAt ? new Date(d.lastIndexedAt).getTime() : 0))
    .reduce((a, b) => Math.max(a, b), 0);
  return {
    totalPages: docs.length,
    indexedPages: indexed.length,
    failedPages: docs.filter((d) => d.status === "failed").length,
    totalChunks: indexed.reduce((sum, d) => sum + (d.chunkCount ?? 0), 0),
    lastIndexedAt: lastIndexedAt ? new Date(lastIndexedAt).toISOString() : null,
  };
}

/** Resolve stored page `_id`s to their URLs (used by "re-index selected"). */
export async function urlsForPageIds(ids: string[]): Promise<string[]> {
  const valid = ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (valid.length === 0) return [];
  const collection = await getPagesCollection();
  const docs = await collection.find({ _id: { $in: valid } }).toArray();
  return docs.map((d) => d.url);
}

/** Look up a citation's source page by its OpenAI file id. */
export async function findWebsitePageByFileId(fileId: string): Promise<KbWebsitePage | null> {
  const collection = await getPagesCollection();
  return collection.findOne({ openaiFileId: fileId });
}
