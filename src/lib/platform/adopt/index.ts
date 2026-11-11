import "server-only";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4, type EncryptedValue } from "@/lib/platform/crypto";
import { clientPromise } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { CONFIG_FIELDS, CONFIG_SECRET_CONTEXT } from "@/lib/platform/config/registry";
import { bustIntegrationsCache, INTEGRATIONS_DOC_ID } from "@/lib/platform/integrations/store";
import { SECRET_CONTEXT, EMAIL_PROVIDERS, DOMAIN_PROVIDERS } from "@/lib/platform/integrations/resolve";
import { escrowExtraKeys, keyringStatus } from "@/lib/platform/keyring";
import { KEYRING_ENV, OVERLAY_ENV } from "@/lib/platform/portability/env-classes";
import type { ExtraKey } from "@/lib/platform/keyring/core";

/**
 * Environment adoption. A deployment's environment variables belong to one Vercel project; the database travels. The first time a
 * variable is seen (first boot, or the Console's "Import from environment" button) its value is copied into the database, encrypted
 * through the keyring, and from then on every deployment finds it there. Rules:
 *   - never overwrites a value that is already saved in the database;
 *   - never copies deployment-bound variables (VERCEL_PROJECT_ID, VERCEL_TEAM_ID, CRON_SECRET, SAAS_ADMIN_*), see portability/env-classes.ts;
 *   - idempotent: running it again adopts only what is new.
 * Where a value goes: Console server keys (the config registry), the Integrations document, the keyring (legacy product keys), or the
 * "overlay" (everything else that code reads straight from `process.env`: it is put back into `process.env` at boot when a deployment lacks it).
 */

const DOC = "env_adoption";
const SKIP_CONFIG = new Set(["CRON_SECRET"]);

interface AdoptionEntry {
  where: "config" | "integrations" | "overlay" | "keyring";
  at: Date;
  enc?: EncryptedValue;
  last4?: string | null;
}
interface AdoptionDoc {
  _id: typeof DOC;
  entries?: Record<string, AdoptionEntry>;
}

const envOf = (name: string): string | null => process.env[name]?.trim() || null;
const overlayContext = (key: string) => `adopted-env:${key}`;

async function platformSettings() {
  return (await clientPromise).db().collection<Record<string, unknown> & { _id: string }>("platform_settings");
}

export interface AdoptionResult {
  adopted: string[];
  total: number;
}

export async function adoptEnvironment(opts: { actorId?: string | null; trigger: "boot" | "manual" }): Promise<AdoptionResult> {
  const ks = keyringStatus();
  if (ks.state !== "ok" || !isPlatformEncryptionConfigured()) return { adopted: [], total: await adoptedCount() };
  const col = await platformSettings();
  const now = new Date();
  const adopted: string[] = [];
  const note = async (key: string, where: AdoptionEntry["where"], extra: Partial<AdoptionEntry> = {}) => {
    adopted.push(key);
    await col.updateOne({ _id: DOC }, { $set: { [`entries.${key}`]: { where, at: now, ...extra } } }, { upsert: true });
  };
  // Make sure the target documents exist so the conditional writes below have something to match.
  await col.updateOne({ _id: "platform_config" }, { $setOnInsert: { values: {} } }, { upsert: true });
  await col.updateOne({ _id: INTEGRATIONS_DOC_ID }, { $setOnInsert: { updatedAt: now } }, { upsert: true });

  // 1. Console server keys (the config registry).
  for (const f of Object.values(CONFIG_FIELDS)) {
    if (SKIP_CONFIG.has(f.key)) continue;
    const v = envOf(f.key);
    if (!v) continue;
    const stored = f.secret ? { enc: encryptPlatformSecret(v, CONFIG_SECRET_CONTEXT(f.key)), last4: last4(v), updatedAt: now, source: "env-adopted" } : { plain: v, last4: null, updatedAt: now, source: "env-adopted" };
    const res = await col.updateOne({ _id: "platform_config", [`values.${f.key}`]: { $exists: false } }, { $set: { [`values.${f.key}`]: stored } });
    if (res.modifiedCount) await note(f.key, "config");
  }
  (globalThis as unknown as { __platformConfig?: { at: number } }).__platformConfig && ((globalThis as unknown as { __platformConfig: { at: number } }).__platformConfig.at = 0);

  // 2. Integrations (email, domains, the Vercel token of the account this environment belongs to).
  const setIf = async (envName: string, field: string, value: unknown) => {
    const res = await col.updateOne({ _id: INTEGRATIONS_DOC_ID, [field]: { $in: [null, ""] } }, { $set: { [field]: value, updatedAt: now } });
    if (res.modifiedCount) await note(envName, "integrations");
  };
  const seal = (plain: string, ctx: string) => ({ enc: encryptPlatformSecret(plain, ctx), last4: last4(plain), updatedAt: now, source: "env-adopted" });
  const resend = envOf("RESEND_API_KEY");
  if (resend) await setIf("RESEND_API_KEY", "email.resendApiKey", seal(resend, SECRET_CONTEXT.resendApiKey));
  const ep = envOf("EMAIL_PROVIDER")?.toLowerCase();
  if (ep && (EMAIL_PROVIDERS as readonly string[]).includes(ep)) await setIf("EMAIL_PROVIDER", "email.provider", ep);
  const ef = envOf("EMAIL_FROM");
  if (ef) await setIf("EMAIL_FROM", "email.from", ef);
  const dp = envOf("DOMAIN_PROVIDER")?.toLowerCase();
  if (dp && (DOMAIN_PROVIDERS as readonly string[]).includes(dp)) await setIf("DOMAIN_PROVIDER", "domains.provider", dp);
  const root = (process.env.PLATFORM_ROOT_DOMAIN ?? "").split(",")[0].trim().toLowerCase();
  if (root) await setIf("PLATFORM_ROOT_DOMAIN", "domains.rootDomain", root);
  const vtoken = envOf("VERCEL_API_TOKEN");
  if (vtoken) {
    await setIf("VERCEL_API_TOKEN", "domains.vercelToken", seal(vtoken, SECRET_CONTEXT.vercelToken));
    // The account this environment belongs to: kept as the "previous project", so a later deployment on another account can release
    // hosts from here and copy DNS (a no-op on this very project). Only when nothing is saved yet.
    const project = envOf("VERCEL_PROJECT_ID");
    if (project && process.env.VERCEL) {
      const res = await col.updateOne({ _id: INTEGRATIONS_DOC_ID, "domains.previous": { $in: [null] } }, { $set: { "domains.previous": { token: seal(vtoken, SECRET_CONTEXT.vercelPrevToken), projectId: project, teamId: envOf("VERCEL_TEAM_ID") }, updatedAt: now } });
      if (res.modifiedCount) await note("VERCEL_PROJECT_ID", "integrations");
    }
  }
  bustIntegrationsCache();

  // 3. Legacy encryption keys become extra keyring versions.
  const extras: { name: string; x: ExtraKey }[] = [];
  for (const [name, rule] of Object.entries(KEYRING_ENV)) {
    const raw = envOf(name);
    const key = raw ? Buffer.from(raw, "base64") : null;
    if (key?.length === 32) extras.push({ name, x: { purpose: rule.purpose, key, previous: rule.previous } });
  }
  if (extras.length && (await escrowExtraKeys(extras.map((e) => e.x))) > 0) for (const e of extras) await note(e.name, "keyring");

  // 4. Everything else that is read straight from process.env.
  const known = (await col.findOne({ _id: DOC })) as AdoptionDoc | null;
  for (const name of OVERLAY_ENV) {
    const v = envOf(name);
    if (!v || known?.entries?.[name] || CONFIG_FIELDS[name]) continue;
    const res = await col.updateOne({ _id: DOC, [`entries.${name}`]: { $exists: false } }, { $set: { [`entries.${name}`]: { where: "overlay", at: now, enc: encryptPlatformSecret(v, overlayContext(name)), last4: last4(v) } } }, { upsert: false });
    if (res.modifiedCount) adopted.push(name);
    else if (!known) {
      await col.updateOne({ _id: DOC }, { $set: { [`entries.${name}`]: { where: "overlay", at: now, enc: encryptPlatformSecret(v, overlayContext(name)), last4: last4(v) } } }, { upsert: true });
      adopted.push(name);
    }
  }

  if (adopted.length) {
    console.log(`[adopt] ${opts.trigger}: adopted ${adopted.length} setting(s) from the environment: ${adopted.join(", ")}`);
    await recordPlatformAudit({ actorId: opts.actorId ?? "system:env-adoption", action: "settings.env.adopt", target: { type: "platform_settings", id: DOC }, details: { keys: adopted, trigger: opts.trigger } }).catch(() => {});
  }
  return { adopted, total: await adoptedCount() };
}

/** Puts overlay values back into `process.env` where this deployment doesn't have them. Called once the keyring is open. */
export async function applyAdoptedEnv(): Promise<number> {
  const doc = (await (await platformSettings()).findOne({ _id: DOC })) as AdoptionDoc | null;
  let n = 0;
  for (const [name, e] of Object.entries(doc?.entries ?? {})) {
    if (e.where !== "overlay" || !e.enc || process.env[name]) continue;
    const v = decryptPlatformSecret(e.enc, overlayContext(name));
    if (v) {
      process.env[name] = v;
      n++;
    }
  }
  return n;
}

export async function adoptedCount(): Promise<number> {
  const doc = (await (await platformSettings()).findOne({ _id: DOC })) as AdoptionDoc | null;
  return Object.keys(doc?.entries ?? {}).length;
}

export async function adoptedSummary(): Promise<{ count: number; keys: { key: string; where: string; at: string }[] }> {
  const doc = (await (await platformSettings()).findOne({ _id: DOC })) as AdoptionDoc | null;
  const keys = Object.entries(doc?.entries ?? {}).map(([key, e]) => ({ key, where: e.where, at: new Date(e.at).toISOString() }));
  return { count: keys.length, keys };
}
