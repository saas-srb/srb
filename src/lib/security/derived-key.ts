import { hkdfSync } from "node:crypto";
import { activeRootKey, allRootKeys, productKeysFor } from "@/lib/platform/keyring";

/**
 * The 32-byte key a product encrypts its own sensitive fields with (bank details, finance accounts, Digi Locker credentials, social
 * tokens). It is derived from `PLATFORM_ENCRYPTION_KEY` with HKDF, one independent key per purpose, so one keyring key (kept wrapped in the database)
 * is all that exists. A deployment that already set the old per-product variable (`legacyEnv`) keeps using it, so stored data stays readable.
 * Returns null when neither is set. Older keyring versions stay available for decrypting (`derivedKeys`).
 */
export function derivedKey(purpose: string, legacyEnv: string): Buffer | null {
  return derivedKeys(purpose, legacyEnv)[0] ?? null;
}

/** Every key a product may have sealed data with, the one for new data first: the old per-product variable (when set), then one per keyring version. */
export function derivedKeys(purpose: string, legacyEnv: string): Buffer[] {
  const out: Buffer[] = [];
  const legacy = process.env[legacyEnv];
  if (legacy) {
    const key = Buffer.from(legacy, "base64");
    if (key.length !== 32) throw new Error(`${legacyEnv} must be a base64-encoded 32-byte key (openssl rand -base64 32).`);
    out.push(key);
  }
  // Legacy product keys adopted into the keyring (a deployment that no longer has the old environment variable).
  for (const k of productKeysFor(purpose)) if (!out.some((o) => o.equals(k))) out.push(k);
  for (const root of allRootKeys()) out.push(Buffer.from(hkdfSync("sha256", root, Buffer.alloc(0), `selfrun:${purpose}`, 32)));
  return out;
}

export function derivedKeyConfigured(legacyEnv: string): boolean {
  return Boolean(process.env[legacyEnv]) || activeRootKey() !== null || productKeysFor(legacyEnv.split("_")[0].toLowerCase()).length > 0;
}
