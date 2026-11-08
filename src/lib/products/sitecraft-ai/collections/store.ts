import { cmsEvents } from "@/lib/notify/triggers/cms";
import "server-only";
import { queueBroadcast } from "@/lib/webpush/send";
import { companyCache } from "@/lib/platform/tenancy/cache";
import { getDb } from "@/lib/mongodb";
import { CMS_SITE_TAG, expireSiteCache, updateStamp, createStamp, newId } from "@/lib/products/sitecraft-ai/db";
import { COLLECTIONS } from "./registry";
import type { CollectionKey, CollectionsSnapshot } from "./types";
import { ensureRecordPage, setPageArchived } from "@/lib/products/sitecraft-ai/record-pages";

/**
 * CMS collection records — the ONLY source of blog posts, jobs, engagement
 * models and products. ONE Mongo collection for every collection type
 * (`collection` field discriminates) — Atlas's collection-count limit, same
 * reasoning as theme history living on the theme doc.
 *
 * Public site (`getRecords`): published, non-archived records in `orderKey`
 * order. Drafts are never public. If the database is unreachable the read
 * throws, so Next.js keeps serving the last good render (no stale code copy).
 */
export interface CmsRecordDoc {
  _id: string;
  collection: CollectionKey;
  slug: string;
  draft: Record<string, unknown>;
  live: Record<string, unknown> | null;
  /** Hidden from the public site. */
  archived: boolean;
  hasUnpublishedChanges: boolean;
  publishedAt: Date | null;
  /** Display order within the collection (listings, "next post", …). */
  orderKey: number;
  history: { data: Record<string, unknown>; publishedAt: Date; publishedBy: string | null }[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const RECORDS = "cms_records";
const HISTORY_LIMIT = 10;
let indexesEnsured = false;

async function col() {
  const db = await getDb();
  const c = db.collection<CmsRecordDoc>(RECORDS);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await c.createIndex({ collection: 1, slug: 1 }, { unique: true }).catch(() => {});
  }
  return c;
}

const ORDER = { orderKey: 1, createdAt: 1 } as const;

// ── public read ──────────────────────────────────────────────────────────

async function loadPublished(key: CollectionKey): Promise<{ slug: string }[]> {
  const def = COLLECTIONS[key];
  const c = await col();
  const docs = await c.find({ collection: key, archived: { $ne: true }, live: { $ne: null } }, { projection: { slug: 1, live: 1 }, sort: ORDER }).toArray();
  return docs.map((d) => def.parse(d.live)).filter((r): r is { slug: string } => r !== null);
}

const cachedPublished = companyCache(loadPublished, ["cms-records-v2"], { tags: [CMS_SITE_TAG], revalidate: 3600 });

/** JSON-safe published records for one collection, in display order. */
export async function getRecords(key: CollectionKey): Promise<{ slug: string }[]> {
  const cached = await cachedPublished(key);
  // An empty list is re-read from the database: records written outside the CMS (an import) must show up at once instead
  // of after the cache expires. Non-empty lists stay cached.
  return cached.length > 0 ? cached : loadPublished(key);
}

/** Runtime objects (icons resolved) — the shape the components take. */
export async function getRuntimeRecords<T>(key: CollectionKey): Promise<T[]> {
  const def = COLLECTIONS[key];
  return (await getRecords(key)).map((r) => def.toRuntime(r) as T);
}

export async function getRuntimeRecord<T>(key: CollectionKey, slug: string): Promise<T | undefined> {
  return (await getRuntimeRecords<T>(key)).find((r) => (r as { slug: string }).slug === slug);
}

export async function getSnapshot(keys: CollectionKey[]): Promise<CollectionsSnapshot> {
  const entries = await Promise.all(keys.map(async (k) => [k, await getRecords(k)] as const));
  return Object.fromEntries(entries);
}

// ── admin ────────────────────────────────────────────────────────────────

export interface AdminRecordRow {
  slug: string;
  title: string;
  /** published = live on the site; draft = never published; archived = hidden. */
  state: "published" | "draft" | "archived";
  hasUnpublishedChanges: boolean;
  updatedAt: Date | null;
}

export async function listAdminRecords(key: CollectionKey): Promise<AdminRecordRow[]> {
  const def = COLLECTIONS[key];
  const c = await col();
  const docs = await c.find({ collection: key }, { sort: ORDER }).toArray();
  return docs.map((doc) => {
    const shown = def.parse(doc.draft);
    return {
      slug: doc.slug,
      title: shown ? def.titleOf(shown) : doc.slug,
      state: doc.archived ? "archived" : doc.live ? "published" : "draft",
      hasUnpublishedChanges: doc.hasUnpublishedChanges,
      updatedAt: doc.updatedAt,
    };
  });
}

/** The record as the editor shows it (its draft). */
export async function getEditableRecord(key: CollectionKey, slug: string): Promise<{ data: Record<string, unknown>; doc: CmsRecordDoc } | null> {
  const c = await col();
  const doc = await c.findOne({ collection: key, slug });
  return doc ? { data: doc.draft, doc } : null;
}

async function nextOrderKey(key: CollectionKey): Promise<number> {
  const c = await col();
  const last = await c.find({ collection: key }, { sort: { orderKey: -1 }, limit: 1, projection: { orderKey: 1 } }).toArray();
  return (last[0]?.orderKey ?? 0) + 1024;
}

export async function saveRecordDraft(key: CollectionKey, slug: string, raw: unknown, actorId: string, orderKey?: number): Promise<Result> {
  const def = COLLECTIONS[key];
  const parsed = def.parse({ ...(raw as object), slug });
  if (!parsed) return { ok: false, error: "This record is missing required fields (a title/name and a slug)." };
  const c = await col();
  const existing = await c.findOne({ collection: key, slug });
  const hasUnpublishedChanges = !existing?.live || JSON.stringify(existing.live) !== JSON.stringify(parsed);
  if (existing) {
    await c.updateOne({ _id: existing._id }, { $set: { draft: parsed as Record<string, unknown>, hasUnpublishedChanges, ...updateStamp(actorId) } });
  } else {
    await c.insertOne({
      _id: newId(), collection: key, slug, draft: parsed as Record<string, unknown>, live: null, archived: false,
      hasUnpublishedChanges: true, publishedAt: null, orderKey: orderKey ?? (await nextOrderKey(key)), history: [], ...createStamp(actorId),
    });
  }
  return { ok: true };
}

function withInit(blank: Record<string, unknown>, init?: Record<string, unknown>): Record<string, unknown> {
  if (!init) return blank;
  const out = { ...blank };
  for (const [k, v] of Object.entries(init)) if (k in blank && typeof v === typeof blank[k]) out[k] = v;
  return out;
}

/** `init` pre-fills fields the collection's blank record already has (e.g. `title` from the dashboard's Quick Draft). */
export async function createRecord(key: CollectionKey, rawSlug: string, actorId: string, init?: Record<string, unknown>): Promise<Result<{ slug: string }>> {
  const def = COLLECTIONS[key];
  const slug = rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return { ok: false, error: "Choose a slug (letters, numbers and dashes)." };
  const c = await col();
  if (await c.findOne({ collection: key, slug })) return { ok: false, error: "A record with this slug already exists." };
  await c.insertOne({
    _id: newId(), collection: key, slug, draft: withInit(def.blank(slug) as Record<string, unknown>, init), live: null, archived: false,
    hasUnpublishedChanges: true, publishedAt: null, orderKey: await nextOrderKey(key), history: [], ...createStamp(actorId),
  });
  return { ok: true, slug };
}

/**
 * Publishes the record's draft. A record with its own page (blog post, job,
 * engagement model) that has no CMS page yet gets one, published with it, so
 * a new record is live immediately — see `ensureRecordPage`.
 */
export async function publishRecord(key: CollectionKey, slug: string, actorId: string): Promise<Result<{ pageCreated?: boolean }>> {
  const def = COLLECTIONS[key];
  const c = await col();
  const doc = await c.findOne({ collection: key, slug });
  if (!doc) return { ok: false, error: "Nothing to publish — save a draft first." };
  const parsed = def.parse(doc.draft);
  if (!parsed) return { ok: false, error: "The draft is missing required fields." };
  const now = new Date();
  const update: Record<string, unknown> = { live: parsed, hasUnpublishedChanges: false, publishedAt: now, ...updateStamp(actorId) };
  await c.updateOne(
    { _id: doc._id },
    {
      $set: update,
      ...(doc.live ? { $push: { history: { $each: [{ data: doc.live, publishedAt: doc.publishedAt ?? now, publishedBy: doc.updatedBy }], $slice: -HISTORY_LIMIT } } } : {}),
    }
  );
  const pageCreated = def.pathOf ? await ensureRecordPage(key, slug, def.titleOf(parsed), actorId) : false;
  expireSiteCache();
  // A blog post going live for the first time: tell the visitors who subscribed to news (no-op when website push is off).
  if (key === "blog" && !doc.live) await queueBroadcast({ topic: "updates", title: `New: ${def.titleOf(parsed)}`, body: "A new post was just published. Tap to read it.", url: def.pathOf ? def.pathOf(slug) : `/blog/${slug}`, trigger: "post" });
  await cmsEvents.recordPublished(def.singular, def.titleOf(parsed), slug, key, actorId);
  return { ok: true, pageCreated };
}

/** Archiving hides the record and its page; restoring shows both again. */
export async function setRecordArchived(key: CollectionKey, slug: string, archived: boolean, actorId: string): Promise<Result> {
  const def = COLLECTIONS[key];
  const c = await col();
  const doc = await c.findOne({ collection: key, slug });
  if (!doc) return { ok: false, error: "Record not found." };
  await c.updateOne({ _id: doc._id }, { $set: { archived, ...updateStamp(actorId) } });
  if (def.pathOf) await setPageArchived(def.pathOf(slug), archived, actorId);
  expireSiteCache();
  return { ok: true };
}

/** Discards unpublished edits (back to the live version), or deletes a record that was never published. */
export async function revertRecord(key: CollectionKey, slug: string): Promise<Result<{ deleted: boolean }>> {
  const c = await col();
  const doc = await c.findOne({ collection: key, slug });
  if (!doc) return { ok: false, error: "Record not found." };
  if (doc.live) {
    await c.updateOne({ _id: doc._id }, { $set: { draft: doc.live, hasUnpublishedChanges: false } });
    return { ok: true, deleted: false };
  }
  await c.deleteOne({ _id: doc._id });
  expireSiteCache();
  return { ok: true, deleted: true };
}
