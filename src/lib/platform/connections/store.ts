import "server-only";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { encryptPlatformSecret, decryptPlatformSecret, isPlatformEncryptionConfigured, last4, type EncryptedValue } from "@/lib/platform/crypto";
import { providerByKey, type ConnectionProvider } from "@/lib/platform/connections/catalog";

/**
 * A workspace's saved third-party connections (`workspace_connections`, one doc per provider, scoped to the company).
 * Secrets are encrypted at rest (AES-256-GCM, bound to company + provider + field); only `last4` is ever shown.
 */
export const CONNECTIONS_COLLECTION = "workspace_connections";

interface StoredConnection {
  _id: string; // provider key
  values: Record<string, string>;
  secrets: Record<string, { enc: EncryptedValue; last4: string }>;
  lastTest: { ok: boolean; at: Date; message: string } | null;
  connectedAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

const context = (companyId: string, provider: string, field: string) => `connection:${companyId}:${provider}:${field}`;

async function col() {
  return (await getDb()).collection<StoredConnection>(CONNECTIONS_COLLECTION);
}

// A short cache of decrypted values: AI/email calls resolve a connection on every request.
const TTL_MS = 20_000;
const g = globalThis as unknown as { __wsConnCache?: Map<string, { at: number; values: Record<string, string> | null }> };
const cache = (g.__wsConnCache ??= new Map());
const bust = (companyId: string, provider: string) => cache.delete(`${companyId}:${provider}`);

/** The company's own saved values for a provider (decrypted), or null when it hasn't connected one. Server-only. */
export async function getSavedConnection(provider: string): Promise<Record<string, string> | null> {
  const companyId = await currentCompanyId();
  const key = `${companyId}:${provider}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.values;
  const doc = await (await col()).findOne({ _id: provider });
  let values: Record<string, string> | null = null;
  if (doc) {
    values = { ...doc.values };
    for (const [field, s] of Object.entries(doc.secrets ?? {})) {
      const plain = decryptPlatformSecret(s.enc, context(companyId, provider, field));
      if (plain) values[field] = plain;
    }
  }
  cache.set(key, { at: Date.now(), values });
  return values;
}

export interface ConnectionView {
  key: string;
  saved: boolean;
  values: Record<string, string>;
  /** Which secret fields are set, with their last four characters. */
  secrets: Record<string, { set: true; last4: string }>;
  lastTest: { ok: boolean; at: string; message: string } | null;
  updatedAt: string | null;
}

export async function getConnectionView(provider: string): Promise<ConnectionView> {
  const doc = await (await col()).findOne({ _id: provider });
  return {
    key: provider,
    saved: !!doc,
    values: doc?.values ?? {},
    secrets: Object.fromEntries(Object.entries(doc?.secrets ?? {}).map(([k, s]) => [k, { set: true as const, last4: s.last4 }])),
    lastTest: doc?.lastTest ? { ok: doc.lastTest.ok, at: doc.lastTest.at.toISOString(), message: doc.lastTest.message } : null,
    updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}

export async function listConnectionViews(): Promise<Record<string, ConnectionView>> {
  const docs = await (await col()).find({}).toArray();
  const out: Record<string, ConnectionView> = {};
  for (const d of docs) {
    out[d._id] = {
      key: d._id,
      saved: true,
      values: d.values ?? {},
      secrets: Object.fromEntries(Object.entries(d.secrets ?? {}).map(([k, s]) => [k, { set: true as const, last4: s.last4 }])),
      lastTest: d.lastTest ? { ok: d.lastTest.ok, at: d.lastTest.at.toISOString(), message: d.lastTest.message } : null,
      updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
    };
  }
  return out;
}

export type SaveResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

const MAX_LEN = 8000;

/** Saves (or updates) a provider. A blank secret field on an existing connection keeps the stored secret. */
export async function saveConnection(providerKey: string, input: Record<string, unknown>, actorId: string | null): Promise<SaveResult> {
  const provider: ConnectionProvider | undefined = providerByKey.get(providerKey);
  if (!provider || provider.fields.length === 0) return { ok: false, error: "Unknown connection." };
  if (!isPlatformEncryptionConfigured()) return { ok: false, error: "Secure storage isn't set up on this server yet (PLATFORM_ENCRYPTION_KEY). Ask your platform administrator." };

  const companyId = await currentCompanyId();
  const collection = await col();
  const existing = await collection.findOne({ _id: providerKey });
  const values: Record<string, string> = {};
  const secrets: StoredConnection["secrets"] = { ...(existing?.secrets ?? {}) };
  const fieldErrors: Record<string, string> = {};

  for (const f of provider.fields) {
    const raw = typeof input[f.key] === "string" ? (input[f.key] as string) : "";
    const value = (f.kind === "textarea" || f.key === "privateKey" ? raw.replace(/\\n/g, "\n").trim() : raw.trim()).slice(0, MAX_LEN);
    if (f.kind === "secret") {
      if (value) secrets[f.key] = { enc: encryptPlatformSecret(value, context(companyId, providerKey, f.key)), last4: last4(value) };
      else if (!secrets[f.key] && f.required) fieldErrors[f.key] = `${f.label} is required.`;
    } else {
      const v = value || f.defaultValue || "";
      if (!v && f.required) fieldErrors[f.key] = `${f.label} is required.`;
      if (v) values[f.key] = v;
    }
  }
  if (Object.keys(fieldErrors).length) return { ok: false, error: "Please fill in the highlighted fields.", fieldErrors };
  if (providerKey === "smtp" && values.port && !/^\d{2,5}$/.test(values.port)) return { ok: false, error: "The port must be a number.", fieldErrors: { port: "Enter a port number, e.g. 587." } };

  const now = new Date();
  await collection.updateOne(
    { _id: providerKey },
    { $set: { values, secrets, lastTest: null, updatedAt: now, updatedBy: actorId }, $setOnInsert: { connectedAt: now } },
    { upsert: true }
  );
  bust(companyId, providerKey);
  return { ok: true };
}

export async function disconnectConnection(providerKey: string): Promise<void> {
  const companyId = await currentCompanyId();
  await (await col()).deleteOne({ _id: providerKey });
  bust(companyId, providerKey);
}

export async function recordTestResult(providerKey: string, ok: boolean, message: string): Promise<void> {
  await (await col()).updateOne({ _id: providerKey }, { $set: { lastTest: { ok, at: new Date(), message: message.slice(0, 300) } } });
}
