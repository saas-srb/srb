import "server-only";
import sharp from "sharp";
import { getObject } from "@/lib/storage/blob";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { signMediaToken } from "@/lib/products/viralpulse-ai/crypto";
import { getMedia, getMediaMany, isAiMedia, type MediaDoc } from "@/lib/products/viralpulse-ai/media";
import { SmmsInputError } from "@/lib/products/viralpulse-ai/viewer";
import type { MediaFacts } from "./types";

export const MAX_IMAGE_READ = 25 * 1024 * 1024;

/**
 * Signed media URL on the company's own site (the media route resolves the company from the host). `SMMS_PUBLIC_BASE_URL` is one
 * platform-wide env var, so only the platform owner honours it. `jpeg` asks the route for a JPEG rendition (Instagram takes JPEG only).
 */
export async function publicMediaUrl(mediaId: string, opts: { jpeg?: boolean } = {}): Promise<string> {
  const exp = Date.now() + 60 * 60 * 1000;
  const sig = signMediaToken(mediaId, exp);
  if (!sig) throw new SmmsInputError("PLATFORM_ENCRYPTION_KEY isn't set, so media can't be handed to the platform.");
  const override = process.env.SMMS_PUBLIC_BASE_URL && (await isPlatformOwnerContext()) ? process.env.SMMS_PUBLIC_BASE_URL : null;
  const base = (override || (await companySiteUrl())).replace(/\/$/, "");
  return `${base}/api/viralpulse-ai/media/public/${mediaId}?exp=${exp}&sig=${sig}${opts.jpeg ? "&fmt=jpeg" : ""}`;
}

export function factsOf(m: MediaDoc): MediaFacts {
  return {
    id: m._id,
    kind: m.kind,
    name: m.name,
    contentType: m.contentType,
    size: m.size,
    width: m.width,
    height: m.height,
    durationSec: m.durationSec,
    altText: m.altText,
    aiGenerated: isAiMedia(m),
    // An AI item without a provenance block is disclosed by default; only an explicit `disclosureRequired: false` opts out.
    aiDisclosureRequired: isAiMedia(m) ? m.ai?.disclosureRequired !== false : false,
  };
}

/** Reads dimensions of images that were stored without them (older library items). Never throws: unknown stays null and becomes a warning. */
async function withDimensions(m: MediaDoc): Promise<MediaFacts> {
  const f = factsOf(m);
  if (m.kind === "image" && (!f.width || !f.height) && m.size <= MAX_IMAGE_READ) {
    try {
      const { bytes } = await readImage(m._id);
      const meta = await sharp(bytes).metadata();
      f.width = meta.width ?? null;
      f.height = meta.height ?? null;
    } catch {
      // stays unknown
    }
  }
  return f;
}

export interface LoadedMedia {
  docs: Map<string, MediaDoc>;
  images: MediaFacts[];
  video: MediaFacts | null;
  thumbnail: MediaFacts | null;
}

export async function loadPostMedia(mediaIds: string[], thumbnailId: string | null): Promise<LoadedMedia> {
  const docs = new Map<string, MediaDoc>();
  const list = await getMediaMany(mediaIds);
  for (const d of list) docs.set(d._id, d);
  const videoDoc = list.find((m) => m.kind === "video") ?? null;
  const thumbDoc = thumbnailId ? await getMedia(thumbnailId) : videoDoc?.thumbnailId ? await getMedia(videoDoc.thumbnailId) : null;
  if (thumbDoc) docs.set(thumbDoc._id, thumbDoc);
  const images = await Promise.all(list.filter((m) => m.kind === "image").map(withDimensions));
  return { docs, images, video: videoDoc ? factsOf(videoDoc) : null, thumbnail: thumbDoc ? await withDimensions(thumbDoc) : null };
}

export async function openMediaStream(doc: MediaDoc): Promise<ReadableStream<Uint8Array>> {
  const obj = await getObject(doc.storageKey);
  if (!obj) throw new SmmsInputError(`The file for "${doc.name}" is missing from storage.`);
  return obj.stream;
}

/** Reads one image fully (bounded), for conversion. Videos are never read this way. */
async function readImageDoc(doc: MediaDoc): Promise<Buffer> {
  if (doc.size > MAX_IMAGE_READ) throw new SmmsInputError(`"${doc.name}" is too large to process.`);
  const stream = await openMediaStream(doc);
  const reader = stream.getReader();
  const parts: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      total += value.length;
      if (total > MAX_IMAGE_READ) throw new SmmsInputError(`"${doc.name}" is too large to process.`);
      parts.push(Buffer.from(value));
    }
    if (done) break;
  }
  return Buffer.concat(parts);
}

async function readImage(id: string): Promise<{ bytes: Buffer; doc: MediaDoc }> {
  const doc = await getMedia(id);
  if (!doc) throw new SmmsInputError("That image no longer exists.");
  return { bytes: await readImageDoc(doc), doc };
}

/** JPEG rendition for platforms that only accept JPEG: flattened on white (no alpha), rotated by EXIF, optionally shrunk. */
export async function toJpeg(bytes: Buffer, maxSide?: number): Promise<Buffer> {
  let img = sharp(bytes, { animated: false }).rotate().flatten({ background: "#ffffff" });
  if (maxSide) img = img.resize({ width: maxSide, height: maxSide, fit: "inside", withoutEnlargement: true });
  return img.jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

export async function imageBytesFor(id: string, opts: { jpeg?: boolean; maxSide?: number } = {}): Promise<{ bytes: Buffer; contentType: string }> {
  const { bytes, doc } = await readImage(id);
  if (opts.jpeg && doc.contentType !== "image/jpeg") return { bytes: await toJpeg(bytes, opts.maxSide), contentType: "image/jpeg" };
  return { bytes, contentType: doc.contentType };
}
