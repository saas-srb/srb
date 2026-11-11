import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";

/**
 * Pure core of the encryption keyring (no server-only imports, no database): URI normalisation, KEK derivation, key wrapping and
 * the boot decision. The runtime (`index.ts`) feeds it the environment and the stored document.
 *
 * The keyring holds every version of the platform encryption key in the database, each WRAPPED with a key-encryption key (KEK)
 * derived from MONGODB_URI (credentials included) + SAAS_HOSTS. So a deployment that has only those two values can open everything.
 */

export interface Wrapped {
  c: string;
  iv: string;
  t: string;
}

export interface KeyEntry {
  /** Deterministic id: first 8 hex of sha256 of the key (the same key always has the same id). */
  id: string;
  version: number;
  createdAt: Date;
  status: "active" | "retired";
  source: "env" | "generated" | "env-adopted";
  wrapped: Wrapped;
  /** Set for a PRODUCT key (HRMS, FMS, DLMS, SMMS legacy keys): used directly for that purpose only, never as a root. */
  purpose?: string;
}

export interface KeyringDoc {
  _id: "keyring";
  format: 1;
  keys: KeyEntry[];
  updatedAt: Date;
}

export type OpenKey = { id: string; key: Buffer; status: "active" | "retired"; version: number; purpose?: string };

export type KeyringOutcome =
  | { state: "ok"; keys: { id: string; key: Buffer; status: "active" | "retired"; version: number }[]; products?: OpenKey[]; write: KeyringDoc | null; action: "none" | "escrowed" | "unwrapped" | "generated" | "added-version" }
  | { state: "needs_old_key"; keys: [] }
  | { state: "cannot_unwrap"; keys: { id: string; key: Buffer; status: "active" | "retired"; version: number }[]; reason: string };

export const keyId = (key: Buffer): string => createHash("sha256").update("selfrun-kid:").update(key).digest("hex").slice(0, 8);

/** `mongodb://user:pw@b:27017,a:27017/db?opts` → a form that ignores host order, options and letter case of hosts. Credentials are part of it. */
export function normalizeMongoUri(uri: string): string {
  const m = /^(mongodb(?:\+srv)?):\/\/(?:([^@/]*)@)?([^/?]+)(?:\/([^?]*))?(?:\?.*)?$/i.exec(uri.trim());
  if (!m) return uri.trim();
  const decode = (s: string) => {
    try {
      return decodeURIComponent(s);
    } catch {
      return s;
    }
  };
  const creds = m[2] === undefined ? "" : m[2].split(":").map(decode).join(":");
  const hosts = m[3].split(",").map((h) => h.trim().toLowerCase()).filter(Boolean).sort().join(",");
  return `${m[1].toLowerCase()}://${creds}@${hosts}/${decode(m[4] ?? "")}`;
}

export function normalizeHosts(saasHosts: string | undefined | null): string {
  return [...new Set((saasHosts ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean))].sort().join(",");
}

/** The key-encryption key: scrypt over the normalised URI and hosts with a fixed context label. */
export function deriveKek(mongoUri: string, saasHosts: string | undefined | null): Buffer {
  return scryptSync(`${normalizeMongoUri(mongoUri)}\n${normalizeHosts(saasHosts)}`, "selfrun:platform-keyring:kek:v1", 32, { N: 16384, r: 8, p: 1 });
}

export function wrapKey(kek: Buffer, key: Buffer, id: string): Wrapped {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", kek, iv);
  cipher.setAAD(Buffer.from(`keyring:${id}`));
  const c = Buffer.concat([cipher.update(key), cipher.final()]);
  return { c: c.toString("base64"), iv: iv.toString("base64"), t: cipher.getAuthTag().toString("base64") };
}

/** Null when the KEK is wrong or the data was altered. */
export function unwrapKey(kek: Buffer, w: Wrapped, id: string): Buffer | null {
  try {
    const d = createDecipheriv("aes-256-gcm", kek, Buffer.from(w.iv, "base64"));
    d.setAAD(Buffer.from(`keyring:${id}`));
    d.setAuthTag(Buffer.from(w.t, "base64"));
    const key = Buffer.concat([d.update(Buffer.from(w.c, "base64")), d.final()]);
    return key.length === 32 && keyId(key) === id.split(":").pop() ? key : null;
  } catch {
    return null;
  }
}

export function parseEnvKey(raw: string | undefined | null): Buffer | null {
  const v = raw?.trim();
  if (!v) return null;
  const key = Buffer.from(v, "base64");
  return key.length === 32 ? key : null;
}

function entry(kek: Buffer, key: Buffer, version: number, source: KeyEntry["source"], now: Date): KeyEntry {
  const id = keyId(key);
  return { id, version, createdAt: now, status: "active", source, wrapped: wrapKey(kek, key, id) };
}

/**
 * The boot decision (cases a to e).
 *   env key + no keyring            -> escrow it as version 1
 *   no env key + keyring            -> unwrap and use it
 *   no env key + no keyring, empty DB -> generate and escrow
 *   no env key + no keyring, data in DB -> needs_old_key (never generate: it would orphan the data)
 *   env key not in the keyring      -> add as a NEW active version, old versions kept for decrypting
 *   keyring can't be opened (URI rotated) -> cannot_unwrap; the env key, if any, is still usable but nothing is overwritten
 */
export function resolveKeyring(input: { envKey: Buffer | null; doc: KeyringDoc | null; kek: Buffer; dbHasData: boolean; now?: Date }): KeyringOutcome {
  const { envKey, doc, kek } = input;
  const now = input.now ?? new Date();
  if (!doc || doc.keys.length === 0) {
    if (envKey) {
      const e = entry(kek, envKey, 1, "env", now);
      return { state: "ok", keys: [{ id: e.id, key: envKey, status: "active", version: 1 }], write: { _id: "keyring", format: 1, keys: [e], updatedAt: now }, action: "escrowed" };
    }
    if (input.dbHasData) return { state: "needs_old_key", keys: [] };
    const key = randomBytes(32);
    const e = entry(kek, key, 1, "generated", now);
    return { state: "ok", keys: [{ id: e.id, key, status: "active", version: 1 }], write: { _id: "keyring", format: 1, keys: [e], updatedAt: now }, action: "generated" };
  }
  const opened: { id: string; key: Buffer; status: "active" | "retired"; version: number }[] = [];
  const products: OpenKey[] = [];
  let failed = 0;
  for (const k of doc.keys) {
    const key = unwrapKey(kek, k.wrapped, k.purpose ? `${k.purpose}:${k.id}` : k.id);
    if (!key) failed++;
    else if (k.purpose) products.push({ id: k.id, key, status: k.status, version: k.version, purpose: k.purpose });
    else opened.push({ id: k.id, key, status: k.status, version: k.version });
  }
  if (failed > 0) {
    // Some or all keys can't be opened with this URI + hosts. Keep what opens, add the env key (not stored) so the app can still run.
    const usable = [...opened];
    if (envKey && !usable.some((u) => u.id === keyId(envKey))) usable.unshift({ id: keyId(envKey), key: envKey, status: "active", version: 0 });
    return { state: "cannot_unwrap", keys: usable, reason: "The keyring in the database can't be opened with the current MONGODB_URI / SAAS_HOSTS (were the database credentials rotated?). Run `npm run key:rewrap`." };
  }
  if (envKey && !opened.some((o) => o.id === keyId(envKey))) {
    const version = Math.max(0, ...doc.keys.filter((k) => !k.purpose).map((k) => k.version)) + 1;
    const e = entry(kek, envKey, version, "env", now);
    const keys = [...doc.keys.map((k) => (k.purpose ? k : { ...k, status: "retired" as const })), e];
    const merged: { id: string; key: Buffer; status: "active" | "retired"; version: number }[] = [...opened.map((o) => ({ ...o, status: "retired" as const })), { id: e.id, key: envKey, status: "active" as const, version }];
    return {
      state: "ok",
      keys: merged.sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.version - a.version)),
      products,
      write: { _id: "keyring", format: 1, keys, updatedAt: now },
      action: "added-version",
    };
  }
  opened.sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.version - a.version));
  return { state: "ok", keys: opened, products, write: null, action: envKey ? "none" : "unwrapped" };
}

/** Re-wraps every key with a new KEK (database credentials rotated). Null when the old KEK can't open them. */
export function rewrapDoc(doc: KeyringDoc, oldKek: Buffer, newKek: Buffer, now = new Date()): KeyringDoc | null {
  const keys: KeyEntry[] = [];
  for (const k of doc.keys) {
    const aad = k.purpose ? `${k.purpose}:${k.id}` : k.id;
    const key = unwrapKey(oldKek, k.wrapped, aad);
    if (!key) return null;
    keys.push({ ...k, wrapped: wrapKey(newKek, key, aad) });
  }
  return { ...doc, keys, updatedAt: now };
}

/** The key that signs/encrypts new data. */
export const pickActive = <T extends { status: "active" | "retired" }>(keys: T[]): T | null => keys.find((k) => k.status === "active") ?? keys[0] ?? null;

export interface ExtraKey {
  /** `null` = another ROOT key version (e.g. PLATFORM_ENCRYPTION_KEY_PREVIOUS); otherwise the product the key belongs to ("hrms", "fms", "dlms", "smms"). */
  purpose: string | null;
  key: Buffer;
  /** A *_PREVIOUS key: kept for decrypting, never the one new data is sealed with. */
  previous: boolean;
}

/**
 * Adds keys found in the environment (legacy per-product keys, *_PREVIOUS) to the keyring as extra versions. Existing entries are never
 * touched or removed; a key already present is skipped. Returns null when there is nothing new.
 */
export function addExtraKeys(doc: KeyringDoc, kek: Buffer, extras: ExtraKey[], now = new Date()): KeyringDoc | null {
  const keys = [...doc.keys];
  let changed = false;
  for (const x of extras) {
    const id = keyId(x.key);
    if (keys.some((k) => (k.purpose ?? null) === x.purpose && k.id === id)) continue;
    const aad = x.purpose ? `${x.purpose}:${id}` : id;
    const version = Math.max(0, ...keys.filter((k) => (k.purpose ?? null) === x.purpose).map((k) => k.version)) + 1;
    keys.push({ id, version, createdAt: now, status: x.previous ? "retired" : x.purpose ? "active" : "retired", source: "env-adopted", wrapped: wrapKey(kek, x.key, aad), ...(x.purpose ? { purpose: x.purpose } : {}) });
    changed = true;
  }
  return changed ? { ...doc, keys, updatedAt: now } : null;
}
