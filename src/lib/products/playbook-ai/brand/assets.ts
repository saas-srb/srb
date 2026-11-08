import "server-only";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import type { OutputInfo } from "sharp";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { deleteObject, getObject, putObject } from "@/lib/storage/blob";
import { PB_COLLECTIONS } from "@/lib/products/playbook-ai/pb-collections";
import type { BrandAssetKind } from "@/lib/products/playbook-ai/brand/types";

/**
 * Brand images: logo, signature and stamp images. Server-only.
 *
 * Every upload is re-encoded to PNG with `sharp` (metadata stripped, orientation applied, size capped), so a renamed executable, a
 * polyglot file or an SVG with script can never be stored as an image. The bytes go to PRIVATE storage under a key that starts with the
 * company id (`playbook-brand/<companyId>/<uuid>.png`) and are never served by a public URL; they are read back only through
 * `getBrandAsset`, which the render code and the Brand page call after a permission check. The metadata row is company-scoped like
 * every other collection, so another company can neither list nor read it.
 *
 * Storage is behind `BrandAssetStore` so tests run with an in-memory store and never touch a real provider.
 */

export interface BrandAssetStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const blobStore: BrandAssetStore = {
  async put(key, bytes, contentType) {
    const i = key.lastIndexOf("/");
    await putObject(key.slice(0, i), key.slice(i + 1), bytes, contentType);
  },
  async get(key) {
    const obj = await getObject(key);
    if (!obj) return null;
    const chunks: Uint8Array[] = [];
    const reader = obj.stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  },
  async delete(key) {
    await deleteObject(key);
  },
};

let override: BrandAssetStore | null = null;
/** Test hook: replace the storage (pass null to restore the real one). */
export function setBrandAssetStore(store: BrandAssetStore | null): void {
  override = store;
}
const storage = () => override ?? blobStore;

export interface BrandAssetRecord {
  _id: string;
  kind: BrandAssetKind;
  storageKey: string;
  contentType: "image/png";
  widthPx: number;
  heightPx: number;
  bytes: number;
  sha256: string;
  createdBy: string | null;
  createdAt: Date;
}

export const BRAND_IMAGE_LIMITS = {
  maxUploadBytes: 2 * 1024 * 1024,
  maxInputPixels: 24_000_000,
  maxStoredBytes: 1024 * 1024,
  /** Largest stored size in pixels per kind; larger images are scaled down, never up. */
  box: { logo: { w: 1200, h: 600 }, signature: { w: 800, h: 300 }, stamp: { w: 600, h: 600 } } as Record<BrandAssetKind, { w: number; h: number }>,
} as const;

const startsWith = (b: Buffer, sig: number[]) => sig.every((x, i) => b[i] === x);
function acceptedFormat(b: Buffer): boolean {
  return (
    startsWith(b, [0x89, 0x50, 0x4e, 0x47]) || // PNG
    startsWith(b, [0xff, 0xd8, 0xff]) || // JPEG
    (b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") ||
    b.toString("ascii", 0, 4) === "GIF8"
  );
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

async function companyKeyPrefix(): Promise<string> {
  const id = await currentCompanyId();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Unsafe company id for a storage key");
  return `playbook-brand/${id}`;
}

async function col() {
  return (await getDb()).collection<BrandAssetRecord>(PB_COLLECTIONS.brandAssets);
}

/** Validates, re-encodes and stores one brand image. Returns the new asset record (not yet attached to the brand). */
export async function saveBrandImage(kind: BrandAssetKind, input: Uint8Array, createdBy: string | null): Promise<Result<{ asset: BrandAssetRecord }>> {
  if (!["logo", "signature", "stamp"].includes(kind)) return { ok: false, error: "Unknown image type." };
  if (input.byteLength === 0) return { ok: false, error: "That file is empty." };
  if (input.byteLength > BRAND_IMAGE_LIMITS.maxUploadBytes) return { ok: false, error: "Use an image under 2 MB." };
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!acceptedFormat(bytes)) return { ok: false, error: "Use a PNG, JPG, WebP or GIF image. SVG and other formats are not accepted." };
  const box = BRAND_IMAGE_LIMITS.box[kind];
  let out: { data: Buffer; width: number; height: number };
  try {
    let scale = 1;
    let result: { data: Buffer; info: OutputInfo } | null = null;
    // Re-encode; if the PNG is still large, shrink until it fits the stored-size cap.
    for (let i = 0; i < 4; i++) {
      result = await sharp(bytes, { limitInputPixels: BRAND_IMAGE_LIMITS.maxInputPixels, failOn: "error" })
        .rotate()
        .resize({ width: Math.round(box.w * scale), height: Math.round(box.h * scale), fit: "inside", withoutEnlargement: true })
        .png({ compressionLevel: 9 })
        .toBuffer({ resolveWithObject: true });
      if (result.data.length <= BRAND_IMAGE_LIMITS.maxStoredBytes) break;
      scale *= 0.7;
    }
    if (!result || result.data.length > BRAND_IMAGE_LIMITS.maxStoredBytes) return { ok: false, error: "That image is too detailed. Use a simpler or smaller one." };
    out = { data: result.data, width: result.info.width, height: result.info.height };
  } catch {
    return { ok: false, error: "That image could not be read. Try exporting it again as PNG." };
  }
  if (out.width < 16 || out.height < 16) return { ok: false, error: "That image is too small to use." };
  const key = `${await companyKeyPrefix()}/${randomUUID()}.png`;
  await storage().put(key, out.data, "image/png");
  const record: BrandAssetRecord = {
    _id: randomUUID(), kind, storageKey: key, contentType: "image/png", widthPx: out.width, heightPx: out.height, bytes: out.data.length,
    sha256: createHash("sha256").update(out.data).digest("hex"), createdBy, createdAt: new Date(),
  };
  try {
    await (await col()).insertOne(record);
  } catch {
    await storage().delete(key).catch(() => {});
    return { ok: false, error: "The image could not be saved. Please try again." };
  }
  return { ok: true, asset: record };
}

/** The asset's metadata and bytes, or null when it does not exist for this company (another company's id behaves exactly like a missing one). */
export async function getBrandAsset(id: string, kinds?: readonly BrandAssetKind[]): Promise<{ record: BrandAssetRecord; bytes: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(id)) return null;
  const record = await (await col()).findOne({ _id: id });
  if (!record) return null;
  if (kinds && !kinds.includes(record.kind)) return null;
  // Defence in depth on top of the scoped database: the key must carry this company's prefix.
  if (!record.storageKey.startsWith(`${await companyKeyPrefix()}/`)) return null;
  const bytes = await storage().get(record.storageKey);
  return bytes ? { record, bytes } : null;
}

export async function getBrandAssetRecords(ids: readonly string[]): Promise<BrandAssetRecord[]> {
  if (!ids.length) return [];
  return (await col()).find({ _id: { $in: [...ids] } }).toArray();
}

/** Deletes images that nothing references any more. Uploads newer than `graceMs` are kept (the person may still be filling in the form). */
export async function deleteUnreferencedAssets(referenced: ReadonlySet<string>, graceMs = 30 * 60 * 1000): Promise<number> {
  const c = await col();
  const cutoff = new Date(Date.now() - graceMs);
  const stale = await c.find({ createdAt: { $lt: cutoff } }).toArray();
  let n = 0;
  for (const a of stale) {
    if (referenced.has(a._id)) continue;
    await storage().delete(a.storageKey).catch(() => {});
    await c.deleteOne({ _id: a._id });
    n++;
  }
  return n;
}
