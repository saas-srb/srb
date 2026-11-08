import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { derivedKey, derivedKeyConfigured } from "@/lib/security/derived-key";

/**
 * App-level field encryption for employee bank details. AES-256-GCM, keyed by
 * `HRMS_ENCRYPTION_KEY` (base64, 32 bytes). Only the account number and UPI ID
 * are ever encrypted; a plaintext last-4 is kept for lists/CSV.
 *
 * Key rotation: to rotate, keep the old key, decrypt every `hrms_bank_accounts`
 * row and re-encrypt with the new key, then swap `HRMS_ENCRYPTION_KEY`.
 */

export interface EncryptedValue {
  c: string; // ciphertext (base64)
  iv: string; // 12-byte nonce (base64)
  t: string; // GCM auth tag (base64)
}

const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  return derivedKey("hrms", "HRMS_ENCRYPTION_KEY");
}

export function isEncryptionConfigured(): boolean {
  return derivedKeyConfigured("HRMS_ENCRYPTION_KEY");
}

export function encryptField(plain: string): EncryptedValue {
  const key = getKey();
  if (!key) {
    throw new Error("MISSING_ENCRYPTION_KEY");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { c: ciphertext.toString("base64"), iv: iv.toString("base64"), t: tag.toString("base64") };
}

/** Never throws into a render — bad key / tampered data returns null and logs. */
export function decryptField(value: EncryptedValue | null | undefined): string | null {
  if (!value) return null;
  try {
    const key = getKey();
    if (!key) return null;
    const decipher = createDecipheriv(ALGO, key, Buffer.from(value.iv, "base64"));
    decipher.setAuthTag(Buffer.from(value.t, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(value.c, "base64")), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("hrms/crypto: failed to decrypt a field", err);
    return null;
  }
}

export function last4Of(value: string): string {
  const digits = value.replace(/\s+/g, "");
  return digits.length <= 4 ? digits : digits.slice(-4);
}

export function maskAccountNumber(last4: string | null | undefined): string {
  if (!last4) return "—";
  return `XXXXXX${last4}`;
}
