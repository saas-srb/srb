import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import { smmsCollection, createStamp, notDeleted } from "@/lib/products/viralpulse-ai/db";
import type {
  BrochureDoc,
  BrochureLeadDoc,
  BrochureEventDoc,
  BrochureSection,
  BrochureTheme,
  BrochureStatus,
  BrochureCategory,
  DEFAULT_THEME,
} from "./types";
import { BROCHURE_CATEGORIES, BROCHURE_SECTION_TYPES } from "./types";

export const BROCHURE_COLLECTIONS = {
  brochures: "smms_brochures",
  leads: "smms_brochure_leads",
  events: "smms_brochure_events",
} as const;

// ── Index management ────────────────────────────────────────────────────────

let indexed = false;

export async function brochuresCollection() {
  const col = await smmsCollection<BrochureDoc>(BROCHURE_COLLECTIONS.brochures);
  if (!indexed) {
    indexed = true;
    await col.createIndex({ slug: 1 }, { unique: true, sparse: true }).catch(() => {});
    await col.createIndex({ status: 1, updatedAt: -1 }).catch(() => {});
    await col.createIndex({ category: 1 }).catch(() => {});
    await col.createIndex({ createdAt: -1 }).catch(() => {});
    await col.createIndex({ deletedAt: 1 }).catch(() => {});
  }
  return col;
}

export async function brochureLeadsCollection() {
  const db = await getDb();
  const col = db.collection<BrochureLeadDoc>(BROCHURE_COLLECTIONS.leads);
  await col.createIndex({ brochureId: 1, submittedAt: -1 }).catch(() => {});
  return col;
}

export async function brochureEventsCollection() {
  const db = await getDb();
  const col = db.collection<BrochureEventDoc>(BROCHURE_COLLECTIONS.events);
  await col.createIndex({ brochureId: 1, at: -1 }).catch(() => {});
  await col.createIndex({ at: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 365 }).catch(() => {}); // TTL 1 year
  return col;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "brochure";
}

export async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  const col = await brochuresCollection();
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const existing = await col.findOne({ slug: candidate, ...notDeleted, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!existing) return candidate;
    attempt++;
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateBrochureInput {
  title: string;
  category: BrochureCategory;
  customCategory?: string | null;
  sections: BrochureSection[];
  theme: BrochureTheme;
  meta: BrochureDoc["meta"];
}

export async function createBrochure(input: CreateBrochureInput, actorId: string): Promise<BrochureDoc> {
  const col = await brochuresCollection();
  const id = randomUUID();
  const slug = await uniqueSlug(input.title);
  const stamp = createStamp(actorId);
  const doc: BrochureDoc = {
    _id: id,
    title: input.title.slice(0, 200),
    slug,
    category: input.category,
    customCategory: input.customCategory ?? null,
    status: "draft",
    sections: input.sections,
    theme: input.theme,
    meta: input.meta,
    analytics: { views: 0, ctaClicks: 0, formSubmissions: 0, lastViewedAt: null },
    publishedAt: null,
    ...stamp,
  };
  await col.insertOne(doc as never);
  return doc;
}

export async function getBrochure(id: string): Promise<BrochureDoc | null> {
  if (!id) return null;
  return (await brochuresCollection()).findOne({ _id: id, ...notDeleted });
}

export async function getBrochureBySlug(slug: string): Promise<BrochureDoc | null> {
  if (!slug) return null;
  return (await brochuresCollection()).findOne({ slug, status: "published", ...notDeleted });
}

export async function requireBrochure(id: string): Promise<BrochureDoc> {
  const b = await getBrochure(id);
  if (!b) throw new Error("Not found");
  return b;
}

export async function listBrochures(opts: {
  q?: string;
  category?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ items: BrochureDoc[]; total: number; totalPages: number }> {
  const col = await brochuresCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.q?.trim()) {
    const esc = opts.q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.title = { $regex: esc, $options: "i" };
  }
  if (opts.category && (BROCHURE_CATEGORIES as readonly string[]).includes(opts.category)) {
    filter.category = opts.category;
  }
  if (opts.status === "draft" || opts.status === "published") {
    filter.status = opts.status;
  }
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, opts.pageSize ?? 20));
  const skip = (page - 1) * pageSize;
  const [items, total] = await Promise.all([
    col.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
    col.countDocuments(filter),
  ]);
  return { items, total, totalPages: Math.ceil(total / pageSize) };
}

export async function updateBrochure(
  id: string,
  patch: Partial<Pick<BrochureDoc, "title" | "sections" | "theme" | "meta" | "customCategory">>,
  actorId: string
): Promise<void> {
  const col = await brochuresCollection();
  const set: Record<string, unknown> = { updatedAt: new Date(), updatedBy: actorId };
  if (patch.title !== undefined) set.title = patch.title.slice(0, 200);
  if (patch.sections !== undefined) set.sections = patch.sections;
  if (patch.theme !== undefined) set.theme = patch.theme;
  if (patch.meta !== undefined) set.meta = patch.meta;
  if (patch.customCategory !== undefined) set.customCategory = patch.customCategory;
  await col.updateOne({ _id: id }, { $set: set });
}

export async function publishBrochure(id: string, actorId: string): Promise<void> {
  const col = await brochuresCollection();
  const now = new Date();
  await col.updateOne({ _id: id }, { $set: { status: "published", publishedAt: now, updatedAt: now, updatedBy: actorId } });
}

export async function unpublishBrochure(id: string, actorId: string): Promise<void> {
  const col = await brochuresCollection();
  const now = new Date();
  await col.updateOne({ _id: id }, { $set: { status: "draft", updatedAt: now, updatedBy: actorId } });
}

export async function softDeleteBrochure(id: string, actorId: string): Promise<void> {
  const col = await brochuresCollection();
  await col.updateOne({ _id: id }, { $set: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actorId } });
}

export async function duplicateBrochure(source: BrochureDoc, actorId: string): Promise<BrochureDoc> {
  return createBrochure(
    {
      title: `Copy of ${source.title}`,
      category: source.category,
      customCategory: source.customCategory,
      sections: JSON.parse(JSON.stringify(source.sections)), // deep clone
      theme: { ...source.theme },
      meta: { ...source.meta },
    },
    actorId
  );
}

// ── Slug rename ──────────────────────────────────────────────────────────────

export async function renameBrochureSlug(id: string, newTitle: string, actorId: string): Promise<string> {
  const slug = await uniqueSlug(newTitle, id);
  const col = await brochuresCollection();
  await col.updateOne({ _id: id }, { $set: { slug, updatedAt: new Date(), updatedBy: actorId } });
  return slug;
}

// ── Analytics ────────────────────────────────────────────────────────────────

export async function recordBrochureView(brochureId: string, opts: { referrer?: string; country?: string; device?: string; ip?: string }): Promise<void> {
  const [col, eventsCol] = await Promise.all([brochuresCollection(), brochureEventsCollection()]);
  const now = new Date();
  await Promise.all([
    col.updateOne({ _id: brochureId }, { $inc: { "analytics.views": 1 }, $set: { "analytics.lastViewedAt": now } }),
    eventsCol.insertOne({
      _id: randomUUID(),
      brochureId,
      type: "view",
      section: null,
      referrer: opts.referrer ?? null,
      country: opts.country ?? null,
      device: (["desktop", "tablet", "mobile"].includes(opts.device ?? "") ? opts.device : null) as BrochureEventDoc["device"],
      at: now,
    }),
  ]);
}

export async function recordBrochureCta(brochureId: string, section: string): Promise<void> {
  const [col, eventsCol] = await Promise.all([brochuresCollection(), brochureEventsCollection()]);
  await Promise.all([
    col.updateOne({ _id: brochureId }, { $inc: { "analytics.ctaClicks": 1 } }),
    eventsCol.insertOne({ _id: randomUUID(), brochureId, type: "cta_click", section, referrer: null, country: null, device: null, at: new Date() }),
  ]);
}

export async function recordBrochureFormSubmit(
  brochureId: string,
  brochureTitle: string,
  fields: Record<string, string>,
  meta: { ip?: string; userAgent?: string }
): Promise<void> {
  const [col, leadsCol, eventsCol] = await Promise.all([brochuresCollection(), brochureLeadsCollection(), brochureEventsCollection()]);
  const now = new Date();
  await Promise.all([
    col.updateOne({ _id: brochureId }, { $inc: { "analytics.formSubmissions": 1 } }),
    leadsCol.insertOne({ _id: randomUUID(), brochureId, brochureTitle, fields, submittedAt: now, ip: meta.ip ?? null, userAgent: meta.userAgent ?? null }),
    eventsCol.insertOne({ _id: randomUUID(), brochureId, type: "form_submit", section: "contact", referrer: null, country: null, device: null, at: now }),
  ]);
}

export async function listBrochureLeads(brochureId: string, limit = 100): Promise<BrochureLeadDoc[]> {
  const col = await brochureLeadsCollection();
  return col.find({ brochureId }).sort({ submittedAt: -1 }).limit(limit).toArray();
}

export async function brochureAnalyticsSummary(brochureId: string): Promise<{
  views: number;
  ctaClicks: number;
  formSubmissions: number;
  recentEvents: { type: string; at: string }[];
}> {
  const [brocCol, eventsCol] = await Promise.all([brochuresCollection(), brochureEventsCollection()]);
  const [broc, recentEvents] = await Promise.all([
    brocCol.findOne({ _id: brochureId }, { projection: { analytics: 1 } }),
    eventsCol.find({ brochureId }).sort({ at: -1 }).limit(20).toArray(),
  ]);
  return {
    views: broc?.analytics.views ?? 0,
    ctaClicks: broc?.analytics.ctaClicks ?? 0,
    formSubmissions: broc?.analytics.formSubmissions ?? 0,
    recentEvents: recentEvents.map((e) => ({ type: e.type, at: e.at.toISOString() })),
  };
}
