import "server-only";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { keywordsCol } from "@/lib/products/rankmax-ai/keywords";
import type { SeoLink, SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * Internal-link analysis over the link graph stored by the latest crawl:
 * per-page in/out counts, broken internal links, orphans, important pages
 * with too few links, and concrete link OPPORTUNITIES — pages whose text
 * already mentions another page's target keyword but doesn't link to it.
 */

export async function linkGraphFor(path: string): Promise<{ incoming: SeoLink[]; outgoing: SeoLink[] }> {
  const c = await seoCollection<SeoLink>(COLLECTIONS.links);
  const [incoming, outgoing] = await Promise.all([c.find({ to: path, internal: true }).sort({ from: 1 }).toArray(), c.find({ from: path }).sort({ internal: -1, to: 1 }).toArray()]);
  return { incoming, outgoing };
}

export async function brokenLinks(internal: boolean, limit = 500): Promise<SeoLink[]> {
  const c = await seoCollection<SeoLink>(COLLECTIONS.links);
  // External hosts often answer bots with 403/429/999, so only hard failures count as broken there.
  const broken = internal ? [{ status: 0 }, { status: { $gte: 400 } }] : [{ status: { $in: [0, 404, 410] } }, { status: { $gte: 500 } }];
  return c.find({ internal, $or: broken }).sort({ to: 1 }).limit(limit).toArray();
}

export async function redirectingLinks(limit = 300): Promise<SeoLink[]> {
  const c = await seoCollection<SeoLink>(COLLECTIONS.links);
  return c.find({ internal: true, redirects: true }).limit(limit).toArray();
}

export interface LinkOpportunity {
  from: string;
  to: string;
  phrase: string;
  context: string;
  reason: string;
}

export async function linkOpportunities(limit = 150): Promise<LinkOpportunity[]> {
  const [pages, texts, keywords, links] = await Promise.all([
    (await seoCollection<SeoPage>(COLLECTIONS.pages)).find({ "crawl.indexable": true }, { projection: { path: 1, focusKeyword: 1, "crawl.linksIn": 1 } }).toArray(),
    (await seoCollection<{ _id: string; text: string }>(COLLECTIONS.pageContent)).find({}).toArray(),
    (await keywordsCol()).find({ status: "tracking", targetUrl: { $ne: "" } }).toArray(),
    (await seoCollection<SeoLink>(COLLECTIONS.links)).find({ internal: true }, { projection: { from: 1, to: 1 } }).toArray(),
  ]);
  const indexable = new Set(pages.map((p) => p.path));
  const linked = new Set(links.map((l) => `${l.from}→${l.to}`));
  const textBy = new Map(texts.filter((t) => indexable.has(t._id)).map((t) => [t._id, t.text]));

  // Target phrases per page: its focus keyword + tracked keywords that target it (3+ chars, not too generic).
  const targets: { to: string; phrase: string; linksIn: number }[] = [];
  for (const p of pages) if (p.focusKeyword && p.focusKeyword.length >= 4) targets.push({ to: p.path, phrase: p.focusKeyword.toLowerCase(), linksIn: p.crawl?.linksIn ?? 0 });
  for (const k of keywords) if (indexable.has(k.targetUrl) && k.keyword.length >= 4) targets.push({ to: k.targetUrl, phrase: k.normalized, linksIn: pages.find((p) => p.path === k.targetUrl)?.crawl?.linksIn ?? 0 });
  const seen = new Set<string>();
  const out: LinkOpportunity[] = [];
  // Pages with the fewest incoming links first — they gain most.
  targets.sort((a, b) => a.linksIn - b.linksIn);
  for (const t of targets) {
    const rx = new RegExp(`\\b${t.phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}\\b`, "i");
    for (const [from, text] of textBy) {
      if (from === t.to || linked.has(`${from}→${t.to}`) || seen.has(`${from}→${t.to}`)) continue;
      const m = rx.exec(text);
      if (!m) continue;
      seen.add(`${from}→${t.to}`);
      const start = Math.max(0, m.index - 70);
      out.push({
        from,
        to: t.to,
        phrase: m[0],
        context: `${start > 0 ? "…" : ""}${text.slice(start, m.index + m[0].length + 70).trim()}…`,
        reason: `${from} mentions “${m[0]}” but doesn't link to ${t.to} (${t.linksIn} incoming link${t.linksIn === 1 ? "" : "s"}).`,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Pages that matter (tracked-keyword targets, search traffic or high sitemap priority) but receive few internal links. */
export async function importantLowLinked(): Promise<{ page: SeoPage; why: string }[]> {
  const [settings, pages, keywords] = await Promise.all([
    getSettings(),
    (await seoCollection<SeoPage>(COLLECTIONS.pages)).find({ "crawl.indexable": true }).toArray(),
    (await keywordsCol()).find({ status: "tracking" }, { projection: { targetUrl: 1, keyword: 1 } }).toArray(),
  ]);
  const targeted = new Map<string, number>();
  for (const k of keywords) if (k.targetUrl) targeted.set(k.targetUrl, (targeted.get(k.targetUrl) ?? 0) + 1);
  const topClicks = pages.filter((p) => (p.search?.clicks ?? 0) > 0).sort((a, b) => (b.search?.clicks ?? 0) - (a.search?.clicks ?? 0)).slice(0, 20).map((p) => p.path);
  const out: { page: SeoPage; why: string }[] = [];
  for (const p of pages) {
    if (p.path === "/" || (p.crawl?.linksIn ?? 0) >= settings.thresholds.minInternalLinksIn) continue;
    const reasons = [
      targeted.has(p.path) && `targets ${targeted.get(p.path)} tracked keyword(s)`,
      topClicks.includes(p.path) && `top-20 page by search clicks`,
      (p.sitemap?.priority ?? 0) >= 0.8 && `sitemap priority ${p.sitemap?.priority}`,
    ].filter(Boolean) as string[];
    if (reasons.length) out.push({ page: p, why: reasons.join(", ") });
  }
  return out.sort((a, b) => (a.page.crawl?.linksIn ?? 0) - (b.page.crawl?.linksIn ?? 0));
}
