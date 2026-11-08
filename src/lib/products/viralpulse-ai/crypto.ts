import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from "node:crypto";
import { derivedKey } from "@/lib/security/derived-key";

/**
 * App-level secret encryption for SMMS platform tokens: AES-256-GCM keyed by
 * `SMMS_ENCRYPTION_KEY` (base64, 32 bytes — `openssl rand -base64 32`). A
 * deliberate per-module copy of the FMS/HRMS helper: key material for one
 * module's secrets is never shared with another's, so rotating one never
 * touches the others. Each value carries its own random IV and auth tag, and
 * the record id is bound in as additional authenticated data so a ciphertext
 * can't be copied onto a different record.
 *
 * The plaintext is only ever produced by `decryptSecret`, called from the one
 * place a token is used (see `integrations.ts`); it is never logged or sent to a list.
 *
 * Key rotation: every value records the id of the key that sealed it (`k`, a short hash of the key, never the key). To rotate, set
 * the new key as `PLATFORM_ENCRYPTION_KEY` (or `SMMS_ENCRYPTION_KEY`) and keep the old one in `SMMS_ENCRYPTION_KEY_PREVIOUS`
 * (base64 32 bytes) or `PLATFORM_ENCRYPTION_KEY_PREVIOUS` (the old root key). Values sealed with the old key still open, and the
 * accounts sweep re-seals them with the new key (`isSealedWithCurrentKey` / `resealSecret`); once none are stale, drop the old key.
 */

export interface EncryptedValue {
  c: string; // ciphertext (base64)
  iv: string; // 12-byte nonce (base64)
  t: string; // GCM auth tag (base64)
  k?: string; // id of the key that sealed it (absent on values written before key ids existed)
}

const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  return derivedKey("smms", "SMMS_ENCRYPTION_KEY");
}

const keyIdOf = (key: Buffer): string => createHash("sha256").update("smms-kid:").update(key).digest("hex").slice(0, 8);

function previousKeys(): Buffer[] {
  const out: Buffer[] = [];
  const direct = process.env.SMMS_ENCRYPTION_KEY_PREVIOUS;
  if (direct) {
    const k = Buffer.from(direct, "base64");
    if (k.length === 32) out.push(k);
  }
  const root = process.env.PLATFORM_ENCRYPTION_KEY_PREVIOUS;
  if (root) {
    const secret = Buffer.from(root, "base64");
    if (secret.length === 32) out.push(Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), "selfrun:smms", 32)));
  }
  return out;
}

/** Id of the key new values are sealed with, or null when no key is configured. */
export function currentKeyId(): string | null {
  try {
    const k = getKey();
    return k ? keyIdOf(k) : null;
  } catch {
    return null;
  }
}

export function isEncryptionConfigured(): boolean {
  try {
    return getKey() !== null;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string, recordId: string): EncryptedValue {
  const key = getKey();
  if (!key) throw new Error("MISSING_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(recordId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { c: ciphertext.toString("base64"), iv: iv.toString("base64"), t: cipher.getAuthTag().toString("base64"), k: keyIdOf(key) };
}

/** True when the value was sealed with the key currently in use (false = it should be re-sealed after a rotation). */
export function isSealedWithCurrentKey(value: EncryptedValue | null | undefined): boolean {
  return !value || (value.k !== undefined && value.k === currentKeyId());
}

/** Opens a value (with whichever configured key sealed it) and seals it again with the current key, binding it to `newRecordId`. */
export function resealSecret(value: EncryptedValue, recordId: string, newRecordId: string = recordId): EncryptedValue | null {
  const plain = decryptSecret(value, recordId);
  return plain === null ? null : encryptSecret(plain, newRecordId);
}

/** Never throws into a render — a bad key or tampered data returns null (and logs the failure, not the value). */
export function decryptSecret(value: EncryptedValue | null | undefined, recordId: string): string | null {
  if (!value) return null;
  try {
    const current = getKey();
    if (!current) return null;
    const candidates = [current, ...previousKeys()].filter((k) => !value.k || keyIdOf(k) === value.k);
    for (const key of candidates) {
      try {
        const decipher = createDecipheriv(ALGO, key, Buffer.from(value.iv, "base64"));
        decipher.setAAD(Buffer.from(recordId, "utf8"));
        decipher.setAuthTag(Buffer.from(value.t, "base64"));
        return Buffer.concat([decipher.update(Buffer.from(value.c, "base64")), decipher.final()]).toString("utf8");
      } catch {
        // wrong key or tampered: try the next candidate
      }
    }
  } catch {
    // fall through
  }
  console.error("smms/crypto: failed to decrypt a stored secret");
  return null;
}

/**
 * Short-lived signed URLs for handing a PRIVATE media file to a platform that
 * fetches media by URL (Instagram, Facebook, Google Business Profile). The HMAC
 * key is derived from the encryption key, so nothing extra has to be configured.
 */
function signingKey(): Buffer | null {
  const key = getKey();
  return key ? createHmac("sha256", key).update("smms-media-url").digest() : null;
}

export function signMediaToken(mediaId: string, expiresAt: number): string | null {
  const key = signingKey();
  if (!key) return null;
  return createHmac("sha256", key).update(`${mediaId}.${expiresAt}`).digest("base64url");
}

export function verifyMediaToken(mediaId: string, expiresAt: number, sig: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = signMediaToken(mediaId, expiresAt);
  if (!expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
