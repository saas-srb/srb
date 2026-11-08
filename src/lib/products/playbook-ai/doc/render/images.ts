import "server-only";

/** Image sniffing and size limits for rendering. PNG and JPEG only (what react-pdf and Word both draw reliably); convert others at upload. */
export const IMAGE_LIMITS = {
  maxBytes: 5 * 1024 * 1024,
  maxTotalBytes: 25 * 1024 * 1024,
  maxPixelsPerSide: 8000,
  maxImages: 100,
} as const;

export interface ImageAsset {
  bytes: Buffer;
  mime: "image/png" | "image/jpeg";
  widthPx: number;
  heightPx: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export function sniffImage(input: Uint8Array): { ok: true; asset: ImageAsset } | { ok: false; reason: string } {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 24) return { ok: false, reason: "the file is too small to be an image" };
  if (bytes.length > IMAGE_LIMITS.maxBytes) return { ok: false, reason: `the image is larger than ${IMAGE_LIMITS.maxBytes / 1024 / 1024} MB` };
  let widthPx = 0;
  let heightPx = 0;
  let mime: ImageAsset["mime"];
  if (PNG_SIG.every((b, i) => bytes[i] === b)) {
    if (bytes.toString("ascii", 12, 16) !== "IHDR") return { ok: false, reason: "the PNG is damaged" };
    mime = "image/png";
    widthPx = bytes.readUInt32BE(16);
    heightPx = bytes.readUInt32BE(20);
  } else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = "image/jpeg";
    let o = 2;
    let found = false;
    while (o + 9 < bytes.length) {
      if (bytes[o] !== 0xff) { o++; continue; }
      const marker = bytes[o + 1];
      if (marker === 0xff) { o++; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = bytes.readUInt16BE(o + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        heightPx = bytes.readUInt16BE(o + 5);
        widthPx = bytes.readUInt16BE(o + 7);
        found = true;
        break;
      }
      o += 2 + len;
    }
    if (!found) return { ok: false, reason: "the JPEG is damaged" };
  } else {
    return { ok: false, reason: "only PNG and JPEG images can be placed in a document (convert other formats when uploading)" };
  }
  if (!widthPx || !heightPx) return { ok: false, reason: "the image has no size" };
  if (widthPx > IMAGE_LIMITS.maxPixelsPerSide || heightPx > IMAGE_LIMITS.maxPixelsPerSide) return { ok: false, reason: `the image is larger than ${IMAGE_LIMITS.maxPixelsPerSide} pixels on a side` };
  return { ok: true, asset: { bytes, mime, widthPx, heightPx } };
}
