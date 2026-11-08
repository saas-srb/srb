import "server-only";
import { COLLECTIONS, smmsCollection, newId, createStamp, updateStamp, notDeleted, str, escapeRegex, dateOrNull, type Stamps } from "@/lib/products/viralpulse-ai/db";
import { isPostPlatform, type PostPlatform, type ContentStatus } from "@/lib/products/viralpulse-ai/constants";
import { EMPTY_CREATIVE, EMPTY_VARIANT, normalizeCreative, normalizeVariant, type PostCreative, type PostVariantContent } from "@/lib/products/viralpulse-ai/content";
import { SmmsInputError, NotFoundError } from "@/lib/products/viralpulse-ai/viewer";
import type { PublishOptions } from "@/lib/products/viralpulse-ai/publishers/types";
import type { PostWizardMeta } from "@/lib/products/viralpulse-ai/post-wizard/helpers";

/**
 * A social media post: one idea, adapted into a separate version (variant) per
 * selected platform. Each variant carries its own publish result and its own
 * performance numbers. Publishing is always an explicit user action (or an
 * approved schedule — see `publishing.ts`).
 */

export type PublishState = "pending" | "published" | "failed";

export interface VariantPublish {
  state: PublishState;
  method: "api" | "manual" | null;
  externalId: string | null;
  url: string | null;
  error: string | null;
  at: Date | null;
  by: string | null;
}

export interface PostMetrics {
  impressions: number;
  reach: number;
  clicks: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
  conversions: number;
  updatedAt: Date;
  updatedBy: string | null;
}

export const METRIC_KEYS = ["impressions", "reach", "clicks", "engagements", "likes", "comments", "shares", "saves", "videoViews", "conversions"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export interface PostVariant extends PostVariantContent {
  platform: PostPlatform;
  publish: VariantPublish;
  metrics: PostMetrics | null;
}

export interface PostBrief {
  title: string;
  topic: string;
  serviceProduct: string;
  audience: string;
  tone: string;
  language: string;
  objective: string;
  contentType: "image" | "video";
  platforms: PostPlatform[];
  /** Landing URL for link posts / CTA buttons. */
  link: string | null;
  /** Intended publish time from the brief — pre-fills scheduling; never schedules by itself. */
  plannedAt: Date | null;
  /** Optional campaign this organic post supports. */
  campaignId: string | null;
  offerId: string | null;
  clientId: string | null;
  notes: string;
}

export interface PostDoc extends PostBrief, Stamps {
  _id: string;
  status: ContentStatus;
  idea: string;
  creative: PostCreative;
  variants: PostVariant[];
  mediaIds: string[];
  thumbnailId: string | null;
  scheduledAt: Date | null;
  scheduledBy: string | null;
  /** Set by someone with PUBLISH_CONTENT — only approved schedules publish automatically. */
  approvedBy: string | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  archivedFrom: ContentStatus | null;
  /** IANA zone the schedule was entered in - display only; `scheduledAt` is the UTC instant. */
  scheduledTz?: string | null;
  /** Set by the 5-minute job when the schedule was handed to the publish engine; cleared on reschedule/cancel. */
  publishQueuedAt?: Date | null;
  /** Per-platform publishing choices (YouTube privacy, Instagram format, accounts ...). */
  publishOptions?: PublishOptions;
  /** Wizard-only choices (last step, content type per platform, key message, UTM...). Absent on posts made before the wizard: they open with defaults. */
  wizard?: PostWizardMeta;
}

let indexesEnsured = false;
export async function postsCollection() {
  const col = await smmsCollection<PostDoc>(COLLECTIONS.posts);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      col.createIndex({ deletedAt: 1, updatedAt: -1 }).catch(() => {}),
      col.createIndex({ status: 1, scheduledAt: 1 }).catch(() => {}),
      col.createIndex({ status: 1, publishQueuedAt: 1, scheduledAt: 1 }).catch(() => {}),
      col.createIndex({ campaignId: 1 }).catch(() => {}),
    ]);
  }
  return col;
}

export const EMPTY_PUBLISH: VariantPublish = { state: "pending", method: null, externalId: null, url: null, error: null, at: null, by: null };

export function parsePostBrief(input: Record<string, unknown>): PostBrief {
  const platforms = [...new Set((Array.isArray(input.platforms) ? input.platforms : []).filter(isPostPlatform))];
  if (platforms.length === 0) throw new SmmsInputError("Choose at least one platform.");
  const topic = str(input.topic, 500);
  if (!topic) throw new SmmsInputError("Describe the topic of the post.");
  const link = str(input.link, 500);
  if (link && !/^https?:\/\/\S+$/i.test(link)) throw new SmmsInputError("The link must be a full http(s) URL.");
  return {
    title: str(input.title, 120) || topic.slice(0, 80),
    topic,
    serviceProduct: str(input.serviceProduct, 300),
    audience: str(input.audience, 1000),
    tone: str(input.tone, 120),
    language: str(input.language, 60) || "English",
    objective: str(input.objective, 120),
    contentType: input.contentType === "video" ? "video" : "image",
    platforms,
    link: link || null,
    plannedAt: dateOrNull(input.plannedAt),
    campaignId: str(input.campaignId, 64) || null,
    offerId: str(input.offerId, 64) || null,
    clientId: str(input.clientId, 64) || null,
    notes: str(input.notes, 3000),
  };
}

/** Keeps existing variant content/publish/metrics for platforms still selected; adds empty ones for new platforms. */
export function reconcileVariants(existing: PostVariant[], platforms: PostPlatform[]): PostVariant[] {
  return platforms.map((p) => existing.find((v) => v.platform === p) ?? { platform: p, ...EMPTY_VARIANT, publish: EMPTY_PUBLISH, metrics: null });
}

export async function createPost(brief: PostBrief, actorId: string, seed: Partial<Pick<PostDoc, "idea" | "variants">> = {}): Promise<PostDoc> {
  const col = await postsCollection();
  const variants = reconcileVariants(seed.variants ?? [], brief.platforms);
  const doc: PostDoc = {
    _id: newId(),
    ...brief,
    status: seed.idea ? "edited" : "draft",
    idea: seed.idea ?? "",
    creative: EMPTY_CREATIVE,
    variants,
    mediaIds: [],
    thumbnailId: null,
    scheduledAt: null,
    scheduledBy: null,
    approvedBy: null,
    approvedAt: null,
    publishedAt: null,
    archivedFrom: null,
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

function hydrate(doc: PostDoc): PostDoc {
  return {
    ...doc,
    creative: normalizeCreative(doc.creative),
    variants: (doc.variants ?? []).map((v) => ({ ...v, ...normalizeVariant(v), platform: v.platform, publish: { ...EMPTY_PUBLISH, ...(v.publish ?? {}) }, metrics: v.metrics ?? null })),
  };
}

export async function getPost(id: string): Promise<PostDoc | null> {
  if (!id) return null;
  const col = await postsCollection();
  const doc = await col.findOne({ _id: id, ...notDeleted });
  return doc ? hydrate(doc) : null;
}

export async function requirePost(id: string): Promise<PostDoc> {
  const p = await getPost(id);
  if (!p) throw new NotFoundError();
  return p;
}

export async function updatePost(id: string, set: Partial<PostDoc>, actorId: string | null): Promise<void> {
  const col = await postsCollection();
  await col.updateOne({ _id: id }, { $set: { ...set, ...updateStamp(actorId) } });
}

export async function duplicatePost(p: PostDoc, actorId: string): Promise<PostDoc> {
  const col = await postsCollection();
  const doc: PostDoc = {
    ...p,
    _id: newId(),
    title: `${p.title} (copy)`.slice(0, 120),
    status: p.idea || p.variants.some((v) => v.content) ? "edited" : "draft",
    variants: p.variants.map((v) => ({ ...v, publish: EMPTY_PUBLISH, metrics: null })),
    scheduledAt: null,
    scheduledBy: null,
    approvedBy: null,
    approvedAt: null,
    publishedAt: null,
    archivedFrom: null,
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

export async function softDeletePost(id: string, actorId: string): Promise<void> {
  const col = await postsCollection();
  await col.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
}

export interface PostFilter {
  q?: string;
  status?: string;
  platform?: string;
  contentType?: string;
  campaignId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function listPosts(f: PostFilter = {}) {
  const col = await postsCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (f.status && f.status !== "all") filter.status = f.status.includes(",") ? { $in: f.status.split(",").filter(Boolean) } : f.status;
  else if (!f.status) filter.status = { $ne: "archived" };
  if (f.platform && isPostPlatform(f.platform)) filter.platforms = f.platform;
  if (f.contentType === "image" || f.contentType === "video") filter.contentType = f.contentType;
  if (f.campaignId) filter.campaignId = f.campaignId;
  if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.$gte = new Date(`${f.from}T00:00:00`);
    if (f.to) range.$lte = new Date(`${f.to}T23:59:59.999`);
    filter.scheduledAt = range;
  }
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), "i");
    filter.$or = [{ title: rx }, { topic: rx }, { idea: rx }, { serviceProduct: rx }];
  }
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 25, 1), 100);
  const [items, total] = await Promise.all([col.find(filter).sort({ updatedAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), col.countDocuments(filter)]);
  return { items: items.map(hydrate), total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface PostStats {
  scheduled: number;
  publishedThisMonth: number;
  failed: number;
  drafts: number;
  awaitingApproval: number;
}

/** Counts for the stat cards of the posts list (live posts only). `monthStart` is the first instant of the current month in the company's zone. */
export async function postStats(monthStart: Date): Promise<PostStats> {
  const col = await postsCollection();
  const [scheduled, publishedThisMonth, failed, drafts, awaitingApproval] = await Promise.all([
    col.countDocuments({ ...notDeleted, status: "scheduled" }),
    col.countDocuments({ ...notDeleted, status: "published", publishedAt: { $gte: monthStart } }),
    col.countDocuments({ ...notDeleted, status: "failed" }),
    col.countDocuments({ ...notDeleted, status: { $in: ["draft", "generated", "edited"] } }),
    col.countDocuments({ ...notDeleted, status: "scheduled", approvedBy: null }),
  ]);
  return { scheduled, publishedThisMonth, failed, drafts, awaitingApproval };
}

/** Posts on the calendar between two dates (scheduled or published). */
export async function calendarPosts(from: Date, to: Date): Promise<PostDoc[]> {
  const col = await postsCollection();
  const rows = await col
    .find({ ...notDeleted, status: { $ne: "archived" }, $or: [{ scheduledAt: { $gte: from, $lte: to } }, { publishedAt: { $gte: from, $lte: to } }, { plannedAt: { $gte: from, $lte: to } }] }, { projection: { creative: 0 } })
    .sort({ scheduledAt: 1 })
    .limit(500)
    .toArray();
  return rows.map((r) => hydrate({ ...r, creative: EMPTY_CREATIVE }));
}

/** Overall status from the variants' publish results. */
export function statusFromVariants(variants: PostVariant[], fallback: ContentStatus): ContentStatus {
  if (variants.length > 0 && variants.every((v) => v.publish.state === "published")) return "published";
  if (variants.some((v) => v.publish.state === "failed")) return "failed";
  return fallback;
}

export function postBriefPrompt(p: PostBrief): string {
  return [
    `Topic: ${p.topic}`,
    p.serviceProduct && `Service / product: ${p.serviceProduct}`,
    `Audience: ${p.audience || "brand default audience"}`,
    `Content objective: ${p.objective || "engagement"}`,
    `Tone: ${p.tone || "brand default"}`,
    `Language: ${p.language}`,
    `Media: ${p.contentType === "video" ? "a video" : "an image"}`,
    p.link && `Link / landing page: ${p.link}`,
    p.notes && `Notes from the team: ${p.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
}
