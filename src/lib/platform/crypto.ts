import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { activeRootKey, activeRootKeyId, allRootKeys, rootKeyById } from "@/lib/platform/keyring";

/**
 * Secrets the platform stores in the database (Razorpay keys, email and
 * domain provider tokens, company payment accounts) are encrypted at rest
 * with AES-256-GCM keyed by the platform keyring (see `keyring/`): the key lives wrapped in the database, so a new deployment
 * needs nothing but MONGODB_URI and SAAS_HOSTS. Each ciphertext names its key version (`k`); older ciphertext without one is tried
 * against every version. `context` is bound as additional authenticated data,
 * so a ciphertext copied to another record or field fails to decrypt —
 * use a stable, specific string, e.g. `billing:razorpay:keySecret` or
 * `payments:razorpay:<companyId>:keySecret`.
 *
 * Never send a decrypted value (or the ciphertext) to the browser; show
 * `last4()` instead.
 */

export interface EncryptedValue {
  c: string; // ciphertext (base64)
  iv: string; // 12-byte nonce (base64)
  t: string; // GCM auth tag (base64)
  k?: string; // id of the key version that sealed it
}

const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  return activeRootKey();
}

export function isPlatformEncryptionConfigured(): boolean {
  try {
    return getKey() !== null;
  } catch {
    return false;
  }
}

/** Throws MISSING_ENCRYPTION_KEY when the key isn't set — callers should check `isPlatformEncryptionConfigured()` first and show a clear message. */
export function encryptPlatformSecret(plain: string, context: string): EncryptedValue {
  const key = getKey();
  if (!key) throw new Error("MISSING_ENCRYPTION_KEY");
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const k = activeRootKeyId();
  return { c: ciphertext.toString("base64"), iv: iv.toString("base64"), t: cipher.getAuthTag().toString("base64"), ...(k ? { k } : {}) };
}

/** Never throws — a missing/wrong key or tampered data returns null (and logs the context, never the value). */
export function decryptPlatformSecret(value: EncryptedValue | null | undefined, context: string): string | null {
  if (!value) return null;
  try {
    const named = value.k ? rootKeyById(value.k) : null;
    const candidates = named ? [named] : allRootKeys();
    for (const key of candidates) {
      try {
        const decipher = createDecipheriv(ALGO, key, Buffer.from(value.iv, "base64"));
        decipher.setAAD(Buffer.from(context, "utf8"));
        decipher.setAuthTag(Buffer.from(value.t, "base64"));
        return Buffer.concat([decipher.update(Buffer.from(value.c, "base64")), decipher.final()]).toString("utf8");
      } catch {
        // another version may have sealed it
      }
    }
    throw new Error("no key opens it");
  } catch {
    console.error(`platform/crypto: failed to decrypt ${context}`);
    return null;
  }
}

/** True when `value` opens with some key of the keyring. Never logs; for telling "key mismatch" apart from "wrong input". */
export function canOpenPlatformSecret(value: EncryptedValue | null | undefined, context: string): boolean {
  if (!value) return false;
  const named = value.k ? rootKeyById(value.k) : null;
  for (const key of named ? [named] : allRootKeys()) {
    try {
      const d = createDecipheriv(ALGO, key, Buffer.from(value.iv, "base64"));
      d.setAAD(Buffer.from(context, "utf8"));
      d.setAuthTag(Buffer.from(value.t, "base64"));
      d.update(Buffer.from(value.c, "base64"));
      d.final();
      return true;
    } catch {
      /* next key */
    }
  }
  return false;
}

export function last4(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}
