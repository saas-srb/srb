import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, smmsCollection, createStamp, notDeleted, newId, str, strList, type Stamps } from "@/lib/products/viralpulse-ai/db";
import { cleanSettings, DEFAULT_IMAGE_SETTINGS, istDayStart, type ImageSettings } from "@/lib/products/viralpulse-ai/images/limits";
import { EMPTY_KIT, LOGO_PLACEMENTS, type BrandKit, type Brief, type ExportRecord, type ProjectStatus, type Variant } from "@/lib/products/viralpulse-ai/images/types";
import { isHex, normHex } from "@/lib/products/viralpulse-ai/images/color";

/** Image Studio persistence. Collections live in the company's own database (like every smms_* collection). */

export const IMAGE_COLLECTIONS = { projects: "smms_image_projects", jobs: "smms_image_jobs" } as const;

export interface PendingApproval {
  by: string;
  email: string | null;
  at: Date;
  estimateUsd: number;
  kind: "generate" | "edit";
  request: Record<string, unknown>;
}

export interface ProjectDoc extends Stamps {
  _id: string;
  brief: Brief;
  status: ProjectStatus;
  variants: Variant[];
  chosenIds: string[];
  exports: ExportRecord[];
  pendingApproval: PendingApproval | null;
  totalCostUsd: number;
  error: string | null;
  ackFlags: string[];
  progress?: { total: number; done: number };
}

/** One row per generation request: the ledger the rate limit and the daily spend cap count over. */
export interface JobDoc {
  _id: string;
  userId: string;
  projectId: string;
  images: number;
  estimateUsd: number;
  /** Actual spend once the call finished (the estimate while it runs). */
  costUsd: number;
  status: "running" | "done" | "failed";
  provider: string;
  model: string;
  at: Date;
}

let ensured = false;
export async function projectsCollection() {
  const col = await smmsCollection<ProjectDoc>(IMAGE_COLLECTIONS.projects);
  if (!ensured) {
    ensured = true;
    await col.createIndex({ deletedAt: 1, updatedAt: -1 }).catch(() => {});
    await (await smmsCollection<JobDoc>(IMAGE_COLLECTIONS.jobs)).createIndex({ at: -1 }).catch(() => {});
    await (await smmsCollection<JobDoc>(IMAGE_COLLECTIONS.jobs)).createIndex({ userId: 1, at: -1 }).catch(() => {});
  }
  return col;
}
export const jobsCollection = async () => {
  await projectsCollection();
  return smmsCollection<JobDoc>(IMAGE_COLLECTIONS.jobs);
};

export async function getProject(id: string): Promise<ProjectDoc | null> {
  if (!id) return null;
  return (await projectsCollection()).findOne({ _id: id, ...notDeleted });
}

export async function listProjects(limit = 30): Promise<ProjectDoc[]> {
  return (await projectsCollection()).find(notDeleted).sort({ updatedAt: -1 }).limit(limit).toArray();
}

/** Counts per status and this month's image count and spend: the list page's stat cards. */
export async function projectOverview(now: Date): Promise<{ total: number; counts: Partial<Record<ProjectStatus, number>>; imagesMonth: number; spendMonthUsd: number }> {
  const col = await projectsCollection();
  const rows = await col.aggregate<{ _id: ProjectStatus; n: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray();
  const counts: Partial<Record<ProjectStatus, number>> = {};
  for (const r of rows) counts[r._id] = r.n;
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const jobs = await (await jobsCollection()).find({ at: { $gte: monthStart }, status: { $ne: "failed" } }, { projection: { images: 1, costUsd: 1 } }).toArray();
  return { total: rows.reduce((a, r) => a + r.n, 0), counts, imagesMonth: jobs.reduce((a, j) => a + j.images, 0), spendMonthUsd: Math.round(jobs.reduce((a, j) => a + j.costUsd, 0) * 1e6) / 1e6 };
}

export async function insertProject(brief: Brief, actorId: string): Promise<ProjectDoc> {
  const doc: ProjectDoc = { _id: newId(), brief, status: "draft", variants: [], chosenIds: [], exports: [], pendingApproval: null, totalCostUsd: 0, error: null, ackFlags: [], progress: { total: 0, done: 0 }, ...createStamp(actorId) };
  await (await projectsCollection()).insertOne(doc);
  return doc;
}

// ── settings ────────────────────────────────────────────────────────────────

export async function getImageSettings(): Promise<ImageSettings> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string; images?: Partial<ImageSettings> }>(COLLECTIONS.settings).findOne({ _id: "main" });
  return { ...DEFAULT_IMAGE_SETTINGS, ...(doc?.images ?? {}) };
}

export async function saveImageSettings(patch: Partial<ImageSettings>, actorId: string): Promise<ImageSettings> {
  const next = cleanSettings(patch, await getImageSettings());
  const db = await getDb();
  await db.collection(COLLECTIONS.settings).updateOne({ _id: "main" } as never, { $set: { images: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  return next;
}

// ── brand kit ───────────────────────────────────────────────────────────────

export async function getBrandKit(): Promise<BrandKit> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string; imageKit?: Partial<BrandKit> }>(COLLECTIONS.settings).findOne({ _id: "main" });
  return cleanKit(doc?.imageKit ?? {}, EMPTY_KIT);
}

export function cleanKit(input: Partial<BrandKit> & Record<string, unknown>, cur: BrandKit): BrandKit {
  const col = (v: unknown, d: string) => (typeof v === "string" && v.trim() === "" ? "" : typeof v === "string" && isHex(v) ? normHex(v) : d);
  const c = (input.colours ?? {}) as Record<string, unknown>;
  const scale = Number(input.logoScale);
  return {
    logoMediaId: input.logoMediaId === null ? null : typeof input.logoMediaId === "string" && input.logoMediaId.length <= 64 ? input.logoMediaId : cur.logoMediaId,
    logoPlacement: LOGO_PLACEMENTS.some((p) => p.value === input.logoPlacement) ? (input.logoPlacement as BrandKit["logoPlacement"]) : cur.logoPlacement,
    logoScale: Number.isFinite(scale) ? Math.min(0.4, Math.max(0.05, scale)) : cur.logoScale,
    applyLogo: input.applyLogo === undefined ? cur.applyLogo : !!input.applyLogo,
    colours: { primary: col(c.primary, cur.colours.primary), secondary: col(c.secondary, cur.colours.secondary), accent: col(c.accent, cur.colours.accent), text: col(c.text, cur.colours.text) },
    fontWeight: input.fontWeight === "regular" ? "regular" : input.fontWeight === "bold" ? "bold" : cur.fontWeight,
    voice: input.voice === undefined ? cur.voice : str(input.voice, 600),
    dos: input.dos === undefined ? cur.dos : strList(input.dos, 12, 160),
    donts: input.donts === undefined ? cur.donts : strList(input.donts, 12, 160),
    defaultCta: input.defaultCta === undefined ? cur.defaultCta : str(input.defaultCta, 60),
  };
}

export async function saveBrandKit(patch: Partial<BrandKit>, actorId: string): Promise<BrandKit> {
  const next = cleanKit(patch as never, await getBrandKit());
  const db = await getDb();
  await db.collection(COLLECTIONS.settings).updateOne({ _id: "main" } as never, { $set: { imageKit: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  return next;
}

// ── ledger ──────────────────────────────────────────────────────────────────

export async function recentImagesByUser(userId: string, now: Date): Promise<number> {
  const rows = await (await jobsCollection()).find({ userId, at: { $gte: new Date(now.getTime() - 60_000) }, status: { $ne: "failed" } }, { projection: { images: 1 } }).toArray();
  return rows.reduce((a, r) => a + r.images, 0);
}

export async function spentToday(now: Date): Promise<number> {
  const rows = await (await jobsCollection()).find({ at: { $gte: istDayStart(now) }, status: { $ne: "failed" } }, { projection: { costUsd: 1 } }).toArray();
  return Math.round(rows.reduce((a, r) => a + r.costUsd, 0) * 1e6) / 1e6;
}
