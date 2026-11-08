/**
 * What a file really is, from its first bytes. A browser's `Content-Type` and a file extension are claims; these are the checks the
 * library runs before it trusts an upload. Pure.
 */

export type SniffedKind = "jpeg" | "png" | "webp" | "gif" | "mp4" | "mov" | "webm" | null;

export const MIME_FOR: Record<Exclude<SniffedKind, null>, string> = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };

export function sniffKind(b: Uint8Array): SniffedKind {
  const at = (i: number) => b[i] ?? -1;
  const ascii = (i: number, s: string) => [...s].every((c, k) => at(i + k) === c.charCodeAt(0));
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "jpeg";
  if (at(0) === 0x89 && ascii(1, "PNG") && at(4) === 0x0d && at(5) === 0x0a && at(6) === 0x1a && at(7) === 0x0a) return "png";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "webp";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "gif";
  if (at(0) === 0x1a && at(1) === 0x45 && at(2) === 0xdf && at(3) === 0xa3) return "webm";
  if (ascii(4, "ftyp")) return ascii(8, "qt  ") ? "mov" : "mp4";
  return null;
}

/** `ok` only when the real content matches the claimed type (jpeg/jpg counted as one). */
export function matchesClaim(bytes: Uint8Array, claimedMime: string): { ok: boolean; actual: SniffedKind } {
  const actual = sniffKind(bytes);
  if (!actual) return { ok: false, actual };
  return { ok: MIME_FOR[actual] === claimedMime.split(";")[0].trim().toLowerCase(), actual };
}
