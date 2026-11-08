import "server-only";
import type { Filter } from "mongodb";
import { COLLECTIONS, createStamp, escapeRegex, newId, num, seoCollection, str, updateStamp, type Stamps } from "@/lib/products/rankmax-ai/db";
import { cleanPath } from "@/lib/products/rankmax-ai/pages";
import { parseCsv } from "@/lib/products/rankmax-ai/csv-parse";
import { SeoInputError } from "@/lib/products/rankmax-ai/viewer";

/**
 * Tracked keywords, keyword groups and clusters. Keyword metrics (volume,
 * difficulty, CPC, competition) are always third-party ESTIMATES — they are
 * entered by hand or imported from a keyword tool, and `metricsSource`
 * records where they came from. Positions are recorded in `rankings.ts`.
 */

export const INTENTS = ["informational", "navigational", "commercial", "transactional"] as const;
export const PRIORITIES = ["low", "medium", "high", "critical"] as const;
export const KEYWORD_STATUSES = ["tracking", "paused", "archived"] as const;
export const KEYWORD_TYPES = ["primary", "secondary"] as const;
export const DEVICES = ["desktop", "mobile"] as const;

export type Intent = (typeof INTENTS)[number];
export type Priority = (typeof PRIORITIES)[number];

export interface Keyword extends Stamps {
  _id: string;
  keyword: string;
  normalized: string;
  intent: Intent | null;
  volume: number | null;
  difficulty: number | null;
  cpc: number | null;
  competition: number | null;
  currentPosition: number | null;
  previousPosition: number | null;
  bestPosition: number | null;
  targetPosition: number | null;
  /** Site path the keyword should rank with. */
  targetUrl: string;
  /** Path Google actually ranks for it (latest position record). */
  rankingUrl: string | null;
  country: string;
  language: string;
  device: (typeof DEVICES)[number];
  engine: string;
  priority: Priority;
  status: (typeof KEYWORD_STATUSES)[number];
  type: (typeof KEYWORD_TYPES)[number];
  groupId: string | null;
  cluster: string;
  relatedKeywords: string[];
  assigneeId: string | null;
  lastCheckedAt: Date | null;
  positionSource: string | null;
  metricsSource: string;
  notes: string;
}

export interface KeywordGroup extends Stamps {
  _id: string;
  name: string;
  description: string;
  color: string;
}

export const normalizeKeyword = (k: string) => k.toLowerCase().replace(/\s+/g, " ").trim();
export const isLongTail = (k: string) => normalizeKeyword(k).split(" ").length >= 4;

let indexesEnsured = false;
export async function keywordsCol() {
  const c = await seoCollection<Keyword>(COLLECTIONS.keywords);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await c.createIndex({ normalized: 1, country: 1, device: 1, engine: 1, language: 1 }, { unique: true }).catch(() => {});
  }
  return c;
}

export async function groupsCol() {
  return seoCollection<KeywordGroup>(COLLECTIONS.keywordGroups);
}

const pick = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const pickOrNull = <T extends string>(v: unknown, list: readonly T[]): T | null => (list.includes(v as T) ? (v as T) : null);

export interface KeywordInput {
  keyword: string;
  intent?: string;
  volume?: unknown;
  difficulty?: unknown;
  cpc?: unknown;
  competition?: unknown;
  targetPosition?: unknown;
  targetUrl?: string;
  country?: string;
  language?: string;
  device?: string;
  engine?: string;
  priority?: string;
  status?: string;
  type?: string;
  groupId?: string;
  cluster?: string;
  relatedKeywords?: string | string[];
  assigneeId?: string;
  notes?: string;
  metricsSource?: string;
}

function toFields(input: KeywordInput, defaults: { country: string; language: string; device: string; engine: string }) {
  const keyword = str(input.keyword, 200).replace(/\s+/g, " ");
  if (!keyword) throw new SeoInputError("Keyword is required.");
  const target = str(input.targetUrl, 500);
  const targetUrl = target ? cleanPath(target.replace(/^https?:\/\/[^/]+/i, "") || "/") : "";
  if (target && !targetUrl) throw new SeoInputError(`Target URL "${target}" is not a site path.`);
  const related = Array.isArray(input.relatedKeywords) ? input.relatedKeywords : String(input.relatedKeywords ?? "").split(/[,;|]/);
  const competitionRaw = typeof input.competition === "string" ? input.competition.toLowerCase() : input.competition;
  const competition = competitionRaw === "low" ? 0.2 : competitionRaw === "medium" ? 0.5 : competitionRaw === "high" ? 0.85 : num(competitionRaw, 0, 1);
  return {
    keyword,
    normalized: normalizeKeyword(keyword),
    intent: pickOrNull(str(input.intent).toLowerCase(), INTENTS),
    volume: num(input.volume, 0, 1e9),
    difficulty: num(input.difficulty, 0, 100),
    cpc: num(input.cpc, 0, 1e6),
    competition,
    targetPosition: num(input.targetPosition, 1, 100),
    targetUrl: targetUrl ?? "",
    country: (str(input.country, 2) || defaults.country).toUpperCase(),
    language: (str(input.language, 5) || defaults.language).toLowerCase(),
    device: pick(str(input.device).toLowerCase(), DEVICES, defaults.device as (typeof DEVICES)[number]),
    engine: (str(input.engine, 30) || defaults.engine).toLowerCase(),
    priority: pick(str(input.priority).toLowerCase(), PRIORITIES, "medium"),
    status: pick(str(input.status).toLowerCase(), KEYWORD_STATUSES, "tracking"),
    type: pick(str(input.type).toLowerCase(), KEYWORD_TYPES, "primary"),
    groupId: str(input.groupId, 60) || null,
    cluster: str(input.cluster, 100),
    relatedKeywords: related.map((r) => r.trim()).filter(Boolean).slice(0, 30),
    assigneeId: str(input.assigneeId, 60) || null,
    notes: str(input.notes, 2000),
    metricsSource: str(input.metricsSource, 60) || "manual",
  };
}

export async function createKeyword(input: KeywordInput, defaults: Parameters<typeof toFields>[1], actorId: string): Promise<Keyword> {
  const c = await keywordsCol();
  const f = toFields(input, defaults);
  const dup = await c.findOne({ normalized: f.normalized, country: f.country, device: f.device, engine: f.engine, language: f.language });
  if (dup) throw new SeoInputError(`"${f.keyword}" is already tracked for ${f.country} / ${f.device}.`);
  const doc: Keyword = {
    _id: newId(),
    ...f,
    currentPosition: null,
    previousPosition: null,
    bestPosition: null,
    rankingUrl: null,
    lastCheckedAt: null,
    positionSource: null,
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  return doc;
}

export async function updateKeyword(id: string, input: KeywordInput, defaults: Parameters<typeof toFields>[1], actorId: string): Promise<{ before: Keyword; after: Keyword }> {
  const c = await keywordsCol();
  const before = await c.findOne({ _id: id });
  if (!before) throw new SeoInputError("Keyword not found.");
  const f = toFields(input, defaults);
  const dup = await c.findOne({ _id: { $ne: id }, normalized: f.normalized, country: f.country, device: f.device, engine: f.engine, language: f.language });
  if (dup) throw new SeoInputError(`"${f.keyword}" is already tracked for ${f.country} / ${f.device}.`);
  const set = { ...f, ...updateStamp(actorId) };
  await c.updateOne({ _id: id }, { $set: set });
  return { before, after: { ...before, ...set } };
}

export async function deleteKeyword(id: string): Promise<Keyword | null> {
  const c = await keywordsCol();
  const kw = await c.findOne({ _id: id });
  if (!kw) return null;
  await c.deleteOne({ _id: id });
  const hist = await seoCollection<{ _id: string; keywordId: string }>(COLLECTIONS.rankHistory);
  await hist.deleteMany({ keywordId: id });
  return kw;
}

export async function getKeyword(id: string): Promise<Keyword | null> {
  return (await keywordsCol()).findOne({ _id: id });
}

export interface KeywordListOptions {
  search?: string;
  status?: string;
  priority?: string;
  intent?: string;
  group?: string;
  device?: string;
  country?: string;
  type?: string;
  position?: string;
  longTail?: string;
  assignee?: string;
  url?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export function keywordFilter(o: KeywordListOptions): Filter<Keyword> {
  const f: Filter<Keyword> = {};
  if (o.search) {
    const rx = new RegExp(escapeRegex(o.search), "i");
    f.$or = [{ keyword: rx }, { cluster: rx }, { targetUrl: rx }];
  }
  if (o.status) f.status = o.status as Keyword["status"];
  else f.status = { $ne: "archived" };
  if (o.priority) f.priority = o.priority as Priority;
  if (o.intent) f.intent = o.intent as Intent;
  if (o.group === "none") f.groupId = null;
  else if (o.group) f.groupId = o.group;
  if (o.device) f.device = o.device as Keyword["device"];
  if (o.country) f.country = o.country.toUpperCase();
  if (o.type) f.type = o.type as Keyword["type"];
  if (o.assignee) f.assigneeId = o.assignee;
  if (o.url) f.$and = [{ $or: [{ targetUrl: o.url }, { rankingUrl: o.url }] }];
  const bucket: Record<string, Filter<Keyword>["currentPosition"]> = {
    top3: { $gte: 1, $lte: 3 },
    top10: { $gte: 1, $lte: 10 },
    top20: { $gte: 1, $lte: 20 },
    top50: { $gte: 1, $lte: 50 },
    top100: { $gte: 1, $lte: 100 },
    "4-10": { $gte: 4, $lte: 10 },
    "11-20": { $gte: 11, $lte: 20 },
    "21-50": { $gte: 21, $lte: 50 },
    "51-100": { $gte: 51, $lte: 100 },
    none: null,
  };
  if (o.position && o.position in bucket) f.currentPosition = bucket[o.position];
  return f;
}

export async function listKeywords(o: KeywordListOptions) {
  const c = await keywordsCol();
  const f = keywordFilter(o);
  const sortField: Record<string, string> = {
    keyword: "normalized",
    position: "currentPosition",
    change: "previousPosition",
    volume: "volume",
    difficulty: "difficulty",
    priority: "priority",
    updated: "updatedAt",
  };
  const sortBy = sortField[o.sortBy ?? ""] ?? "normalized";
  const dir = o.sortDir === "desc" ? -1 : 1;
  const page = Math.max(o.page ?? 1, 1);
  const pageSize = Math.min(Math.max(o.pageSize ?? 30, 1), 1000);
  let items = await c.find(f).sort({ [sortBy]: dir, normalized: 1 }).toArray();
  if (o.longTail === "yes") items = items.filter((k) => isLongTail(k.keyword));
  else if (o.longTail === "no") items = items.filter((k) => !isLongTail(k.keyword));
  if (sortBy === "currentPosition") {
    // Unranked keywords always sort last, whichever direction.
    items.sort((a, b) => (a.currentPosition === null ? 1 : b.currentPosition === null ? -1 : (a.currentPosition - b.currentPosition) * dir));
  }
  return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, totalPages: Math.max(Math.ceil(items.length / pageSize), 1) };
}

export async function allActiveKeywords(): Promise<Keyword[]> {
  return (await keywordsCol()).find({ status: "tracking" }).toArray();
}

export async function listGroups(): Promise<(KeywordGroup & { count: number })[]> {
  const [groups, counts] = await Promise.all([
    (await groupsCol()).find({}).sort({ name: 1 }).toArray(),
    (await keywordsCol()).aggregate<{ _id: string | null; n: number }>([{ $match: { status: { $ne: "archived" } } }, { $group: { _id: "$groupId", n: { $sum: 1 } } }]).toArray(),
  ]);
  const byId = new Map(counts.map((c) => [c._id, c.n]));
  return groups.map((g) => ({ ...g, count: byId.get(g._id) ?? 0 }));
}

export async function upsertGroup(id: string | null, input: { name: string; description?: string; color?: string }, actorId: string): Promise<KeywordGroup> {
  const name = str(input.name, 80);
  if (!name) throw new SeoInputError("Group name is required.");
  const color = /^#[0-9a-f]{6}$/i.test(input.color ?? "") ? (input.color as string) : "#6366f1";
  const c = await groupsCol();
  const clash = await c.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, "i"), ...(id ? { _id: { $ne: id } } : {}) });
  if (clash) throw new SeoInputError("A group with that name already exists.");
  if (id) {
    const before = await c.findOne({ _id: id });
    if (!before) throw new SeoInputError("Group not found.");
    const set = { name, description: str(input.description, 500), color, ...updateStamp(actorId) };
    await c.updateOne({ _id: id }, { $set: set });
    return { ...before, ...set };
  }
  const doc: KeywordGroup = { _id: newId(), name, description: str(input.description, 500), color, ...createStamp(actorId) };
  await c.insertOne(doc);
  return doc;
}

export async function deleteGroup(id: string): Promise<KeywordGroup | null> {
  const c = await groupsCol();
  const g = await c.findOne({ _id: id });
  if (!g) return null;
  await (await keywordsCol()).updateMany({ groupId: id }, { $set: { groupId: null } });
  await c.deleteOne({ _id: id });
  return g;
}

/**
 * CSV import. Columns (any order, header names flexible): keyword, intent,
 * volume, difficulty, cpc, competition, target_url, target_position, country,
 * language, device, engine, priority, type, group, cluster, related_keywords.
 * Existing keywords (same keyword/country/device/engine/language) are updated.
 */
export async function importKeywords(csv: string, defaults: Parameters<typeof toFields>[1], source: string, actorId: string) {
  const { rows } = parseCsv(csv, 5000);
  if (rows.length === 0) throw new SeoInputError("The file has no data rows.");
  if (!("keyword" in rows[0])) throw new SeoInputError('The file needs a "keyword" column.');
  const groups = await groupsCol();
  const groupByName = new Map((await groups.find({}).toArray()).map((g) => [g.name.toLowerCase(), g._id]));
  const c = await keywordsCol();
  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  for (const [i, r] of rows.entries()) {
    try {
      let groupId: string | undefined;
      const groupName = (r.group ?? r.keyword_group ?? "").trim();
      if (groupName) {
        groupId = groupByName.get(groupName.toLowerCase());
        if (!groupId) {
          const g = await upsertGroup(null, { name: groupName }, actorId);
          groupId = g._id;
          groupByName.set(groupName.toLowerCase(), groupId);
        }
      }
      const f = toFields(
        {
          keyword: r.keyword,
          intent: r.intent ?? r.search_intent,
          volume: r.volume ?? r.search_volume,
          difficulty: r.difficulty ?? r.kd ?? r.keyword_difficulty,
          cpc: r.cpc,
          competition: r.competition,
          targetUrl: r.target_url ?? r.url,
          targetPosition: r.target_position,
          country: r.country,
          language: r.language,
          device: r.device,
          engine: r.engine ?? r.search_engine,
          priority: r.priority,
          type: r.type,
          groupId,
          cluster: r.cluster,
          relatedKeywords: r.related_keywords ?? r.related,
          metricsSource: source,
        },
        defaults
      );
      const existing = await c.findOne({ normalized: f.normalized, country: f.country, device: f.device, engine: f.engine, language: f.language });
      if (existing) {
        // Only overwrite fields the file actually provides.
        const set: Record<string, unknown> = { ...updateStamp(actorId), metricsSource: source };
        for (const k of ["intent", "volume", "difficulty", "cpc", "competition", "targetPosition", "cluster", "groupId"] as const) {
          if (f[k] !== null && f[k] !== "" && f[k] !== undefined) set[k] = f[k];
        }
        if (f.targetUrl) set.targetUrl = f.targetUrl;
        if (f.relatedKeywords.length) set.relatedKeywords = f.relatedKeywords;
        await c.updateOne({ _id: existing._id }, { $set: set });
        updated++;
      } else {
        await c.insertOne({
          _id: newId(),
          ...f,
          currentPosition: null,
          previousPosition: null,
          bestPosition: null,
          rankingUrl: null,
          lastCheckedAt: null,
          positionSource: null,
          ...createStamp(actorId),
        });
        created++;
      }
    } catch (err) {
      if (errors.length < 20) errors.push(`Row ${i + 2}: ${err instanceof SeoInputError ? err.message : "could not be imported"}`);
    }
  }
  return { created, updated, failed: rows.length - created - updated, errors };
}

export interface CannibalizationCase {
  kind: "duplicate_target" | "shared_focus" | "search_split" | "wrong_page";
  keyword: string;
  urls: string[];
  detail: string;
}

/**
 * Keyword cannibalization: several of our pages competing for one query.
 * Four independent signals — the first two from product data, the third from
 * real Search Console rows, the fourth from recorded positions.
 */
export async function detectCannibalization(): Promise<CannibalizationCase[]> {
  const out: CannibalizationCase[] = [];
  const keywords = await (await keywordsCol()).find({ status: { $ne: "archived" } }).toArray();

  const byNorm = new Map<string, Keyword[]>();
  for (const k of keywords) byNorm.set(k.normalized, [...(byNorm.get(k.normalized) ?? []), k]);
  for (const [norm, list] of byNorm) {
    const urls = Array.from(new Set(list.map((k) => k.targetUrl).filter(Boolean)));
    if (urls.length > 1) out.push({ kind: "duplicate_target", keyword: norm, urls, detail: `Tracked ${list.length}× with different target URLs.` });
  }

  const pages = await seoCollection<{ _id: string; path: string; focusKeyword: string }>(COLLECTIONS.pages);
  const focus = await pages.find({ focusKeyword: { $gt: "" } }, { projection: { path: 1, focusKeyword: 1 } }).toArray();
  const byFocus = new Map<string, string[]>();
  for (const p of focus) {
    const n = normalizeKeyword(p.focusKeyword);
    byFocus.set(n, [...(byFocus.get(n) ?? []), p.path]);
  }
  for (const [kw, urls] of byFocus) if (urls.length > 1) out.push({ kind: "shared_focus", keyword: kw, urls, detail: `${urls.length} pages share this focus keyword.` });

  const rows = await seoCollection<{ _id: string; query: string; page: string; impressions: number; clicks: number; position: number }>(COLLECTIONS.searchRows);
  const tracked = new Set(keywords.map((k) => k.normalized));
  const split = await rows
    .aggregate<{ _id: string; pages: { page: string; impressions: number; position: number }[] }>([
      { $match: { impressions: { $gte: 10 } } },
      { $group: { _id: "$query", pages: { $push: { page: "$page", impressions: "$impressions", position: "$position" } } } },
      { $match: { "pages.1": { $exists: true } } },
      { $limit: 500 },
    ])
    .toArray();
  for (const s of split) {
    if (!tracked.has(normalizeKeyword(s._id)) && s.pages.length < 3) continue;
    const sorted = s.pages.sort((a, b) => b.impressions - a.impressions);
    out.push({
      kind: "search_split",
      keyword: s._id,
      urls: sorted.map((p) => p.page),
      detail: `Search Console: ${sorted.length} pages get impressions (${sorted.map((p) => `${p.impressions} @ #${p.position.toFixed(1)}`).join(", ")}).`,
    });
  }

  for (const k of keywords) {
    if (k.targetUrl && k.rankingUrl && k.rankingUrl !== k.targetUrl) {
      out.push({ kind: "wrong_page", keyword: k.keyword, urls: [k.targetUrl, k.rankingUrl], detail: `Target is ${k.targetUrl} but ${k.rankingUrl} is the page that ranks.` });
    }
  }
  return out;
}
