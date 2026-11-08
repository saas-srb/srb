import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Secrets the platform stores in the database (Razorpay keys, email and
 * domain provider tokens, company payment accounts) are encrypted at rest
 * with AES-256-GCM keyed by `PLATFORM_ENCRYPTION_KEY` (server-only env,
 * base64 of 32 bytes). `context` is bound as additional authenticated data,
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
}

const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  const raw = process.env.PLATFORM_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("PLATFORM_ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32).");
  return key;
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
  return { c: ciphertext.toString("base64"), iv: iv.toString("base64"), t: cipher.getAuthTag().toString("base64") };
}

/** Never throws — a missing/wrong key or tampered data returns null (and logs the context, never the value). */
export function decryptPlatformSecret(value: EncryptedValue | null | undefined, context: string): string | null {
  if (!value) return null;
  try {
    const key = getKey();
    if (!key) return null;
    const decipher = createDecipheriv(ALGO, key, Buffer.from(value.iv, "base64"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(value.t, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(value.c, "base64")), decipher.final()]).toString("utf8");
  } catch {
    console.error(`platform/crypto: failed to decrypt ${context}`);
    return null;
  }
}

export function last4(value: string): string {
  return value.length <= 4 ? value : value.slice(-4);
}
