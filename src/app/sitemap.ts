import type { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { getRuntimeRecords } from "@/lib/products/sitecraft-ai/collections/store";
import type { BlogPostMeta } from "@/types/content";
import type { Job } from "@/types/content";
import type { EngagementCategory } from "@/types/content";
import { getSeoSiteState } from "@/lib/products/rankmax-ai/public";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { listPublishedPaths } from "@/lib/products/sitecraft-ai/public";
import { loadProducts } from "@/lib/products/server";
import { isProductsHref, productHref } from "@/lib/products/shared";
import { onAppSurface, onSaasHost, saasOrigin } from "@/lib/platform/saas/request";
import { saasSitemap } from "@/lib/platform/saas/seo";

const APP_DIR = path.join(process.cwd(), "src/app/(site)");

// Routes that physically exist as a page but are deliberately kept out of the
// sitemap because the page itself sets `robots: { index: false }` (duplicate
// content, canonicalized elsewhere). Keep this list in sync with any future
// noindex pages — everything else under src/app/(site) is picked up
// automatically, so a new page can never be silently left out again.
const EXCLUDED_ROUTES = new Set<string>([
  "/services/prediction-forecasting", // duplicate of /services/prediction-and-forecasting, noindex
  "/ask", // AI chatbot page — thin app shell, sets robots: { index: false }
  // Policy pages — unlinked from the visible site, noindex.
  "/about/privacy-policy",
  "/about/terms-and-conditions",
  "/about/refund-cancellation-policy",
  "/about/acceptable-use-policy",
]);

/** Recursively finds every route that has a page.tsx under the (site) route group. */
function discoverRoutes(dir: string, base = ""): string[] {
  const routes: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  if (entries.some((entry) => entry.isFile() && /^page\.(tsx|ts|jsx|js)$/.test(entry.name))) {
    routes.push(base === "" ? "/" : base);
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("_")) continue; // private folders, e.g. _components
    if (entry.name.startsWith("[")) continue; // dynamic segments aren't used in this app; skip defensively
    const isRouteGroup = entry.name.startsWith("(") && entry.name.endsWith(")");
    const nextBase = isRouteGroup ? base : `${base}/${entry.name}`;
    routes.push(...discoverRoutes(path.join(dir, entry.name), nextBase));
  }

  return routes;
}

/**
 * Every public route: pages discovered on disk, plus one page per record in
 * the blog / jobs / engagement collections (those pages are dynamic
 * `[slug]` routes, so they're listed from the records — code + published CMS
 * records — not from the filesystem). Also used as the chatbot knowledge-base
 * crawl list. URLs are on the current company's own site origin.
 */
export async function baseSitemap(): Promise<MetadataRoute.Sitemap> {
  const [siteUrl, blogPosts, jobs, engagement, products, owner, published] = await Promise.all([
    companySiteUrl(),
    getRuntimeRecords<BlogPostMeta>("blog"),
    getRuntimeRecords<Job>("jobs"),
    getRuntimeRecords<EngagementCategory>("engagement"),
    loadProducts(), // null off the platform owner's site: Products pages exist only there
    isPlatformOwnerContext(),
    listPublishedPaths(),
  ]);
  // The operator's site keeps every page of the codebase. Any other company lists only the pages it has published in its CMS
  // (plus the sign-in and sign-up pages, which always exist), so no route of the operator's is advertised on its site.
  const live = new Set([...published, "/login", "/register"]);
  const recordRoutes = [
    ...(products ?? []).map((p) => productHref(p.slug)),
    ...blogPosts.map((p) => `/blog/${p.slug}`),
    ...jobs.map((j) => `/careers/${j.slug}`),
    ...engagement.map((c) => `/resource-augmentation/${c.slug}`),
  ];
  const blogDates = new Map(blogPosts.map((post) => [`/blog/${post.slug}`, post.date]));
  const jobMap = new Map(jobs.map((job) => [`/careers/${job.slug}`, job]));

  // Dynamically filter out draft, closed, or expired job postings from sitemap
  const excludedJobRoutes = new Set(
    jobs
      .filter((job) => job.status === "draft" || job.status === "closed" || job.status === "expired")
      .map((job) => `/careers/${job.slug}`)
  );

  const routes = Array.from(new Set([...discoverRoutes(APP_DIR).filter((r) => owner || live.has(r)), ...recordRoutes]))
    .filter((route) => !EXCLUDED_ROUTES.has(route) && !excludedJobRoutes.has(route))
    // /products is a real route folder, so it is discovered for every company — but it 404s off the owner's site.
    .filter((route) => products !== null || !isProductsHref(route))
    .sort();

  return routes.map((route) => {
    const blogDate = blogDates.get(route);
    const job = jobMap.get(route);

    let lastModified = new Date();
    if (blogDate) {
      lastModified = new Date(blogDate);
    } else if (job && job.datePosted) {
      lastModified = new Date(job.datePosted);
    }

    return {
      url: `${siteUrl}${route}`,
      lastModified,
      changeFrequency: blogDate ? "monthly" : job ? "weekly" : "weekly",
      priority: route === "/" ? 1 : blogDate ? 0.6 : job ? 0.7 : 0.7,
    };
  });
}

/**
 * The served sitemap: the code-defined routes with the SEO product's per-page
 * settings applied (/rankmax-ai/sitemap, /rankmax-ai/pages) — pages excluded there, or
 * set to noindex, are dropped; priority / change frequency overrides win.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (await onAppSurface()) return [];
  if (await onSaasHost()) return saasSitemap(await saasOrigin());
  const entries = await baseSitemap();
  const { sitemap: overrides, overrides: meta } = await getSeoSiteState();
  const out: MetadataRoute.Sitemap = [];
  for (const entry of entries) {
    const path = new URL(entry.url).pathname || "/";
    const o = overrides[path];
    if (o?.exclude || meta[path]?.robots?.index === false) continue;
    out.push({
      ...entry,
      ...(o?.priority !== undefined ? { priority: o.priority } : {}),
      ...(o?.changeFrequency ? { changeFrequency: o.changeFrequency } : {}),
    });
  }
  return out;
}
