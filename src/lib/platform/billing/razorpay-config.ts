import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4, type EncryptedValue } from "@/lib/platform/crypto";

/**
 * The platform owner's Razorpay account used to bill customer companies.
 * Stored in `platform_settings` (`_id: "billing_razorpay"`), edited only in
 * the Platform Console (Payments & Razorpay). The key secret is encrypted with
 * `PLATFORM_ENCRYPTION_KEY` and never leaves the server — the product shows its
 * last 4 characters only.
 *
 * The webhook secret is saved the same way (encrypted, last 4 shown). Env
 * fallback (`RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` /
 * `RAZORPAY_BILLING_WEBHOOK_SECRET`) is used only for what has not been saved here.
 */

export const RAZORPAY_CONFIG_DOC_ID = "billing_razorpay";
export const RAZORPAY_SECRET_CONTEXT = "billing:razorpay:keySecret";
export const RAZORPAY_WEBHOOK_CONTEXT = "billing:razorpay:webhookSecret";

export type RazorpayMode = "test" | "live";

interface StoredConfig {
  _id: string;
  keyId: string;
  keySecret: EncryptedValue | null;
  secretLast4: string | null;
  webhookSecret?: EncryptedValue | null;
  webhookLast4?: string | null;
  mode: RazorpayMode;
  lastTest: { ok: boolean; at: Date; message: string } | null;
  updatedAt: Date;
  updatedBy: string;
}

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  mode: RazorpayMode;
  source: "db" | "env";
}

/** What the Platform Console may see — never the secret or its ciphertext. */
export interface RazorpayConfigView {
  keyId: string;
  secretLast4: string | null;
  mode: RazorpayMode;
  source: "db" | "env" | "none";
  /** A secret is saved but can't be decrypted (key missing / rotated). */
  secretUnreadable: boolean;
  encryptionConfigured: boolean;
  webhookSecretSet: boolean;
  webhookLast4: string | null;
  webhookSource: "db" | "env" | "none";
  /** A webhook secret is saved but can't be decrypted. */
  webhookUnreadable: boolean;
  lastTest: { ok: boolean; at: string; message: string } | null;
  updatedAt: string | null;
}

async function col() {
  return (await getPlatformDb()).collection<StoredConfig>("platform_settings");
}

export function modeOfKeyId(keyId: string): RazorpayMode | null {
  if (keyId.startsWith("rzp_live_")) return "live";
  if (keyId.startsWith("rzp_test_")) return "test";
  return null;
}

const envWebhookSecret = () => process.env.RAZORPAY_BILLING_WEBHOOK_SECRET?.trim() || null;

/** The secret Razorpay signs billing webhooks with: the saved one, else env. Server-only. */
export async function billingWebhookSecret(): Promise<string | null> {
  const doc = await (await col()).findOne({ _id: RAZORPAY_CONFIG_DOC_ID }, { projection: { webhookSecret: 1 } });
  if (doc?.webhookSecret) return decryptPlatformSecret(doc.webhookSecret, RAZORPAY_WEBHOOK_CONTEXT);
  return envWebhookSecret();
}

function envCredentials(): RazorpayCredentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret, mode: modeOfKeyId(keyId) ?? "test", source: "env" };
}

/** The credentials billing calls use: saved ones, else env (only when nothing is saved). Server-only. */
export async function getRazorpayCredentials(): Promise<RazorpayCredentials | null> {
  const doc = await (await col()).findOne({ _id: RAZORPAY_CONFIG_DOC_ID });
  if (doc?.keyId) {
    const keySecret = decryptPlatformSecret(doc.keySecret, RAZORPAY_SECRET_CONTEXT);
    return keySecret ? { keyId: doc.keyId, keySecret, mode: doc.mode, source: "db" } : null;
  }
  return envCredentials();
}

export async function getRazorpayConfigView(): Promise<RazorpayConfigView> {
  const doc = await (await col()).findOne({ _id: RAZORPAY_CONFIG_DOC_ID });
  const env = doc?.keyId ? null : envCredentials();
  return {
    keyId: doc?.keyId ?? env?.keyId ?? "",
    secretLast4: doc?.keyId ? doc.secretLast4 : env ? last4(env.keySecret) : null,
    mode: doc?.mode ?? env?.mode ?? "test",
    source: doc?.keyId ? "db" : env ? "env" : "none",
    secretUnreadable: Boolean(doc?.keyId && !decryptPlatformSecret(doc.keySecret, RAZORPAY_SECRET_CONTEXT)),
    encryptionConfigured: isPlatformEncryptionConfigured(),
    webhookSecretSet: Boolean(doc?.webhookSecret || envWebhookSecret()),
    webhookLast4: doc?.webhookSecret ? (doc.webhookLast4 ?? null) : null,
    webhookSource: doc?.webhookSecret ? "db" : envWebhookSecret() ? "env" : "none",
    webhookUnreadable: Boolean(doc?.webhookSecret && !decryptPlatformSecret(doc.webhookSecret, RAZORPAY_WEBHOOK_CONTEXT)),
    lastTest: doc?.lastTest ? { ...doc.lastTest, at: doc.lastTest.at.toISOString() } : null,
    updatedAt: doc?.updatedAt?.toISOString() ?? null,
  };
}

export type SaveRazorpayConfigResult = { ok: true } | { ok: false; errors: Record<string, string> };

/**
 * Saves the key id / mode, and the secret when a new one is typed (blank =
 * keep the saved secret). The key id's prefix must match the mode.
 */
export async function saveRazorpayConfig(input: { keyId: string; keySecret: string; mode: string; webhookSecret?: string }, actorId: string): Promise<SaveRazorpayConfigResult> {
  const keyId = String(input.keyId ?? "").trim();
  const keySecret = String(input.keySecret ?? "").trim();
  const webhookSecret = String(input.webhookSecret ?? "").trim();
  const mode = input.mode === "live" ? "live" : input.mode === "test" ? "test" : null;
  const errors: Record<string, string> = {};
  const existing = await (await col()).findOne({ _id: RAZORPAY_CONFIG_DOC_ID });

  if (!mode) errors.mode = "Choose test or live mode.";
  if (!/^rzp_(test|live)_[A-Za-z0-9]{6,40}$/.test(keyId)) errors.keyId = "Enter a Razorpay key id, e.g. rzp_test_AbCdEf123456.";
  else if (mode && modeOfKeyId(keyId) !== mode) errors.keyId = `This is a ${modeOfKeyId(keyId)} key — switch the mode to ${modeOfKeyId(keyId)} or paste the ${mode} key.`;
  if (keySecret && (keySecret.length < 8 || keySecret.length > 100 || /\s/.test(keySecret))) errors.keySecret = "That doesn't look like a Razorpay key secret.";
  const keepSecret = !keySecret && existing?.keySecret && existing.keyId === keyId;
  if (!keySecret && !keepSecret) errors.keySecret = existing?.keySecret ? "Changing the key id needs its key secret too." : "Enter the key secret.";
  if (webhookSecret && (webhookSecret.length < 8 || webhookSecret.length > 100 || /\s/.test(webhookSecret))) errors.webhookSecret = "That doesn't look like a webhook secret (8–100 characters, no spaces).";
  if ((keySecret || webhookSecret) && !isPlatformEncryptionConfigured()) {
    const msg = "PLATFORM_ENCRYPTION_KEY isn't set on the server, so the secret can't be stored safely.";
    if (keySecret) errors.keySecret = msg;
    if (webhookSecret) errors.webhookSecret = msg;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const doc: Omit<StoredConfig, "_id"> = {
    keyId,
    keySecret: keySecret ? encryptPlatformSecret(keySecret, RAZORPAY_SECRET_CONTEXT) : existing!.keySecret,
    secretLast4: keySecret ? last4(keySecret) : (existing?.secretLast4 ?? null),
    webhookSecret: webhookSecret ? encryptPlatformSecret(webhookSecret, RAZORPAY_WEBHOOK_CONTEXT) : (existing?.webhookSecret ?? null),
    webhookLast4: webhookSecret ? last4(webhookSecret) : (existing?.webhookLast4 ?? null),
    mode: mode!,
    lastTest: null,
    updatedAt: new Date(),
    updatedBy: actorId,
  };
  await (await col()).updateOne({ _id: RAZORPAY_CONFIG_DOC_ID }, { $set: doc }, { upsert: true });
  await recordPlatformAudit({
    actorId,
    action: "settings.razorpay.update",
    target: { type: "platform_settings", id: RAZORPAY_CONFIG_DOC_ID },
    details: { keyId, mode, secretChanged: Boolean(keySecret), webhookSecretChanged: Boolean(webhookSecret), modeChanged: existing ? existing.mode !== mode : null },
  });
  return { ok: true };
}

/** Remembers the last connection test (shown on the product). */
export async function recordRazorpayTest(result: { ok: boolean; message: string }): Promise<void> {
  await (await col()).updateOne({ _id: RAZORPAY_CONFIG_DOC_ID, keyId: { $exists: true } }, { $set: { lastTest: { ...result, at: new Date() } } });
}
