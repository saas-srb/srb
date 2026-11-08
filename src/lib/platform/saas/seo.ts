import "server-only";
import type { MetadataRoute } from "next";
import { MODULE_COPY } from "@/lib/platform/saas/content";
import { POSTS } from "@/lib/platform/saas/site";
import { DOCS } from "@/lib/platform/saas/docs";
import { TUTORIALS } from "@/lib/platform/saas/tutorials";
import { FEATURE_LISTS, featuresOf } from "@/lib/platform/saas/feature-lists";
import { listPanels } from "@/lib/platform/panels/store";
import { productDocsPath, productPath } from "@/lib/platform/saas/product-routes";

/** [path, priority, how often it changes]. Search engines read these as hints: the home page, products and pricing matter most. */
const PAGES: [string, number, "daily" | "weekly" | "monthly" | "yearly"][] = [
  ["", 1, "weekly"],
  ["/products", 0.9, "weekly"],
  ["/pricing", 0.9, "weekly"],
  ["/docs", 0.8, "weekly"],
  ["/faqs", 0.8, "weekly"],
  ["/gallery", 0.7, "monthly"],
  ["/blog", 0.8, "weekly"],
  ["/vision", 0.6, "monthly"],
  ["/roadmap", 0.6, "monthly"],
  ["/about", 0.6, "monthly"],
  ["/success-stories", 0.6, "monthly"],
  ["/onboarded-businesses", 0.5, "monthly"],
  ["/demo", 0.7, "monthly"],
  ["/contact", 0.6, "monthly"],
  ["/offers", 0.6, "weekly"],
  ["/security", 0.6, "monthly"],
  ["/status", 0.3, "daily"],
  ["/sla", 0.4, "monthly"],
  ["/privacy", 0.3, "yearly"],
  ["/terms", 0.3, "yearly"],
  ["/cookies", 0.3, "yearly"],
  ["/data-policy", 0.3, "yearly"],
  ["/refund-policy", 0.3, "yearly"],
  ["/dpa", 0.4, "yearly"],
  ["/subprocessors", 0.4, "monthly"],
  ["/data-requests", 0.4, "yearly"],
  ["/grievance", 0.4, "yearly"],
  ["/vulnerability-disclosure", 0.4, "yearly"],
];

export async function saasSitemap(origin: string): Promise<MetadataRoute.Sitemap> {
  const plans = ["free", "starter", "growth", "business"];
  const panels = (await listPanels().catch(() => [])).filter((p) => p.active && MODULE_COPY[p.key]);
  const now = new Date();
  type Row = { path: string; priority: number; freq: "daily" | "weekly" | "monthly" | "yearly"; last?: Date };
  const rows: Row[] = [
    ...PAGES.map(([path, priority, freq]) => ({ path, priority, freq })),
    ...panels.map((p) => ({ path: productPath(p.key), priority: 0.9, freq: "weekly" as const })),
    ...plans.map((p) => ({ path: `/pricing/${p}`, priority: 0.6, freq: "weekly" as const })),
    ...POSTS.map((p) => ({ path: `/blog/${p.slug}`, priority: 0.7, freq: "monthly" as const, last: new Date(p.date) })),
    ...DOCS.map((r) => ({ path: `/docs/${r.slug}`, priority: 0.6, freq: "monthly" as const })),
    ...TUTORIALS.map((t) => ({ path: `/docs/walkthroughs/${t.slug}`, priority: 0.6, freq: "monthly" as const })),
    ...Object.keys(FEATURE_LISTS).flatMap((k) => featuresOf(k).map((f) => ({ path: productDocsPath(k, f.slug), priority: 0.5, freq: "monthly" as const }))),
  ];
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.path) ? false : (seen.add(r.path), true)))
    .map((r) => ({ url: `${origin}${r.path}`, lastModified: r.last && !Number.isNaN(r.last.getTime()) ? r.last : now, changeFrequency: r.freq, priority: r.priority }));
}

export function saasRobots(origin: string): string {
  return ["User-agent: *", "Allow: /", "Disallow: /console/", "Disallow: /api/", "Disallow: /commandos/", "Disallow: /signup/verify", "", `Sitemap: ${origin}/sitemap.xml`, `# For AI assistants: ${origin}/llms.txt`, ""].join("\n");
}
