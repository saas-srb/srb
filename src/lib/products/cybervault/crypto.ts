import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { derivedKey } from "@/lib/security/derived-key";

/**
 * App-level secret encryption for DLMS: AES-256-GCM keyed by
 * `DLMS_ENCRYPTION_KEY` (base64, 32 bytes — `openssl rand -base64 32`). A
 * deliberate per-module copy of the FMS/HRMS helper: key material for one
 * module's secrets is never shared with another's, so rotating one never
 * touches the others. Each value carries its own random IV and auth tag, and
 * the record id is bound in as additional authenticated data so a ciphertext
 * can't be copied onto a different record.
 *
 * The plaintext is only ever produced by `decryptSecret`, called from the one
 * reveal path (see `credentials.ts`); it is never logged or sent to a list.
 *
 * Key rotation: keep the old key, decrypt every `dlms_credentials.passwordEnc`
 * and re-encrypt with the new key, then swap `DLMS_ENCRYPTION_KEY`.
 */

export interface EncryptedValue {
  c: string; // ciphertext (base64)
  iv: string; // 12-byte nonce (base64)
  t: string; // GCM auth tag (base64)
}

const ALGO = "aes-256-gcm";

function getKey(): Buffer | null {
  return derivedKey("dlms", "DLMS_ENCRYPTION_KEY");
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
  return { c: ciphertext.toString("base64"), iv: iv.toString("base64"), t: cipher.getAuthTag().toString("base64") };
}

/** Never throws into a render — a bad key or tampered data returns null (and logs the failure, not the value). */
export function decryptSecret(value: EncryptedValue | null | undefined, recordId: string): string | null {
  if (!value) return null;
  try {
    const key = getKey();
    if (!key) return null;
    const decipher = createDecipheriv(ALGO, key, Buffer.from(value.iv, "base64"));
    decipher.setAAD(Buffer.from(recordId, "utf8"));
    decipher.setAuthTag(Buffer.from(value.t, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(value.c, "base64")), decipher.final()]).toString("utf8");
  } catch {
    console.error("dlms/crypto: failed to decrypt a stored secret");
    return null;
  }
}
