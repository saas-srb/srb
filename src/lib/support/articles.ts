import "server-only";
import { articlesCol, type ArticleDoc } from "@/lib/support/db";

/** Help content: managed by SelfRun AI in the Platform Console, read by every company. */

export type ArticleView = Omit<ArticleDoc, "createdAt" | "updatedAt"> & { createdAt: string; updatedAt: string };

const view = (a: ArticleDoc): ArticleView => ({ ...a, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString() });

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STOP = new Set(["the", "a", "an", "how", "do", "i", "to", "is", "in", "on", "of", "and", "or", "my", "can", "what", "why", "does", "this", "for", "with", "it", "me", "where", "get", "are", "be"]);
export const tokens = (q: string) => [...new Set(q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w)))].slice(0, 12);

/** Published articles ranked by how well they match `query` (title > tags > summary > body), with a boost for the user's product. */
export async function searchArticles(query: string, opts: { limit?: number; panel?: string | null } = {}): Promise<ArticleView[]> {
  const words = tokens(query);
  const col = await articlesCol();
  const published = { status: "published" as const };
  if (words.length === 0) {
    const rows = await col.find(published).sort({ updatedAt: -1 }).limit(opts.limit ?? 20).toArray();
    return rows.map(view);
  }
  const re = new RegExp(words.map(escapeRe).join("|"), "i");
  const rows = await col.find({ ...published, $or: [{ title: re }, { summary: re }, { body: re }, { tags: re }] }).limit(200).toArray();
  const score = (a: ArticleDoc) => {
    let s = 0;
    for (const w of words) {
      const r = new RegExp(escapeRe(w), "i");
      if (r.test(a.title)) s += 6;
      if (a.tags.some((t) => r.test(t))) s += 4;
      if (r.test(a.summary)) s += 3;
      if (r.test(a.body)) s += 1;
    }
    if (opts.panel && a.panels.includes(opts.panel)) s += 3;
    return s;
  };
  return rows
    .map((a) => ({ a, s: score(a) }))
    .sort((x, y) => y.s - x.s)
    .slice(0, opts.limit ?? 20)
    .map((x) => view(x.a));
}

export async function listPublished(limit = 100): Promise<ArticleView[]> {
  return (await (await articlesCol()).find({ status: "published" }).sort({ category: 1, title: 1 }).limit(limit).toArray()).map(view);
}

export async function getPublishedBySlug(slug: string): Promise<ArticleView | null> {
  const a = await (await articlesCol()).findOne({ slug: clean(slug, 100), status: "published" });
  return a ? view(a) : null;
}

// ── Staff ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listAllArticles(): Promise<ArticleView[]> {
  return (await (await articlesCol()).find({}).sort({ updatedAt: -1 }).limit(500).toArray()).map(view);
}

export async function getArticleById(id: string): Promise<ArticleView | null> {
  const a = await (await articlesCol()).findOne({ _id: clean(id, 40) });
  return a ? view(a) : null;
}

export interface ArticleInput {
  id?: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  tags: string;
  panels: string;
  status: "draft" | "published";
}

export async function saveArticle(input: ArticleInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = clean(input.title, 140);
  const body = clean(input.body, 20000);
  if (!title) return { ok: false, error: "Give the article a title." };
  if (!body) return { ok: false, error: "The article needs some content." };
  const list = (v: string) => [...new Set(String(v ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
  const fields = { title, summary: clean(input.summary, 300), body, category: clean(input.category, 60) || "General", tags: list(input.tags), panels: list(input.panels), status: input.status === "published" ? ("published" as const) : ("draft" as const), updatedAt: new Date() };
  const col = await articlesCol();
  if (input.id) {
    const res = await col.updateOne({ _id: input.id }, { $set: fields });
    return res.matchedCount ? { ok: true, id: input.id } : { ok: false, error: "That article no longer exists." };
  }
  const base = slugify(title) || "article";
  let slug = base;
  for (let n = 2; await col.findOne({ slug }, { projection: { _id: 1 } }); n++) slug = `${base}-${n}`;
  const id = crypto.randomUUID();
  await col.insertOne({ _id: id, slug, ...fields, createdAt: new Date() });
  return { ok: true, id };
}

export async function deleteArticle(id: string): Promise<void> {
  await (await articlesCol()).deleteOne({ _id: clean(id, 40) });
}
