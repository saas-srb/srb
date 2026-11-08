/** Agent photo vocabulary shared by the server and the form (no server imports). */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_FOLDER = "agentos-avatars";
export const AVATAR_ACCEPT = "image/png,image/jpeg,image/webp";

export interface AvatarKind {
  type: "image/png" | "image/jpeg" | "image/webp";
  ext: "png" | "jpg" | "webp";
}

/** The image type from the file's own bytes (never from its name or the browser-reported type). Null = not an allowed image. */
export function detectAvatarKind(b: Uint8Array): AvatarKind | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { type: "image/png", ext: "png" };
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ext: "jpg" };
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(b.subarray(from, to)));
  if (b.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { type: "image/webp", ext: "webp" };
  return null;
}

export type AvatarCheck = { ok: true; kind: AvatarKind } | { ok: false; error: string };

export function checkAvatarBytes(b: Uint8Array): AvatarCheck {
  if (b.length === 0) return { ok: false, error: "Choose an image file." };
  if (b.length > AVATAR_MAX_BYTES) return { ok: false, error: `Use an image under ${AVATAR_MAX_BYTES / 1024 / 1024} MB.` };
  const kind = detectAvatarKind(b);
  if (!kind) return { ok: false, error: "Use a PNG, JPG or WebP image." };
  return { ok: true, kind };
}

/** Storage key for a new photo. The bot id is a UUID; the random part makes every upload a new immutable URL. */
export function avatarStorageKey(botId: string, uuid: string, ext: string): string {
  return `${AVATAR_FOLDER}/${botId}-${uuid}.${ext}`;
}

/** True only for keys this module could have produced for this bot (guards deletes against a tampered row). */
export function isAvatarKeyOf(botId: string, key: unknown): key is string {
  return typeof key === "string" && key.startsWith(`${AVATAR_FOLDER}/${botId}-`) && /^[\w./-]+$/.test(key) && !key.includes("..");
}

/** The authenticated URL every surface renders. `?v=` changes with each upload so browsers never show a stale photo. */
export function avatarUrlFor(botId: string, key: string | null | undefined): string | null {
  if (!key || !isAvatarKeyOf(botId, key)) return null;
  const v = key.slice(key.lastIndexOf("/") + 1 + botId.length + 1).replace(/\.\w+$/, "");
  return `/api/agentos/bots/${encodeURIComponent(botId)}/avatar?v=${encodeURIComponent(v)}`;
}
