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
  /** `verified` = it opens existing ciphertext, or was made on a database that had none. `unverified` = escrowed on a database whose ciphertext it does not open: decrypt-only, never made active silently. Absent (older documents) = verified. */
  verification?: "verified" | "unverified";
  /** A small canary sealed with this key itself: detects a corrupt or mismatched key at once. */
  check?: Wrapped;
  /** Set for a PRODUCT key (HRMS, FMS, DLMS, SMMS legacy keys): used directly for that purpose only, never as a root. */
  purpose?: string;
}

export interface KeyringDoc {
  _id: "keyring";
  format: 1;
  keys: KeyEntry[];
  updatedAt: Date;
}

export type OpenKey = { id: string; key: Buffer; status: "active" | "retired"; version: number; purpose?: string; verification?: "verified" | "unverified" };
type RingKey = { id: string; key: Buffer; status: "active" | "retired"; version: number; verification?: "verified" | "unverified" };

export type KeyringOutcome =
  | { state: "ok"; keys: RingKey[]; products?: OpenKey[]; write: KeyringDoc | null; action: "none" | "escrowed" | "unwrapped" | "generated" | "added-version" }
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

const CANARY = Buffer.from("selfrun-keyring-canary");

function sealCheck(key: Buffer, id: string): Wrapped {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(`keyring-check:${id}`));
  const ct = Buffer.concat([c.update(CANARY), c.final()]);
  return { c: ct.toString("base64"), iv: iv.toString("base64"), t: c.getAuthTag().toString("base64") };
}

/** True when the canary opens with this key (entries without one, from older documents, pass). */
export function checkKeyCanary(key: Buffer, id: string, check: Wrapped | undefined): boolean {
  if (!check) return true;
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(check.iv, "base64"));
    d.setAAD(Buffer.from(`keyring-check:${id}`));
    d.setAuthTag(Buffer.from(check.t, "base64"));
    return Buffer.concat([d.update(Buffer.from(check.c, "base64")), d.final()]).equals(CANARY);
  } catch {
    return false;
  }
}

function entry(kek: Buffer, key: Buffer, version: number, source: KeyEntry["source"], now: Date, verification: "verified" | "unverified" = "verified", status: "active" | "retired" = "active"): KeyEntry {
  const id = keyId(key);
  return { id, version, createdAt: now, status, source, verification, check: sealCheck(key, id), wrapped: wrapKey(kek, key, id) };
}

/**
 * Evidence from the ciphertext that already exists in the database (built by the runtime from known locations such as the admin
 * authenticator secrets, the Console's saved keys and the payment accounts; each has a known context, so a wrong key is provable).
 */
export interface Probe {
  /** How many known-context ciphertexts exist. 0 = nothing to prove anything with. */
  testable: number;
  /** How many of them `key` opens. With `excludeSelf`, not counting those it sealed itself (for a key already stored: data it sealed while it was a fallback proves nothing about older data). */
  opens(key: Buffer, excludeSelf?: boolean): number;
  /** How many known-context ciphertexts none of `keys` opens. */
  unopenable(keys: Buffer[]): number;
}

const byActive = (a: RingKey, b: RingKey) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.version - a.version);

/**
 * The boot decision.
 *   env key + no keyring            -> escrow it as version 1 (`unverified` when the DB has ciphertext it does not open)
 *   no env key + keyring            -> unwrap and use it
 *   no env key + no keyring, empty DB -> generate and escrow
 *   no env key + no keyring, data in DB -> needs_old_key (never generate: it would orphan the data)
 *   env key not in the keyring      -> opens existing ciphertext (or none exists): a NEW active version, old kept for decrypting.
 *                                      Opens none of it: stored `unverified`, decrypt-only, the active key is NOT changed
 *   a key that later opens existing ciphertext -> promoted to verified and active
 *   keyring can't be opened (URI rotated) -> cannot_unwrap ("locked"): read-only, nothing is ever written
 */
export function resolveKeyring(input: { envKey: Buffer | null; doc: KeyringDoc | null; kek: Buffer; dbHasData: boolean; probe?: Probe | null; now?: Date }): KeyringOutcome {
  const { envKey, doc, kek, probe } = input;
  const now = input.now ?? new Date();
  const verdict = (key: Buffer): "verified" | "unverified" => (!probe || probe.testable === 0 || probe.opens(key) > 0 ? "verified" : "unverified");
  if (!doc || doc.keys.length === 0) {
    if (envKey) {
      const e = entry(kek, envKey, 1, "env", now, verdict(envKey));
      return { state: "ok", keys: [{ id: e.id, key: envKey, status: "active", version: 1, verification: e.verification }], write: { _id: "keyring", format: 1, keys: [e], updatedAt: now }, action: "escrowed" };
    }
    if (input.dbHasData) return { state: "needs_old_key", keys: [] };
    const key = randomBytes(32);
    const e = entry(kek, key, 1, "generated", now);
    return { state: "ok", keys: [{ id: e.id, key, status: "active", version: 1, verification: "verified" }], write: { _id: "keyring", format: 1, keys: [e], updatedAt: now }, action: "generated" };
  }
  const opened: RingKey[] = [];
  const products: OpenKey[] = [];
  let failed = 0;
  for (const k of doc.keys) {
    const key = unwrapKey(kek, k.wrapped, k.purpose ? `${k.purpose}:${k.id}` : k.id);
    if (!key || !checkKeyCanary(key, k.id, k.check)) failed++;
    else if (k.purpose) products.push({ id: k.id, key, status: k.status, version: k.version, purpose: k.purpose, verification: k.verification });
    else opened.push({ id: k.id, key, status: k.status, version: k.version, verification: k.verification ?? (probe && !k.purpose ? verdict(key) : "verified") });
  }
  if (failed > 0) {
    // Locked: this URI + hosts can't open the stored keys. Nothing is written, ever; keys that do open (and the env key) keep the app readable.
    const usable = [...opened];
    if (envKey && !usable.some((u) => u.id === keyId(envKey))) usable.unshift({ id: keyId(envKey), key: envKey, status: "active", version: 0, verification: "unverified" });
    return { state: "cannot_unwrap", keys: usable, reason: "The keyring in the database can't be opened with the current MONGODB_URI / SAAS_HOSTS (were the database credentials rotated?). The app is read-only for keys and writes nothing to the keyring. Run `npm run key:rewrap`." };
  }

  let entries = doc.keys.map((k) => ({ ...k }));
  let changed = false;
  // Entries written before verification existed are judged now (a key that was escrowed from a wrong environment is caught here).
  for (const o of opened) if (!doc.keys.find((k) => k.id === o.id && !k.purpose)?.verification && probe) { entries = entries.map((e) => (!e.purpose && e.id === o.id ? { ...e, verification: o.verification, check: e.check ?? sealCheck(o.key, e.id) } : e)); changed = true; }
  const setState = (id: string, patch: Partial<KeyEntry>) => {
    entries = entries.map((e) => (!e.purpose && e.id === id ? { ...e, ...patch } : e));
    changed = true;
  };
  // 1. A key that was unverified and now opens existing ciphertext becomes verified.
  const promoted: string[] = [];
  for (const o of opened) if (o.verification === "unverified" && probe && probe.opens(o.key, true) > 0) promoted.push(o.id);
  for (const id of promoted) setState(id, { verification: "verified" });
  let action: "none" | "unwrapped" | "added-version" = envKey ? "none" : "unwrapped";
  let newActive: string | null = promoted.length ? promoted[promoted.length - 1] : null;
  // 2. A new env key.
  if (envKey && !opened.some((o) => o.id === keyId(envKey))) {
    const version = Math.max(0, ...doc.keys.filter((k) => !k.purpose).map((k) => k.version)) + 1;
    const v = verdict(envKey);
    const e = entry(kek, envKey, version, "env", now, v, v === "verified" ? "active" : "retired");
    entries.push(e);
    changed = true;
    action = "added-version";
    if (v === "verified") newActive = e.id;
  }
  if (newActive) entries = entries.map((e) => (e.purpose ? e : { ...e, status: e.id === newActive ? "active" : "retired" }));
  const ring: RingKey[] = entries.filter((e) => !e.purpose).map((e) => ({ id: e.id, key: opened.find((o) => o.id === e.id)?.key ?? envKey!, status: e.status, version: e.version, verification: e.verification ?? "verified" }));
  ring.sort(byActive);
  const write: KeyringDoc | null = changed ? { ...doc, keys: entries, updatedAt: now } : null;
  return { state: "ok", keys: ring, products, write, action };
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

/** Makes `key` the new ACTIVE verified root key (rotation, or an owner-supplied previous key); every other version is kept, decrypt-only. Null when it is already in the keyring (it is then just re-activated if verified). */
export function addRootKey(doc: KeyringDoc, kek: Buffer, key: Buffer, source: KeyEntry["source"], now = new Date()): KeyringDoc {
  const id = keyId(key);
  const existing = doc.keys.find((k) => !k.purpose && k.id === id);
  const version = Math.max(0, ...doc.keys.filter((k) => !k.purpose).map((k) => k.version)) + 1;
  const keys = doc.keys.map((k) => (k.purpose ? k : { ...k, status: "retired" as const, ...(existing && k.id === id ? { status: "active" as const, verification: "verified" as const } : {}) }));
  if (!existing) keys.push(entry(kek, key, version, source, now, "verified", "active"));
  return { ...doc, keys, updatedAt: now };
}

// ── Recovery passphrase ──────────────────────────────────────────────────────

export interface PassphraseWrap {
  salt: string;
  wrapped: Wrapped;
}

/** An extra copy of ALL keys, sealed with a key derived from a passphrase the owner keeps, so a changed database URI can still be healed. */
export function wrapWithPassphrase(keys: { id: string; key: Buffer }[], passphrase: string): PassphraseWrap {
  const salt = randomBytes(16);
  const kek = scryptSync(passphrase, salt, 32, { N: 16384, r: 8, p: 1 });
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kek, iv);
  c.setAAD(Buffer.from("keyring-passphrase"));
  const ct = Buffer.concat([c.update(JSON.stringify(keys.map((k) => ({ id: k.id, key: k.key.toString("base64") })))), c.final()]);
  return { salt: salt.toString("base64"), wrapped: { c: ct.toString("base64"), iv: iv.toString("base64"), t: c.getAuthTag().toString("base64") } };
}

export function unwrapWithPassphrase(w: PassphraseWrap, passphrase: string): { id: string; key: Buffer }[] | null {
  try {
    const kek = scryptSync(passphrase, Buffer.from(w.salt, "base64"), 32, { N: 16384, r: 8, p: 1 });
    const d = createDecipheriv("aes-256-gcm", kek, Buffer.from(w.wrapped.iv, "base64"));
    d.setAAD(Buffer.from("keyring-passphrase"));
    d.setAuthTag(Buffer.from(w.wrapped.t, "base64"));
    const list = JSON.parse(Buffer.concat([d.update(Buffer.from(w.wrapped.c, "base64")), d.final()]).toString()) as { id: string; key: string }[];
    return list.map((x) => ({ id: x.id, key: Buffer.from(x.key, "base64") }));
  } catch {
    return null;
  }
}

/** Rebuilds the keyring document under a new KEK from the passphrase copy (the old URI is gone). Null when the passphrase is wrong. */
export function healFromPassphrase(wrap: PassphraseWrap, passphrase: string, newKek: Buffer, now = new Date()): KeyringDoc | null {
  const list = unwrapWithPassphrase(wrap, passphrase);
  if (!list?.length) return null;
  const keys = list.map((k, i) => ({ ...entry(newKek, k.key, i + 1, "env", now, "verified", i === list.length - 1 ? "active" : "retired") }));
  return { _id: "keyring", format: 1, keys, updatedAt: now };
}
