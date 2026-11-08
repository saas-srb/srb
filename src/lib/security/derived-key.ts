import { hkdfSync } from "node:crypto";

/**
 * The 32-byte key a product encrypts its own sensitive fields with (bank details, finance accounts, Digi Locker credentials, social
 * tokens). It is derived from `PLATFORM_ENCRYPTION_KEY` with HKDF, one independent key per purpose, so a single secret is all a
 * deployment sets. A deployment that already set the old per-product variable (`legacyEnv`) keeps using it, so stored data stays readable.
 * Returns null when neither is set. Changing `PLATFORM_ENCRYPTION_KEY` makes everything encrypted with it unreadable.
 */
export function derivedKey(purpose: string, legacyEnv: string): Buffer | null {
  const legacy = process.env[legacyEnv];
  if (legacy) {
    const key = Buffer.from(legacy, "base64");
    if (key.length !== 32) throw new Error(`${legacyEnv} must be a base64-encoded 32-byte key (openssl rand -base64 32).`);
    return key;
  }
  const root = process.env.PLATFORM_ENCRYPTION_KEY;
  if (!root) return null;
  const secret = Buffer.from(root, "base64");
  if (secret.length !== 32) throw new Error("PLATFORM_ENCRYPTION_KEY must be a base64-encoded 32-byte key (openssl rand -base64 32).");
  return Buffer.from(hkdfSync("sha256", secret, Buffer.alloc(0), `selfrun:${purpose}`, 32));
}

export function derivedKeyConfigured(legacyEnv: string): boolean {
  return Boolean(process.env[legacyEnv] || process.env.PLATFORM_ENCRYPTION_KEY);
}
