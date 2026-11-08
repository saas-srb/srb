import "server-only";
import { head } from "@vercel/blob";
import { deleteObject } from "@/lib/storage/blob";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, newId, createStamp } from "@/lib/products/sitecraft-ai/db";
import { CmsInputError } from "@/lib/products/sitecraft-ai/viewer";
import { blobAuth } from "@/lib/storage/blob-token";

/**
 * The CMS media library. Images live in the platform's shared private Vercel
 * Blob store (the `lib/storage/blob.ts` core every product uses) under `cms/` —
 * same client-upload-token pattern as `src/lib/viralpulse-ai/media.ts` (browser
 * uploads straight to Blob, then registers here; the server re-reads the
 * blob's real size/type before trusting it).
 *
 * One deliberate difference from SMMS: CMS media renders on the PUBLIC
 * marketing site for anonymous visitors, so it's served through an
 * unauthenticated read route (`/api/sitecraft-ai/media/[id]`) rather than an
 * authenticated one — the blob itself is still private in Blob; only this
 * app's own proxy route can read it, and that route requires no CMS session
 * (upload/delete still do). Nothing served this way is sensitive: it's
 * marketing image content by definition.
 */

export const MEDIA_FOLDER = "cms";
export const UPLOAD_PATH = /^cms\/uploads\/[0-9a-f-]{36}\.(jpg|png|webp|gif|svg)$/;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };

export interface CmsMediaDoc {
  _id: string;
  name: string;
  altText: string;
  tags: string[];
  storageKey: string;
  contentType: string;
  size: number;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
  updatedBy: string | null;
}

async function col() {
  const db = await getDb();
  return db.collection<CmsMediaDoc>(COLLECTIONS.media);
}

/** Reads the uploaded blob's real metadata from Blob (never trusts the browser's claims). */
async function inspectUpload(pathname: string): Promise<{ contentType: string; size: number }> {
  if (!UPLOAD_PATH.test(pathname)) throw new CmsInputError("That upload isn't valid.");
  let meta;
  try {
    meta = await head(pathname, await blobAuth());
  } catch {
    throw new CmsInputError("The upload didn't finish — please try again.");
  }
  const contentType = meta.contentType.split(";")[0].trim().toLowerCase();
  if (!IMAGE_TYPES[contentType]) {
    await deleteObject(pathname);
    throw new CmsInputError("Only JPG, PNG, WebP, GIF and SVG files are supported.");
  }
  if (meta.size > MAX_IMAGE_BYTES) {
    await deleteObject(pathname);
    throw new CmsInputError("That file is too large (max 20 MB).");
  }
  return { contentType, size: meta.size };
}

export async function registerCmsUpload(pathname: string, name: string, actorId: string): Promise<CmsMediaDoc> {
  const { contentType, size } = await inspectUpload(pathname);
  const doc: CmsMediaDoc = {
    _id: newId(),
    name: name.trim() || pathname.split("/").pop() || "Untitled",
    altText: "",
    tags: [],
    storageKey: pathname,
    contentType,
    size,
    ...createStamp(actorId),
  };
  const c = await col();
  await c.insertOne(doc);
  return doc;
}

export async function listMedia(q?: string): Promise<CmsMediaDoc[]> {
  const c = await col();
  const filter = q ? { name: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } : {};
  return c.find(filter).sort({ createdAt: -1 }).limit(200).toArray();
}

export async function getMedia(id: string): Promise<CmsMediaDoc | null> {
  const c = await col();
  return c.findOne({ _id: id });
}

export async function updateMedia(id: string, patch: { name?: string; altText?: string }, actorId: string): Promise<void> {
  const c = await col();
  await c.updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date(), updatedBy: actorId } });
}

export async function deleteMedia(id: string): Promise<void> {
  const c = await col();
  const doc = await c.findOne({ _id: id });
  if (!doc) return;
  await deleteObject(doc.storageKey);
  await c.deleteOne({ _id: id });
}


/** Stores an image the platform generated for this company's site (no browser upload involved) and returns its public URL. */
export async function createCmsMediaFromBuffer(png: Buffer, name: string, altText: string, actorId: string): Promise<string> {
  const { randomUUID } = await import("node:crypto");
  const { putObject } = await import("@/lib/storage/blob");
  const stored = await putObject("cms/uploads", `${randomUUID()}.png`, png, "image/png");
  const doc: CmsMediaDoc = {
    _id: newId(),
    name: name.trim() || "Generated image",
    altText,
    tags: ["ai-generated"],
    storageKey: stored.storageKey,
    contentType: "image/png",
    size: stored.size,
    ...createStamp(actorId),
  };
  await (await col()).insertOne(doc);
  return `/api/sitecraft-ai/media/${doc._id}`;
}
