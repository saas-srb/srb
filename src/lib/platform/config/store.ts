import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4, type EncryptedValue } from "@/lib/platform/crypto";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { CONFIG_FIELDS, CONFIG_SECRET_CONTEXT, CONFIG_SECTIONS } from "@/lib/platform/config/registry";

/**
 * The saved values for the server keys in `registry.ts` (`platform_settings`, `_id: "platform_config"`), with a short in-process cache.
 * Secrets are encrypted with PLATFORM_ENCRYPTION_KEY; the plain ones (VAPID public key, Twilio SID…) are stored as typed.
 * Resolution is per key: the saved value, else the environment variable of the same name, else nothing.
 */

const DOC_ID = "platform_config";
/** Values that may contain spaces or line breaks (a PEM private key, a sender with a label). */
const MULTILINE_OK = new Set(["TWILIO_WHATSAPP_FROM", "VAPID_SUBJECT", "GOOGLE_SEO_PRIVATE_KEY"]);
const CACHE_TTL_MS = 30_000;

interface StoredValue {
  enc?: EncryptedValue;
  plain?: string;
  last4: string | null;
  updatedAt: Date;
}
interface ConfigDoc {
  _id: typeof DOC_ID;
  values?: Record<string, StoredValue>;
  updatedAt?: Date;
  updatedBy?: string | null;
}

const g = globalThis as unknown as { __platformConfig?: { doc: ConfigDoc | null; at: number; loading: Promise<ConfigDoc | null> | null } };
const cache = (g.__platformConfig ??= { doc: null, at: 0, loading: null });

async function loadDoc(): Promise<ConfigDoc | null> {
  if (cache.at && Date.now() - cache.at < CACHE_TTL_MS) return cache.doc;
  cache.loading ??= (async () => {
    try {
      const doc = await (await getPlatformDb()).collection<ConfigDoc>("platform_settings").findOne({ _id: DOC_ID });
      cache.doc = doc;
      cache.at = Date.now();
      return doc;
    } catch (err) {
      console.error("[config] could not read settings; using environment configuration", err);
      return cache.doc;
    } finally {
      cache.loading = null;
    }
  })();
  return cache.loading;
}

function open(key: string, stored: StoredValue | undefined): string | null {
  if (!stored) return null;
  if (stored.enc) return decryptPlatformSecret(stored.enc, CONFIG_SECRET_CONTEXT(key));
  return stored.plain?.trim() || null;
}

const fromEnv = (key: string) => process.env[key]?.trim() || null;

/** The value for `key`: saved in the Console, else the environment variable of the same name. */
export async function getConfig(key: string): Promise<string | null> {
  return open(key, (await loadDoc())?.values?.[key]) ?? fromEnv(key);
}

/** Several keys at once (one read). */
export async function getConfigs<K extends string>(keys: readonly K[]): Promise<Record<K, string | null>> {
  const values = (await loadDoc())?.values;
  return Object.fromEntries(keys.map((k) => [k, open(k, values?.[k]) ?? fromEnv(k)])) as Record<K, string | null>;
}

export interface ConfigFieldView {
  key: string;
  saved: boolean;
  source: "db" | "env" | "none";
  /** The value for plain fields; secrets only ever show `last4`. */
  value: string;
  last4: string | null;
  unreadable: boolean;
}
export interface ConfigView {
  fields: Record<string, ConfigFieldView>;
  encryptionConfigured: boolean;
  updatedAt: string | null;
}

export async function getConfigView(): Promise<ConfigView> {
  cache.at = 0;
  const doc = await loadDoc();
  const fields: Record<string, ConfigFieldView> = {};
  for (const f of Object.values(CONFIG_FIELDS)) {
    const stored = doc?.values?.[f.key];
    const unreadable = Boolean(stored && open(f.key, stored) === null);
    fields[f.key] = {
      key: f.key,
      saved: Boolean(stored),
      source: stored ? "db" : fromEnv(f.key) ? "env" : "none",
      value: !f.secret ? (stored ? (stored.plain ?? "") : (fromEnv(f.key) ?? "")) : "",
      last4: stored ? stored.last4 : f.secret ? (fromEnv(f.key) ? last4(fromEnv(f.key)!) : null) : null,
      unreadable,
    };
  }
  return { fields, encryptionConfigured: isPlatformEncryptionConfigured(), updatedAt: doc?.updatedAt?.toISOString() ?? null };
}

/** `undefined`/"" = keep what is saved; `{ clear: true }` = remove it (the environment fallback applies again). */
export type ConfigInput = Record<string, string | { clear: true } | undefined>;
export type SaveConfigResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function saveConfig(input: ConfigInput, actorId: string): Promise<SaveConfigResult> {
  const errors: Record<string, string> = {};
  const changes: Record<string, string | null> = {};
  for (const [key, raw] of Object.entries(input ?? {})) {
    const field = CONFIG_FIELDS[key];
    if (!field) continue;
    if (raw && typeof raw === "object") {
      changes[key] = null;
      continue;
    }
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (value.length > 4000 || (/\s/.test(value) && !MULTILINE_OK.has(key))) errors[key] = "That doesn't look right: remove spaces and line breaks.";
    else if (key === "EMAIL_DEV_TO" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) errors[key] = "Enter one valid email address.";
    else if (key === "CRON_SECRET" && value.length < 24) errors[key] = "Use at least 24 characters (the Generate button makes a strong one).";
    else if (field.secret && !isPlatformEncryptionConfigured()) errors[key] = "PLATFORM_ENCRYPTION_KEY isn't set on the server, so the secret can't be stored safely.";
    else changes[key] = value;
  }
  const doc = await loadDoc();
  const next: Record<string, StoredValue> = { ...(doc?.values ?? {}) };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete next[key];
    else if (CONFIG_FIELDS[key].secret) next[key] = { enc: encryptPlatformSecret(value, CONFIG_SECRET_CONTEXT(key)), last4: last4(value), updatedAt: new Date() };
    else next[key] = { plain: value, last4: null, updatedAt: new Date() };
  }
  // A push key pair must be complete and usable, or push would be switched off for everyone.
  const vapidTouched = "VAPID_PUBLIC_KEY" in changes || "VAPID_PRIVATE_KEY" in changes;
  if (vapidTouched && !Object.keys(errors).length) {
    const pub = changes.VAPID_PUBLIC_KEY ?? open("VAPID_PUBLIC_KEY", next.VAPID_PUBLIC_KEY) ?? fromEnv("VAPID_PUBLIC_KEY");
    const priv = changes.VAPID_PRIVATE_KEY ?? open("VAPID_PRIVATE_KEY", next.VAPID_PRIVATE_KEY) ?? fromEnv("VAPID_PRIVATE_KEY");
    if (pub && priv) {
      try {
        (await import("web-push")).default.setVapidDetails("mailto:check@example.com", pub, priv);
      } catch {
        errors.VAPID_PRIVATE_KEY = "These two keys aren't a valid pair. Generate them together with `npx web-push generate-vapid-keys`.";
      }
    }
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  if (Object.keys(changes).length === 0) return { ok: true };

  await (await getPlatformDb()).collection<ConfigDoc>("platform_settings").updateOne({ _id: DOC_ID }, { $set: { values: next, updatedAt: new Date(), updatedBy: actorId } }, { upsert: true });
  cache.at = 0;
  await loadDoc();
  await recordPlatformAudit({
    actorId,
    action: "settings.config.update",
    target: { type: "platform_settings", id: DOC_ID },
    details: { changed: Object.keys(changes).filter((k) => changes[k] !== null), cleared: Object.keys(changes).filter((k) => changes[k] === null) },
  });
  return { ok: true };
}

export { CONFIG_SECTIONS };
