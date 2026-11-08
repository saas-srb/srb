import "server-only";
import { head } from "@vercel/blob";
import { putObject, deleteObject } from "@/lib/storage/blob";
import { COLLECTIONS, smmsCollection, newId, createStamp, updateStamp, notDeleted, str, strList, escapeRegex, type Stamps } from "@/lib/products/viralpulse-ai/db";
import { IMAGE_TYPES, VIDEO_TYPES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, isPlatform, type MediaKind } from "@/lib/products/viralpulse-ai/constants";
import { SmmsInputError, NotFoundError } from "@/lib/products/viralpulse-ai/viewer";
import { blobAuth } from "@/lib/storage/blob-token";
import { getObject } from "@/lib/storage/blob";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { sniffKind, MIME_FOR } from "@/lib/products/viralpulse-ai/images/sniff";
import { makeThumb, probe } from "@/lib/products/viralpulse-ai/images/compose";
import { fitsFor, specByKey } from "@/lib/products/viralpulse-ai/images/specs";

/**
 * The central media library: every image and video used by an ad or a post.
 * Files live in the platform's shared private Vercel Blob store (the same
 * `lib/storage/blob.ts` core every other product uses) under `smms/`; they are
 * only ever served through the authenticated `/api/viralpulse-ai/media/[id]` route, or
 * to a publishing platform through a short-lived signed URL.
 *
 * Uploads go browser → Blob directly (client upload, see
 * `/api/viralpulse-ai/media/upload`) so videos aren't capped by the 4.5 MB function
 * body limit; the browser then registers the finished blob here, and the
 * server re-reads its real size and type from Blob before trusting it.
 */

export const MEDIA_FOLDER = "smms";

export interface MediaVersion {
  storageKey: string;
  contentType: string;
  size: number;
  replacedAt: Date;
  replacedBy: string | null;
}

export interface MediaDoc extends Stamps {
  _id: string;
  kind: MediaKind;
  name: string;
  description: string;
  altText: string;
  tags: string[];
  /** Intended platform, if any (a filter aid only). */
  platform: string | null;
  storageKey: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  source: "upload" | "ai";
  /** The prompt an AI image was generated from / the creative prompt for a real image. */
  creativePrompt: string;
  /** Video only: an image media item used as its thumbnail. */
  thumbnailId: string | null;
  /** Video only. */
  script: string;
  caption: string;
  versions: MediaVersion[];
  /** Present on AI-generated items that must stay disclosed as such (the AI UGC Studio, the Image Studio). Never cleared by edits. */
  ai?: AiMediaMeta | null;
  /** Library folder (one level, free text), or none. */
  folder?: string | null;
  /** A small WebP preview in storage, for grids. */
  thumbKey?: string | null;
  /** Image Studio provenance: which project and size this export came from, and how it was disclosed. */
  studio?: StudioMeta | null;
}

export interface StudioMeta {
  projectId: string;
  variantId: string;
  specKey: string;
  goalId: string;
  /** The visible "AI generated" badge is drawn on the picture. */
  badge: boolean;
  /** The file's metadata (EXIF description, XMP IPTC digital source type) marks it as AI generated. */
  metadataMarked: boolean;
  consentRecorded: boolean;
}

export interface AiMediaMeta {
  aiGenerated: true;
  provider: string;
  model: string;
  projectId: string;
  /** "render" (the final video), "scene" (one clip) or "thumbnail". */
  role: "render" | "scene" | "thumbnail" | "image";
  sceneIndex?: number;
  disclosureRequired: boolean;
}

/**
 * Anything with `source: "ai"` is AI generated, whether or not it carries the `ai` provenance block (older rows and any generation path that
 * forgot it). The disclosure decision and the library's AI badge go through this, never through `m.ai` alone.
 */
export const isAiMedia = (m: Pick<MediaDoc, "source" | "ai">): boolean => m.source === "ai" || Boolean(m.ai?.aiGenerated);

/** The provenance block an AI item without one is treated as having: disclosed, provider unknown. */
export const legacyAiMeta = (m: Pick<MediaDoc, "kind">): AiMediaMeta => ({ aiGenerated: true, provider: "unknown", model: "unknown", projectId: "", role: m.kind === "video" ? "render" : "image", disclosureRequired: true });

/** Read-side backfill: an AI item without provenance gets the legacy block, so every consumer sees it as AI generated. */
export function withLegacyAi<T extends MediaDoc>(m: T): T {
  return m.source === "ai" && !m.ai?.aiGenerated ? { ...m, ai: legacyAiMeta(m) } : m;
}

let indexesEnsured = false;
const aiBackfilled = new Set<string>();
export async function mediaCollection() {
  const col = await smmsCollection<MediaDoc>(COLLECTIONS.media);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([col.createIndex({ deletedAt: 1, createdAt: -1 }).catch(() => {}), col.createIndex({ kind: 1, deletedAt: 1 }).catch(() => {}), col.createIndex({ storageKey: 1 }).catch(() => {})]);
  }
  // Once per company per process: persist the provenance of AI items saved without it (the read side already treats them as AI).
  const cid = (await currentCompanyIdOrNull()) ?? "shared";
  if (!aiBackfilled.has(cid)) {
    try {
      await col.updateMany({ source: "ai", "ai.aiGenerated": { $ne: true } }, { $set: { ai: legacyAiMeta({ kind: "image" }) } });
      await col.updateMany({ source: "ai", kind: "video", "ai.role": "image" }, { $set: { "ai.role": "render" } });
      aiBackfilled.add(cid);
    } catch (e) {
      console.error("[viralpulse] AI media provenance backfill failed; it will be retried", e instanceof Error ? e.message : e);
    }
  }
  return col;
}

/** Upload pathnames are generated by the browser but must look exactly like this — checked when the upload token is issued and again on register. */
export const UPLOAD_PATH = /^smms\/(?:[A-Za-z0-9_-]{1,64}\/)?uploads\/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$/;

/** New uploads live under the company's own prefix (`smms/<companyId>/uploads/...`); older ones have no prefix. A prefixed path must be this company's. */
export async function assertUploadOwner(pathname: string): Promise<void> {
  const cid = await currentCompanyIdOrNull();
  const m = /^smms\/([A-Za-z0-9_-]{1,64})\/uploads\//.exec(pathname);
  // The old un-prefixed form names no company, so it could be any company's blob: inside a company it is never accepted for a NEW registration
  // (the server hands out prefixed paths only; library rows already holding a legacy path keep working).
  if (!m) {
    if (cid) throw new SmmsInputError("That upload isn't valid. Upload the file again.");
    return;
  }
  if (m[1] !== cid) throw new SmmsInputError("That upload isn't valid.");
}

/**
 * Whether a stored key may be served to the current company. A key under another company's prefix never is. A legacy un-prefixed key is
 * served only because THIS company's own library row names it (rows are company-scoped), which is why callers pass a row they just read.
 */
export async function keyBelongsToCompany(storageKey: string): Promise<boolean> {
  const cid = await currentCompanyIdOrNull();
  const m = /^smms\/([A-Za-z0-9_-]{1,64})\/(?:uploads|ai|thumbs|studio)\//.exec(storageKey);
  if (!m || !cid) return true;
  return m[1] === cid || m[1] === "shared";
}

export async function newUploadPath(ext: string): Promise<string> {
  const cid = await currentCompanyIdOrNull();
  const id = crypto.randomUUID();
  return cid && /^[A-Za-z0-9_-]{1,64}$/.test(cid) ? `smms/${cid}/uploads/${id}.${ext}` : `smms/uploads/${id}.${ext}`;
}

export function kindForType(contentType: string): MediaKind | null {
  if (IMAGE_TYPES[contentType]) return "image";
  if (VIDEO_TYPES[contentType]) return "video";
  return null;
}

export interface MediaFilter {
  q?: string;
  kind?: string;
  /** "upload" | "ai" (any AI item). */
  source?: string;
  /** Where it came from: an upload, an AI image from the Image Studio, or an AI UGC video. */
  origin?: string;
  platform?: string;
  folder?: string;
  tag?: string;
  /** A spec key from images/specs.ts: only pictures whose shape fits that size. */
  fit?: string;
  /** Only images at least this wide (pixels). */
  minWidth?: number | string;
  page?: number;
  pageSize?: number;
}

/** The Mongo filter for a library query. Pure, so the filters can be tested without a database. */
export function buildMediaFilter(f: MediaFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  const and: Record<string, unknown>[] = [];
  if (f.kind === "image" || f.kind === "video") filter.kind = f.kind;
  if (f.source === "upload" || f.source === "ai") filter.source = f.source;
  if (f.origin === "upload") filter.source = "upload";
  else if (f.origin === "ai_image") Object.assign(filter, { source: "ai", kind: "image" });
  else if (f.origin === "ugc_video") Object.assign(filter, { source: "ai", kind: "video" });
  if (f.platform && isPlatform(f.platform)) filter.platform = f.platform;
  if (f.folder) filter.folder = f.folder === "__none" ? { $in: [null, ""] } : str(f.folder, 60);
  if (f.tag) filter.tags = str(f.tag, 40);
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q.slice(0, 100)), "i");
    and.push({ $or: [{ name: rx }, { description: rx }, { tags: rx }, { caption: rx }, { altText: rx }, { folder: rx }] });
  }
  const spec = f.fit ? specByKey(f.fit) : null;
  if (spec) {
    const r = spec.width / spec.height;
    // Same shape within 3%, and at least 90% of the size's width: computed from the stored size, so old rows need no migration.
    and.push({ kind: "image", width: { $gte: Math.round(spec.width * 0.9) }, $expr: { $and: [{ $gt: ["$height", 0] }, { $lte: [{ $abs: { $subtract: [{ $divide: ["$width", "$height"] }, r] } }, r * 0.03] }] } });
  }
  const mw = Math.round(Number(f.minWidth));
  if (Number.isFinite(mw) && mw > 0) and.push({ kind: "image", width: { $gte: mw } });
  if (and.length) filter.$and = and;
  return filter;
}

export async function listMedia(f: MediaFilter = {}) {
  const col = await mediaCollection();
  const filter = buildMediaFilter(f);
  const page = Math.max(f.page ?? 1, 1);
  const pageSize = Math.min(Math.max(f.pageSize ?? 36, 1), 100);
  const [items, total] = await Promise.all([col.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), col.countDocuments(filter)]);
  return { items: items.map(withLegacyAi), total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

/** Folders and tags in use, for the library's filter bar. */
export async function mediaFacets(): Promise<{ folders: string[]; tags: string[] }> {
  const col = await mediaCollection();
  const [folders, tags] = await Promise.all([col.distinct("folder", { ...notDeleted, folder: { $nin: [null, ""] } }), col.distinct("tags", notDeleted)]);
  return { folders: (folders as string[]).filter(Boolean).sort().slice(0, 100), tags: (tags as string[]).filter(Boolean).sort().slice(0, 200) };
}

/** Which specs a library picture fits (for the "fits" chips). */
export const platformFit = (m: Pick<MediaDoc, "kind" | "width" | "height">) => (m.kind === "image" ? fitsFor(m.width, m.height).map((s) => s.key) : []);

export async function getMedia(id: string): Promise<MediaDoc | null> {
  if (!id) return null;
  const col = await mediaCollection();
  const m = await col.findOne({ _id: id, ...notDeleted });
  return m ? withLegacyAi(m) : null;
}

export async function getMediaMany(ids: string[]): Promise<MediaDoc[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (wanted.length === 0) return [];
  const col = await mediaCollection();
  const rows = await col.find({ _id: { $in: wanted }, ...notDeleted }).toArray();
  const byId = new Map(rows.map((r) => [r._id, withLegacyAi(r)]));
  return wanted.map((id) => byId.get(id)).filter((m): m is MediaDoc => Boolean(m));
}

/** Reads the uploaded blob's real metadata from Blob (never trusts the browser's claims). */
async function readBytes(storageKey: string, limit: number): Promise<Buffer | null> {
  const o = await getObject(storageKey).catch(() => null);
  if (!o) return null;
  const reader = o.stream.getReader();
  const chunks: Uint8Array[] = [];
  let n = 0;
  while (n < limit) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    n += value.byteLength;
  }
  await reader.cancel().catch(() => {});
  return Buffer.concat(chunks);
}

/** Bytes of a library file (images only; refuses anything over the image limit). */
export async function readMediaBytes(m: Pick<MediaDoc, "storageKey" | "size" | "kind">): Promise<Buffer | null> {
  if (m.kind !== "image" || m.size > MAX_IMAGE_BYTES) return null;
  return readBytes(m.storageKey, MAX_IMAGE_BYTES + 1);
}

interface UploadInfo {
  contentType: string;
  size: number;
  kind: MediaKind;
  width: number | null;
  height: number | null;
  thumb: { data: Buffer } | null;
}

async function inspectUpload(pathname: string): Promise<UploadInfo> {
  if (!UPLOAD_PATH.test(pathname)) throw new SmmsInputError("That upload isn't valid.");
  await assertUploadOwner(pathname);
  let meta;
  try {
    meta = await head(pathname, await blobAuth());
  } catch {
    throw new SmmsInputError("The upload didn't finish — please try again.");
  }
  const contentType = meta.contentType.split(";")[0].trim().toLowerCase();
  const kind = kindForType(contentType);
  if (!kind) {
    await deleteObject(pathname);
    throw new SmmsInputError("Only JPG, PNG, WebP, GIF, MP4, MOV and WebM files are supported.");
  }
  if (meta.size > (kind === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES)) {
    await deleteObject(pathname);
    throw new SmmsInputError("That file is too large.");
  }
  // The type the browser claimed is not trusted: the file's first bytes must match it and the file's extension.
  const head16 = await readBytes(pathname, kind === "image" ? MAX_IMAGE_BYTES + 1 : 64);
  const real = head16 ? sniffKind(head16) : null;
  const ext = /\.([a-z0-9]+)$/.exec(pathname)?.[1] ?? "";
  const extKind = ext === "jpg" ? "jpeg" : ext;
  if (!real || MIME_FOR[real] !== contentType || (real !== extKind && !(real === "mov" && extKind === "mov"))) {
    await deleteObject(pathname);
    throw new SmmsInputError("That file isn't what its name says it is, so it was rejected. Upload a real JPG, PNG, WebP, GIF, MP4, MOV or WebM file.");
  }
  if (kind === "image" && head16) {
    try {
      const p = await probe(head16);
      const thumb = await makeThumb(head16);
      return { contentType, size: meta.size, kind, width: p.width, height: p.height, thumb };
    } catch {
      await deleteObject(pathname);
      throw new SmmsInputError("That image can't be read. It may be damaged.");
    }
  }
  return { contentType, size: meta.size, kind, width: null, height: null, thumb: null };
}

async function storeThumb(id: string, thumb: { data: Buffer } | null): Promise<string | null> {
  if (!thumb) return null;
  try {
    const cid = (await currentCompanyIdOrNull()) ?? "shared";
    const put = await putObject(`${MEDIA_FOLDER}/${cid}/thumbs`, `${id}.webp`, thumb.data, "image/webp");
    return put.storageKey;
  } catch {
    return null;
  }
}

export interface MediaMetaInput {
  name?: unknown;
  description?: unknown;
  altText?: unknown;
  tags?: unknown;
  platform?: unknown;
  width?: unknown;
  height?: unknown;
  durationSec?: unknown;
  creativePrompt?: unknown;
  script?: unknown;
  caption?: unknown;
  thumbnailId?: unknown;
  folder?: unknown;
}

const dim = (v: unknown): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
};

export async function registerUpload(pathname: string, meta: MediaMetaInput, actorId: string): Promise<MediaDoc> {
  const col = await mediaCollection();
  if (await col.findOne({ storageKey: pathname })) throw new SmmsInputError("That upload is already in the library.");
  const info = await inspectUpload(pathname);
  const doc: MediaDoc = {
    _id: newId(),
    kind: info.kind,
    name: str(meta.name, 160) || "Untitled",
    description: str(meta.description, 2000),
    altText: str(meta.altText, 500),
    tags: strList(meta.tags, 20, 40),
    platform: isPlatform(meta.platform) ? meta.platform : null,
    storageKey: pathname,
    contentType: info.contentType,
    size: info.size,
    width: info.width ?? dim(meta.width),
    height: info.height ?? dim(meta.height),
    durationSec: info.kind === "video" ? dim(meta.durationSec) : null,
    source: "upload",
    creativePrompt: str(meta.creativePrompt, 4000),
    thumbnailId: null,
    script: "",
    caption: "",
    versions: [],
    folder: str(meta.folder, 60) || null,
    ...createStamp(actorId),
  };
  doc.thumbKey = await storeThumb(doc._id, info.thumb);
  await col.insertOne(doc);
  return doc;
}

/** Swap the file behind a media item. The old blob is kept as a version (never deleted), so posts that used it are unaffected in history. */
export async function replaceMediaFile(id: string, pathname: string, meta: MediaMetaInput, actorId: string): Promise<{ before: MediaDoc; after: MediaDoc }> {
  const col = await mediaCollection();
  const before = await getMedia(id);
  if (!before) throw new NotFoundError();
  const info = await inspectUpload(pathname);
  if (info.kind !== before.kind) {
    await deleteObject(pathname);
    throw new SmmsInputError(`Replace a ${before.kind} with another ${before.kind}.`);
  }
  const version: MediaVersion = { storageKey: before.storageKey, contentType: before.contentType, size: before.size, replacedAt: new Date(), replacedBy: actorId };
  await col.updateOne(
    { _id: id },
    {
      $set: { storageKey: pathname, contentType: info.contentType, size: info.size, width: info.width ?? dim(meta.width), height: info.height ?? dim(meta.height), thumbKey: await storeThumb(id, info.thumb), durationSec: info.kind === "video" ? dim(meta.durationSec) : null, source: "upload", ...updateStamp(actorId) },
      $push: { versions: { $each: [version], $slice: -20 } },
    }
  );
  return { before, after: (await getMedia(id))! };
}

export async function saveAiImage(buf: Buffer, meta: { name: string; creativePrompt: string; platform: string | null; width: number; height: number; tags?: string[]; contentType?: "image/png" | "image/jpeg"; ai?: AiMediaMeta }, actorId: string): Promise<MediaDoc> {
  const col = await mediaCollection();
  const id = newId();
  const contentType = meta.contentType ?? "image/png";
  const put = await putObject(`${MEDIA_FOLDER}/${(await currentCompanyIdOrNull()) ?? "shared"}/ai`, `${id}.${contentType === "image/jpeg" ? "jpg" : "png"}`, buf, contentType);
  const doc: MediaDoc = {
    _id: id,
    kind: "image",
    name: meta.name.slice(0, 160) || "AI image",
    description: "",
    altText: "",
    tags: ["ai", ...(meta.tags ?? [])].slice(0, 20),
    platform: meta.platform && isPlatform(meta.platform) ? meta.platform : null,
    storageKey: put.storageKey,
    contentType,
    size: put.size,
    width: meta.width,
    height: meta.height,
    durationSec: null,
    source: "ai",
    creativePrompt: meta.creativePrompt.slice(0, 4000),
    thumbnailId: null,
    script: "",
    caption: "",
    versions: [],
    ...(meta.ai ? { ai: meta.ai } : {}),
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

/** One finished export from the Image Studio into the library, with its provenance and disclosure. */
export async function saveStudioImage(buf: Buffer, meta: { name: string; prompt: string; platform: string | null; width: number; height: number; contentType: "image/png" | "image/jpeg"; tags: string[]; folder: string | null; altText?: string; ai: AiMediaMeta; studio: StudioMeta }, actorId: string): Promise<MediaDoc> {
  const col = await mediaCollection();
  const id = newId();
  const cid = (await currentCompanyIdOrNull()) ?? "shared";
  const put = await putObject(`${MEDIA_FOLDER}/${cid}/ai`, `${id}.${meta.contentType === "image/jpeg" ? "jpg" : "png"}`, buf, meta.contentType);
  const thumbKey = await storeThumb(id, await makeThumb(buf).catch(() => null));
  const doc: MediaDoc = {
    _id: id,
    kind: "image",
    name: meta.name.slice(0, 160) || "AI image",
    description: "",
    altText: str(meta.altText, 500),
    tags: ["ai", ...meta.tags].filter((t, i, a) => a.indexOf(t) === i).slice(0, 20),
    platform: meta.platform && isPlatform(meta.platform) ? meta.platform : null,
    storageKey: put.storageKey,
    contentType: meta.contentType,
    size: put.size,
    width: meta.width,
    height: meta.height,
    durationSec: null,
    source: "ai",
    creativePrompt: meta.prompt.slice(0, 4000),
    thumbnailId: null,
    script: "",
    caption: "",
    versions: [],
    ai: meta.ai,
    folder: meta.folder,
    thumbKey,
    studio: meta.studio,
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

/** An AI-generated video (AI UGC Studio) into the library, flagged with the provenance metadata that travels with it onto posts. */
export async function saveAiVideo(buf: Buffer, meta: { name: string; creativePrompt: string; platform: string | null; width: number; height: number; durationSec: number | null; thumbnailId: string | null; script: string; caption: string; tags?: string[]; ai: AiMediaMeta }, actorId: string): Promise<MediaDoc> {
  const col = await mediaCollection();
  const id = newId();
  const put = await putObject(`${MEDIA_FOLDER}/${(await currentCompanyIdOrNull()) ?? "shared"}/ai`, `${id}.mp4`, buf, "video/mp4");
  const doc: MediaDoc = {
    _id: id,
    kind: "video",
    name: meta.name.slice(0, 160) || "AI video",
    description: "",
    altText: "",
    tags: ["ai", "ugc", ...(meta.tags ?? [])].slice(0, 20),
    platform: meta.platform && isPlatform(meta.platform) ? meta.platform : null,
    storageKey: put.storageKey,
    contentType: "video/mp4",
    size: put.size,
    width: meta.width,
    height: meta.height,
    durationSec: meta.durationSec,
    source: "ai",
    creativePrompt: meta.creativePrompt.slice(0, 4000),
    thumbnailId: meta.thumbnailId,
    script: meta.script.slice(0, 20000),
    caption: meta.caption.slice(0, 5000),
    versions: [],
    ai: meta.ai,
    ...createStamp(actorId),
  };
  await col.insertOne(doc);
  return doc;
}

export async function updateMediaMeta(id: string, meta: MediaMetaInput, actorId: string): Promise<{ before: MediaDoc; after: MediaDoc }> {
  const col = await mediaCollection();
  const before = await getMedia(id);
  if (!before) throw new NotFoundError();
  let thumbnailId: string | null = before.thumbnailId;
  if (before.kind === "video" && meta.thumbnailId !== undefined) {
    const tid = str(meta.thumbnailId, 64);
    if (tid) {
      const t = await getMedia(tid);
      if (!t || t.kind !== "image") throw new SmmsInputError("A thumbnail must be an image from the library.");
      thumbnailId = t._id;
    } else thumbnailId = null;
  }
  const set = {
    name: str(meta.name, 160) || before.name,
    description: str(meta.description, 2000),
    altText: str(meta.altText, 500),
    tags: strList(meta.tags, 20, 40),
    platform: isPlatform(meta.platform) ? meta.platform : null,
    creativePrompt: str(meta.creativePrompt, 4000),
    ...(meta.folder !== undefined ? { folder: str(meta.folder, 60) || null } : {}),
    script: before.kind === "video" ? str(meta.script, 20000) : "",
    caption: str(meta.caption, 5000),
    thumbnailId,
    ...(meta.width !== undefined ? { width: dim(meta.width), height: dim(meta.height) } : {}),
    ...(meta.durationSec !== undefined && before.kind === "video" ? { durationSec: dim(meta.durationSec) } : {}),
    ...updateStamp(actorId),
  };
  await col.updateOne({ _id: id }, { $set: set });
  return { before, after: (await getMedia(id))! };
}

/** Where a media item is attached — deletion is refused while anything live still uses it. */
export async function mediaUsage(id: string): Promise<{ ads: { _id: string; name: string; campaignId: string }[]; posts: { _id: string; title: string }[]; videos: { _id: string; name: string }[] }> {
  const [ads, posts, media] = await Promise.all([
    smmsCollection<{ _id: string; name: string; campaignId: string; mediaIds: string[]; thumbnailId: string | null; deletedAt: Date | null }>(COLLECTIONS.ads),
    smmsCollection<{ _id: string; title: string; mediaIds: string[]; thumbnailId: string | null; deletedAt: Date | null }>(COLLECTIONS.posts),
    mediaCollection(),
  ]);
  const [a, p, v] = await Promise.all([
    ads.find({ ...notDeleted, $or: [{ mediaIds: id }, { thumbnailId: id }] }, { projection: { name: 1, campaignId: 1 } }).limit(20).toArray(),
    posts.find({ ...notDeleted, $or: [{ mediaIds: id }, { thumbnailId: id }] }, { projection: { title: 1 } }).limit(20).toArray(),
    media.find({ ...notDeleted, thumbnailId: id }, { projection: { name: 1 } }).limit(20).toArray(),
  ]);
  return { ads: a.map((x) => ({ _id: x._id, name: x.name, campaignId: x.campaignId })), posts: p.map((x) => ({ _id: x._id, title: x.title })), videos: v.map((x) => ({ _id: x._id, name: x.name })) };
}

export async function deleteMedia(id: string, actorId: string): Promise<MediaDoc> {
  const m = await getMedia(id);
  if (!m) throw new NotFoundError();
  const usage = await mediaUsage(id);
  const n = usage.ads.length + usage.posts.length + usage.videos.length;
  if (n > 0) throw new SmmsInputError(`This ${m.kind} is attached to ${n} item${n === 1 ? "" : "s"} — detach it first.`);
  const col = await mediaCollection();
  // Soft delete: blobs are kept, like every other product's documents.
  await col.updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return m;
}

/** Media ids from a client, filtered to real, live library items of the allowed kinds. */
export async function validMediaIds(ids: unknown, kinds: MediaKind[] = ["image", "video"]): Promise<string[]> {
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, 10) : [];
  const rows = await getMediaMany(list);
  return rows.filter((m) => kinds.includes(m.kind)).map((m) => m._id);
}

export interface MediaCard {
  _id: string;
  kind: MediaKind;
  name: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  source: "upload" | "ai";
  thumbnailId: string | null;
  altText: string;
  updatedAt: string;
  hasThumb?: boolean;
  /** Image Studio export with the visible AI badge, or marked AI in metadata. */
  aiDisclosed?: boolean;
}

export function toMediaCard(m: MediaDoc): MediaCard {
  return { _id: m._id, kind: m.kind, name: m.name, contentType: m.contentType, size: m.size, width: m.width, height: m.height, durationSec: m.durationSec, source: m.source, thumbnailId: m.thumbnailId, altText: m.altText, updatedAt: m.updatedAt.toISOString(), hasThumb: !!m.thumbKey, ...(isAiMedia(m) ? { aiDisclosed: true } : {}) };
}
