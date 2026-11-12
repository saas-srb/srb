import "server-only";
import { randomBytes } from "node:crypto";
import { addRootKey, deriveKek, keyId, parseEnvKey, wrapWithPassphrase, type KeyringDoc } from "@/lib/platform/keyring/core";
import { makeProbe, resealSample } from "@/lib/platform/keyring/probe";
import { collectKnown, collectShapes } from "@/lib/platform/keyring/samples";
import { activeRootKey, allRootKeys, ensureKeyring, keyringStatus, resetKeyringCache } from "@/lib/platform/keyring";
import { clientPromise } from "@/lib/platform/tenancy/platform-db";

/** Staff-facing key management: health, adding a previous key, rotation (with lazy re-sealing), backup reveal and the recovery passphrase. */

const META = "keyring_meta";

interface Meta {
  _id: typeof META;
  backedUpAt?: Date | null;
  backedUpBy?: string | null;
  passphrase?: { salt: string; wrapped: { c: string; iv: string; t: string }; keyIds: string[]; setAt: Date } | null;
  rotation?: { startedAt: Date; toKeyId: string; resealed: number; remaining: number; finishedAt: Date | null } | null;
}

async function db() {
  return (await clientPromise).db();
}
const settings = async () => (await db()).collection<KeyringDoc | Meta>("platform_settings") as never as import("mongodb").Collection<Record<string, unknown> & { _id: string }>;

export async function keyMeta(): Promise<Meta> {
  return ((await (await settings()).findOne({ _id: META })) as unknown as Meta | null) ?? { _id: META };
}

export interface KeyHealth {
  state: string;
  versions: { id: string; version: number; status: string; verification: string }[];
  testable: number;
  unopenable: number;
  unopenableWhere: string[];
  backedUpAt: string | null;
  passphraseSet: boolean;
  passphraseStale: boolean;
  rotation: { resealed: number; remaining: number; finished: boolean } | null;
}

/** A fresh look: scans the known ciphertext locations and says how many values no key opens. Read-only. */
export async function computeKeyHealth(): Promise<KeyHealth> {
  const status = await ensureKeyring();
  const d = await db();
  const known = await collectKnown(d);
  const probe = makeProbe(known);
  const keys = allRootKeys();
  const bad = known.filter((k) => makeProbe([k]).unopenable(keys) > 0);
  const meta = await keyMeta();
  const ids = status.versions.map((v) => v.id);
  return {
    state: status.state,
    versions: status.versions,
    testable: probe.testable,
    unopenable: bad.length,
    unopenableWhere: bad.slice(0, 20).map((b) => b.where),
    backedUpAt: meta.backedUpAt ? new Date(meta.backedUpAt).toISOString() : null,
    passphraseSet: Boolean(meta.passphrase),
    passphraseStale: Boolean(meta.passphrase && ids.some((i) => !meta.passphrase!.keyIds.includes(i))),
    rotation: meta.rotation ? { resealed: meta.rotation.resealed, remaining: meta.rotation.remaining, finished: Boolean(meta.rotation.finishedAt) } : null,
  };
}

async function writeDoc(mutate: (doc: KeyringDoc, kek: Buffer) => KeyringDoc | { error: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const status = await ensureKeyring();
  if (status.state !== "ok") return { ok: false, error: status.state === "cannot_unwrap" ? "The keyring is locked (the database URI changed): nothing can be changed until `npm run key:rewrap` is run." : "The keyring isn't available." };
  const uri = process.env.MONGODB_URI;
  if (!uri) return { ok: false, error: "MONGODB_URI is not set." };
  const col = (await db()).collection<KeyringDoc>("platform_settings");
  const kek = deriveKek(uri, process.env.SAAS_HOSTS);
  for (let i = 0; i < 3; i++) {
    const doc = await col.findOne({ _id: "keyring" });
    if (!doc) return { ok: false, error: "There is no keyring yet." };
    const next = mutate(doc, kek);
    if ("error" in next) return { ok: false, error: next.error };
    const res = await col.replaceOne({ _id: "keyring", updatedAt: doc.updatedAt }, next);
    if (res.matchedCount) {
      resetKeyringCache();
      await ensureKeyring();
      return { ok: true };
    }
  }
  return { ok: false, error: "The keyring changed while saving; try again." };
}

/** Accepts an old encryption key (base64, 32 bytes) only if it opens existing encrypted data; it then becomes the active verified key. */
export async function addPreviousKey(raw: string): Promise<{ ok: true; opened: number } | { ok: false; error: string }> {
  const key = parseEnvKey(raw);
  if (!key) return { ok: false, error: "That isn't a base64 key of 32 bytes (openssl rand -base64 32)." };
  const d = await db();
  const probe = makeProbe(await collectKnown(d), await collectShapes(d));
  const opened = probe.opens(key);
  if (opened === 0) return { ok: false, error: probe.testable ? "That key doesn't open any encrypted data in this database, so it was not added." : "There is no encrypted data to check the key against, so it was not added." };
  const res = await writeDoc((doc, kek) => addRootKey(doc, kek, key, "env"));
  return res.ok ? { ok: true, opened } : res;
}

/** One-click rotation: a fresh random key becomes the active verified key; all old versions stay (decrypt-only) and values are re-sealed in the background. */
export async function rotateKey(): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = randomBytes(32);
  const res = await writeDoc((doc, kek) => addRootKey(doc, kek, key, "generated"));
  if (!res.ok) return res;
  await (await settings()).updateOne({ _id: META }, { $set: { rotation: { startedAt: new Date(), toKeyId: keyId(key), resealed: 0, remaining: 1, finishedAt: null } } }, { upsert: true });
  return { ok: true };
}

/** Re-seals values still sealed with an older key (known locations only). Time-budgeted; resumable because it simply looks again. */
export async function resealTick(budgetMs: number): Promise<{ resealed: number; remaining: number }> {
  const meta = await keyMeta();
  const active = activeRootKey();
  if (!active || !meta.rotation || meta.rotation.finishedAt) return { resealed: 0, remaining: 0 };
  const started = Date.now();
  const d = await db();
  const keys = allRootKeys();
  let resealed = 0;
  let remaining = 0;
  for (const s of await collectKnown(d, 20000)) {
    if (Date.now() - started > budgetMs) {
      remaining++;
      continue;
    }
    const next = resealSample(s, keys, active);
    if (!next) continue;
    const res = await d.collection(s.target.collection).updateOne({ ...s.target.filter, [`${s.target.path}.c`]: s.enc.c }, { $set: { [s.target.path]: next } });
    if (res.modifiedCount) resealed++;
    else remaining++;
  }
  const total = (meta.rotation.resealed ?? 0) + resealed;
  await (await settings()).updateOne({ _id: META }, { $set: { "rotation.resealed": total, "rotation.remaining": remaining, ...(remaining === 0 ? { "rotation.finishedAt": new Date() } : {}) } });
  return { resealed, remaining };
}

/** The active key, base64. ONLY for the re-authenticated backup reveal. */
export async function revealActiveKey(actorId: string): Promise<string | null> {
  await ensureKeyring();
  const key = activeRootKey();
  if (!key) return null;
  await (await settings()).updateOne({ _id: META }, { $set: { backedUpAt: new Date(), backedUpBy: actorId } }, { upsert: true });
  return key.toString("base64");
}

/** An extra copy of all keys sealed with a passphrase the owner keeps (heals a changed MONGODB_URI / SAAS_HOSTS). */
export async function setRecoveryPassphrase(passphrase: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (passphrase.length < 12) return { ok: false, error: "Use a passphrase of at least 12 characters." };
  await ensureKeyring();
  const st = keyringStatus();
  if (st.state !== "ok") return { ok: false, error: "The keyring isn't open." };
  const keys = allRootKeys().map((k) => ({ id: keyId(k), key: k }));
  const w = wrapWithPassphrase(keys, passphrase);
  await (await settings()).updateOne({ _id: META }, { $set: { passphrase: { ...w, keyIds: keys.map((k) => k.id), setAt: new Date() } } }, { upsert: true });
  return { ok: true };
}
