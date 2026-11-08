import "server-only";
import { randomUUID } from "node:crypto";
import { getObject } from "@/lib/storage/blob";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/**
 * Company logo uploads. The image (at most 1 MB) is kept in the company's own database (`brand_logos`, company-scoped), so it
 * survives every restart, build and deployment and does not depend on a file store being reachable; it is served by
 * `/api/platform/brand-logo/<file>` on the company's own host only. Logos uploaded earlier into Blob
 * (`branding/<companyId>-<uuid>.<ext>`) are still served from there when no database copy exists.
 * Raster formats only — SVG can carry script, and this is served from our origin.
 */

export const LOGO_ROUTE = "/api/platform/brand-logo/";
const LOGO_COLLECTION = "brand_logos";
const MAX_BYTES = 1_000_000;
const TYPES: { type: string; ext: string; magic: (b: Buffer) => boolean }[] = [
  { type: "image/png", ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/webp", ext: "webp", magic: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP" },
];

export type LogoUploadResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadCompanyLogo(file: File): Promise<LogoUploadResult> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an image file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "Use an image under 1 MB." };
  const body = Buffer.from(await file.arrayBuffer());
  const kind = TYPES.find((t) => t.magic(body));
  if (!kind) return { ok: false, error: "Use a PNG, JPG or WebP image." };
  const filename = `${await currentCompanyId()}-${randomUUID()}.${kind.ext}`;
  try {
    await (await getDb()).collection<{ _id: string; contentType: string; data: Buffer; size: number; createdAt: Date }>(LOGO_COLLECTION).insertOne({
      _id: filename,
      contentType: kind.type,
      data: body,
      size: body.byteLength,
      createdAt: new Date(),
    });
  } catch (err) {
    console.error("[branding] logo upload failed", err);
    return { ok: false, error: "Upload failed. Please try again." };
  }
  return { ok: true, url: `${LOGO_ROUTE}${filename}` };
}

/**
 * Reads a logo for serving/embedding — only when it belongs to the current
 * company (its filename starts with the company id), so one company's host
 * can't serve another's files.
 */
export async function readCompanyLogo(filename: string): Promise<{ body: Buffer; contentType: string } | null> {
  if (!/^[0-9a-f-]{36}-[0-9a-f-]{36}\.(png|jpg|webp)$/.test(filename)) return null;
  if (!filename.startsWith(`${await currentCompanyId()}-`)) return null;
  // The copy in the company's database first (it is what new uploads write).
  const stored = await (await getDb()).collection<{ _id: string; contentType: string; data: unknown }>(LOGO_COLLECTION).findOne({ _id: filename }).catch(() => null);
  if (stored?.data) {
    const raw = stored.data as { buffer?: Uint8Array; position?: number } | Uint8Array;
    const bytes = raw instanceof Uint8Array ? raw : raw.buffer ? raw.buffer.subarray(0, raw.position ?? raw.buffer.length) : null;
    if (bytes && bytes.length > 0) return { body: Buffer.from(bytes), contentType: stored.contentType };
  }
  // Older uploads live in Blob.
  const obj = await getObject(`branding/${filename}`).catch(() => null);
  if (!obj) return null;
  const chunks: Uint8Array[] = [];
  const reader = obj.stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return { body: Buffer.concat(chunks), contentType: obj.contentType };
}
