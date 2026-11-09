import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { deleteObject, getObject, putObject } from "@/lib/storage/blob";

/**
 * Signature images (drawn or uploaded). Every image is checked by its first bytes, re-encoded to PNG with `sharp` (metadata stripped, size
 * capped) and stored PRIVATELY under a key that starts with the company id; there is no public URL. Only sealing code reads them back
 * (`getSignatureImage`). Storage is replaceable so tests run with an in-memory store and never touch a real provider.
 */
export interface SignatureStore {
  put(key: string, bytes: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

const blobStore: SignatureStore = {
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
let override: SignatureStore | null = null;
/** Tests only. */
export function setSignatureStore(s: SignatureStore | null) {
  override = s;
}
const storage = () => override ?? blobStore;

export const SIGNATURE_LIMITS = { maxUploadBytes: 1_500_000, maxInputPixels: 16_000_000, box: { w: 800, h: 300 }, maxStoredBytes: 600_000, minSide: 24 } as const;

const startsWith = (b: Buffer, sig: number[]) => sig.every((x, i) => b[i] === x);
const isPng = (b: Buffer) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const isJpeg = (b: Buffer) => startsWith(b, [0xff, 0xd8, 0xff]);

export type StoredSignature = { ok: true; storageKey: string; sha256: string; widthPx: number; heightPx: number } | { ok: false; message: string };

export async function saveSignatureImage(input: Uint8Array): Promise<StoredSignature> {
  if (input.byteLength === 0) return { ok: false, message: "That signature image is empty." };
  if (input.byteLength > SIGNATURE_LIMITS.maxUploadBytes) return { ok: false, message: "Use a signature image under 1.5 MB." };
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (!isPng(bytes) && !isJpeg(bytes)) return { ok: false, message: "Use a PNG or JPG image of your signature." };
  let out: { data: Buffer; width: number; height: number };
  try {
    const r = await sharp(bytes, { limitInputPixels: SIGNATURE_LIMITS.maxInputPixels, failOn: "error" })
      .rotate()
      .resize({ width: SIGNATURE_LIMITS.box.w, height: SIGNATURE_LIMITS.box.h, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true });
    out = { data: r.data, width: r.info.width, height: r.info.height };
  } catch {
    return { ok: false, message: "That signature image could not be read. Draw it again or try another file." };
  }
  if (out.width < SIGNATURE_LIMITS.minSide || out.height < SIGNATURE_LIMITS.minSide) return { ok: false, message: "That signature is too small. Please sign larger." };
  if (out.data.length > SIGNATURE_LIMITS.maxStoredBytes) return { ok: false, message: "That signature image is too detailed. Use a simpler one." };
  const id = await currentCompanyId();
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error("Unsafe company id for a storage key");
  const storageKey = `contractflow-signatures/${id}/${randomUUID()}.png`;
  await storage().put(storageKey, out.data, "image/png");
  return { ok: true, storageKey, sha256: createHash("sha256").update(out.data).digest("hex"), widthPx: out.width, heightPx: out.height };
}

export async function getSignatureImage(storageKey: string): Promise<Buffer | null> {
  const id = await currentCompanyId();
  if (!storageKey.startsWith(`contractflow-signatures/${id}/`)) return null; // never read another company's key
  return storage().get(storageKey);
}

export async function deleteSignatureImage(storageKey: string): Promise<void> {
  await storage().delete(storageKey).catch(() => {});
}
