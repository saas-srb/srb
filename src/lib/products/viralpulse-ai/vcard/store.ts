import "server-only";
import { randomUUID } from "node:crypto";
import { smmsCollection, createStamp, notDeleted } from "@/lib/products/viralpulse-ai/db";
import type {
  VCardDoc,
  VCardSection,
  VCardStyle,
  VCardContact,
  VCardBranding,
  VCardLayout,
  VCardColorScheme,
} from "./types";
import { DEFAULT_VCARD_STYLE } from "./types";

export const VCARD_COLLECTION = "smms_vcards";

// ── Index management ──────────────────────────────────────────────────────────

let indexed = false;

export async function vcardsCollection() {
  const col = await smmsCollection<VCardDoc>(VCARD_COLLECTION);
  if (!indexed) {
    indexed = true;
    await col.createIndex({ slug: 1 }, { unique: true, sparse: true }).catch(() => {});
    await col.createIndex({ status: 1, updatedAt: -1 }).catch(() => {});
    await col.createIndex({ createdAt: -1 }).catch(() => {});
    await col.createIndex({ deletedAt: 1 }).catch(() => {});
  }
  return col;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "card"
  );
}

export async function uniqueVCardSlug(base: string, excludeId?: string): Promise<string> {
  const col = await vcardsCollection();
  let slug = slugify(base);
  let attempt = 0;
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`;
    const existing = await col.findOne({ slug: candidate, ...notDeleted, ...(excludeId ? { _id: { $ne: excludeId } } : {}) });
    if (!existing) return candidate;
    attempt++;
  }
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export interface CreateVCardInput {
  title: string;
  name: string;
  jobTitle: string;
  company: string;
  bio?: string;
  layout: VCardLayout;
  colorScheme: VCardColorScheme;
  style: VCardStyle;
  contact: VCardContact;
  branding: VCardBranding;
  sections: VCardSection[];
  meta?: { description?: string; keywords?: string };
}

export async function createVCard(
  data: CreateVCardInput,
  actorId: string
): Promise<VCardDoc> {
  const col = await vcardsCollection();
  const id = randomUUID();
  const slug = await uniqueVCardSlug(data.name || data.title);
  const stamp = createStamp(actorId);
  const doc: VCardDoc = {
    _id: id,
    title: data.title,
    slug,
    name: data.name,
    jobTitle: data.jobTitle,
    company: data.company,
    bio: data.bio || "",
    layout: data.layout || "classic",
    colorScheme: data.colorScheme || "professional-blue",
    style: data.style || DEFAULT_VCARD_STYLE,
    contact: data.contact || {},
    branding: data.branding || {},
    sections: data.sections || [],
    status: "draft",
    analytics: { views: 0, ctaClicks: 0, shares: 0, lastViewedAt: null },
    meta: data.meta || {},
    publishedAt: null,
    ...stamp,
  };
  await col.insertOne(doc as never);
  return doc;
}

export async function getVCardById(id: string): Promise<VCardDoc | null> {
  const col = await vcardsCollection();
  return col.findOne({ _id: id, ...notDeleted });
}

export async function getVCard(slug: string): Promise<VCardDoc | null> {
  const col = await vcardsCollection();
  return col.findOne({ slug, status: "published", ...notDeleted });
}

export async function requireVCard(id: string): Promise<VCardDoc> {
  const card = await getVCardById(id);
  if (!card) throw new Error("Visiting card not found.");
  return card;
}

export interface ListVCardsOpts {
  status?: "draft" | "published" | "all";
  limit?: number;
  skip?: number;
}

export async function listVCards(
  opts: ListVCardsOpts = {}
): Promise<VCardDoc[]> {
  const col = await vcardsCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.status && opts.status !== "all") filter.status = opts.status;
  return col
    .find(filter)
    .sort({ updatedAt: -1 })
    .skip(opts.skip ?? 0)
    .limit(opts.limit ?? 100)
    .toArray();
}

export async function updateVCard(
  id: string,
  patch: Partial<Omit<VCardDoc, "_id" | "createdAt" | "createdBy">>,
  actorId?: string
): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne(
    { _id: id, ...notDeleted },
    { $set: { ...patch, updatedAt: new Date(), ...(actorId ? { updatedBy: actorId } : {}) } }
  );
}

export async function publishVCard(id: string, actorId?: string): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "published", publishedAt: new Date(), updatedAt: new Date(), ...(actorId ? { updatedBy: actorId } : {}) } }
  );
}

export async function unpublishVCard(id: string, actorId?: string): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "draft", updatedAt: new Date(), ...(actorId ? { updatedBy: actorId } : {}) } }
  );
}

export async function softDeleteVCard(id: string, actorId?: string): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), status: "draft", updatedAt: new Date(), ...(actorId ? { updatedBy: actorId } : {}) } }
  );
}

export async function duplicateVCard(id: string, actorId: string): Promise<VCardDoc> {
  const original = await requireVCard(id);
  const col = await vcardsCollection();
  const newId = randomUUID();
  const newSlug = await uniqueVCardSlug(`${original.name}-copy`);
  const stamp = createStamp(actorId);
  const doc: VCardDoc = {
    ...original,
    _id: newId,
    slug: newSlug,
    title: `${original.title} (Copy)`,
    status: "draft",
    analytics: { views: 0, ctaClicks: 0, shares: 0, lastViewedAt: null },
    publishedAt: null,
    ...stamp,
  };
  await col.insertOne(doc as never);
  return doc;
}

// ── Public analytics (no tenantId required) ──────────────────────────────────

export async function incrementVCardView(slug: string): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne(
    { slug, status: "published" },
    { $inc: { "analytics.views": 1 }, $set: { "analytics.lastViewedAt": new Date() } }
  );
}

export async function incrementVCardCtaClick(id: string): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne({ _id: id }, { $inc: { "analytics.ctaClicks": 1 } });
}

export async function incrementVCardShare(id: string): Promise<void> {
  const col = await vcardsCollection();
  await col.updateOne({ _id: id }, { $inc: { "analytics.shares": 1 } });
}
