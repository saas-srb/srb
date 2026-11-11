import { addExtraKeys, deriveKek, parseEnvKey, pickActive, resolveKeyring, type ExtraKey, type KeyringDoc, type OpenKey } from "@/lib/platform/keyring/core";

export type KeyringAction = "none" | "escrowed" | "unwrapped" | "generated" | "added-version";

/**
 * The runtime keyring: loads (and when needed creates) the wrapped key versions in the database, keeps the unwrapped keys in this
 * instance's memory only, and offers synchronous accessors for the crypto helpers. Keys are never logged or sent anywhere.
 * Without a database connection (scripts, unit tests) the accessors fall back to the PLATFORM_ENCRYPTION_KEY environment value.
 */

export type KeyringState = "ok" | "needs_old_key" | "cannot_unwrap" | "unavailable";
export interface KeyringStatus {
  state: KeyringState;
  action: KeyringAction | null;
  message: string | null;
  versions: { id: string; version: number; status: "active" | "retired" }[];
  /** True when the environment holds PLATFORM_ENCRYPTION_KEY (informational). */
  envKeyPresent: boolean;
}

interface Loaded {
  state: KeyringState;
  keys: { id: string; key: Buffer; status: "active" | "retired"; version: number }[];
  products?: OpenKey[];
  action: KeyringAction | null;
  message: string | null;
  at: number;
}
const g = globalThis as unknown as { __keyring?: { loaded: Loaded | null; promise: Promise<Loaded> | null } };
const store = (g.__keyring ??= { loaded: null, promise: null });
const RETRY_AFTER_FAILURE_MS = 30_000;
const DOC_ID = "keyring";

async function load(): Promise<Loaded> {
  const uri = process.env.MONGODB_URI;
  if (!uri) return { state: "unavailable", keys: [], action: null, message: "MONGODB_URI is not set", at: Date.now() };
  const { clientPromise } = await import("@/lib/platform/tenancy/platform-db");
  const db = (await clientPromise).db();
  const col = db.collection<KeyringDoc>("platform_settings");
  const kek = deriveKek(uri, process.env.SAAS_HOSTS);
  const envKey = parseEnvKey(process.env.PLATFORM_ENCRYPTION_KEY);
  for (let attempt = 0; attempt < 4; attempt++) {
    const doc = await col.findOne({ _id: DOC_ID });
    let dbHasData = false;
    if (!doc) dbHasData = Boolean(await db.collection("companies").findOne({}, { projection: { _id: 1 } })) || Boolean(await col.findOne({ _id: { $ne: DOC_ID } } as never, { projection: { _id: 1 } }));
    const out = resolveKeyring({ envKey, doc, kek, dbHasData });
    if (out.state === "needs_old_key") return { state: "needs_old_key", keys: envKey ? [] : [], action: null, message: "This database already holds encrypted data but no key. Provide the old PLATFORM_ENCRYPTION_KEY once (environment variable) and redeploy; it is then stored safely in the database.", at: Date.now() };
    if (out.state === "cannot_unwrap") return { state: "cannot_unwrap", keys: out.keys, action: null, message: out.reason, at: Date.now() };
    if (out.write) {
      try {
        if (!doc) await col.insertOne(out.write);
        else {
          const res = await col.replaceOne({ _id: DOC_ID, updatedAt: doc.updatedAt }, out.write);
          if (!res.matchedCount) continue; // another instance changed it first: decide again
        }
        console.log(`[keyring] ${out.action} (versions: ${out.write.keys.length})`);
      } catch (err) {
        if ((err as { code?: number }).code === 11000) continue; // another instance created it first
        throw err;
      }
    }
    return { state: "ok", keys: out.keys, products: out.products, action: out.action, message: null, at: Date.now() };
  }
  throw new Error("keyring: could not settle after several attempts");
}

/** Loads the keyring once per instance (retried after a failure). Never throws. */
export async function ensureKeyring(): Promise<KeyringStatus> {
  const cur = store.loaded;
  if (cur && (cur.state !== "unavailable" || Date.now() - cur.at < RETRY_AFTER_FAILURE_MS)) return statusOf(cur);
  store.promise ??= load()
    .catch((err): Loaded => {
      console.error("[keyring] could not load", err instanceof Error ? err.message : err);
      return { state: "unavailable", keys: [], action: null, message: "The keyring could not be read from the database.", at: Date.now() };
    })
    .then(async (l) => {
      store.loaded = l;
      // With the keys open, settings adopted from an older environment become visible to every `process.env` read (see adopt/).
      if (l.state === "ok") await import("@/lib/platform/adopt").then((m) => m.applyAdoptedEnv()).catch((err) => console.error("[adopt] overlay failed", err instanceof Error ? err.message : err));
      return l;
    })
    .finally(() => {
      store.promise = null;
    });
  return statusOf(await store.promise);
}

function statusOf(l: Loaded): KeyringStatus {
  return { state: l.state, action: l.action as KeyringStatus["action"], message: l.message, versions: l.keys.map((k) => ({ id: k.id, version: k.version, status: k.status })), envKeyPresent: Boolean(parseEnvKey(process.env.PLATFORM_ENCRYPTION_KEY)) };
}

export function keyringStatus(): KeyringStatus {
  return store.loaded ? statusOf(store.loaded) : { state: "unavailable", action: null, message: "The keyring has not been loaded yet.", versions: [], envKeyPresent: Boolean(parseEnvKey(process.env.PLATFORM_ENCRYPTION_KEY)) };
}

/** Forget the cached keyring (tests, or after `key:rewrap`). */
export function resetKeyringCache(): void {
  store.loaded = null;
  store.promise = null;
}

type Ring = { id: string; key: Buffer; status: "active" | "retired"; version: number }[];
function ring(): Ring {
  if (store.loaded && store.loaded.keys.length) return store.loaded.keys;
  const env = parseEnvKey(process.env.PLATFORM_ENCRYPTION_KEY);
  if (!env) return [];
  return [{ id: "env", key: env, status: "active", version: 0 }];
}

/** The key that seals new data (synchronous). Null when there is none. */
export function activeRootKey(): Buffer | null {
  return pickActive(ring())?.key ?? null;
}

/** Every key version, the active one first: decrypt tries them (all of them, when the ciphertext names none). */
export function allRootKeys(): Buffer[] {
  return ring().map((k) => k.key);
}

/** The id of the active key, stamped into new ciphertext as `k`. */
export function activeRootKeyId(): string | null {
  const a = pickActive(ring());
  return a && a.id !== "env" ? a.id : null;
}

export function rootKeyById(id: string): Buffer | null {
  return ring().find((k) => k.id === id)?.key ?? null;
}

/** The OLDEST key (version 1): for values that must stay comparable forever, such as a hash used for lookups. */
export function stableRootKey(): Buffer | null {
  const r = ring();
  if (!r.length) return null;
  return [...r].sort((a, b) => (a.version || 1e9) - (b.version || 1e9))[0].key;
}

export const stableRootSecret = (): string | null => stableRootKey()?.toString("base64") ?? null;
export const activeRootSecret = (): string | null => activeRootKey()?.toString("base64") ?? null;

/** Cheap gate for the database accessors: resolves at once when the keyring is loaded (or can't be), so synchronous crypto after a DB read always has its keys. */
export function awaitKeyring(): Promise<unknown> | void {
  const cur = store.loaded;
  if (cur && (cur.state !== "unavailable" || Date.now() - cur.at < RETRY_AFTER_FAILURE_MS)) return;
  return ensureKeyring();
}

/** Product keys (legacy HRMS_/FMS_/DLMS_/SMMS_ENCRYPTION_KEY adopted into the keyring) for `purpose`, newest active first. */
export function productKeysFor(purpose: string): Buffer[] {
  const list = (store.loaded?.products ?? []).filter((p) => p.purpose === purpose);
  return list.sort((a, b) => (a.status === "active" ? -1 : b.status === "active" ? 1 : b.version - a.version)).map((p) => p.key);
}

/** Adds environment-provided keys to the stored keyring as extra versions (never removes or changes an existing one). Returns how many were new. */
export async function escrowExtraKeys(extras: ExtraKey[]): Promise<number> {
  const status = await ensureKeyring();
  const uri = process.env.MONGODB_URI;
  if (status.state !== "ok" || !uri || !extras.length) return 0;
  const { clientPromise } = await import("@/lib/platform/tenancy/platform-db");
  const col = (await clientPromise).db().collection<KeyringDoc>("platform_settings");
  const kek = deriveKek(uri, process.env.SAAS_HOSTS);
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc = await col.findOne({ _id: DOC_ID });
    if (!doc) return 0;
    const next = addExtraKeys(doc, kek, extras);
    if (!next) return 0;
    const res = await col.replaceOne({ _id: DOC_ID, updatedAt: doc.updatedAt }, next);
    if (res.matchedCount) {
      const added = next.keys.length - doc.keys.length;
      resetKeyringCache();
      await ensureKeyring();
      return added;
    }
  }
  return 0;
}
