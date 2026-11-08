import "server-only";
import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4, type EncryptedValue } from "@/lib/platform/crypto";
import { currentCompanyId, isPlatformOwnerContext } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { companyBaseUrl, platformRootDomain } from "@/lib/platform/tenancy/provisioning";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

/**
 * A company's own payment & payout account (Razorpay + RazorpayX), used to
 * collect its customers' payments (FMS payment intents/links, webhooks) and
 * pay its employees' salaries (HRMS payouts, payroll webhook).
 *
 * Credential resolution — `resolveRazorpayCredentials(purpose)`, per purpose:
 *  1. the company's own connected account (Settings → Payments & payouts),
 *     when it covers that purpose (payouts need RazorpayX switched on)
 *  2. else, for the platform owner ONLY, the platform-wide env credentials
 *     (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
 *     `RAZORPAY_ACCOUNT_NUMBER`, `HRMS_PAYOUT_PROVIDER`) — exactly what it
 *     used before per-company accounts existed
 *  3. else null: "not connected". Other companies never see env credentials.
 * A stored account whose secrets can't be decrypted resolves to null for
 * every purpose — never a silent switch to a different Razorpay account.
 *
 * Secrets (key secret, webhook secret, RazorpayX account number) are
 * encrypted with `encryptPlatformSecret` (`@/lib/platform/crypto`), bound to
 * `payments:razorpay:<companyId>:<field>` so a ciphertext can't be replayed
 * into another company's record or another field. Plaintext only ever leaves
 * this module through `resolveRazorpayCredentials` (server-side callers);
 * views carry the last 4 characters only. Nothing here logs a secret.
 *
 * Webhooks: each company registers
 *   /api/cashflow-ai/webhooks/razorpay/<companyId>   (customer payments)
 *   /api/talentos/payroll/webhook/<companyId>    (RazorpayX payouts)
 * The company comes from the URL, not the Host header, so the URL keeps
 * working when the company adds, removes or re-points custom domains. The
 * id isn't a secret — the HMAC signature, checked with THAT company's
 * webhook secret, is what authenticates the call. The older host-based URLs
 * (`/api/cashflow-ai/webhooks/razorpay`, `/api/talentos/payroll/webhook`) still work,
 * resolving the company from the Host — the platform owner's existing
 * Razorpay dashboard points at those.
 */

export const PAYMENT_ACCOUNTS_COLLECTION = "platform_payment_accounts"; // keyed: _id = provider
const RAZORPAY = "razorpay";
const RZP_API = "https://api.razorpay.com/v1";

/** Machine-readable reason, for callers that branch on it. */
export const NOT_CONNECTED = "NOT_CONNECTED" as const;
export const NOT_CONNECTED_MESSAGE = "Connect your Razorpay account in Settings → Payments to collect online.";

type SecretField = "keySecret" | "webhookSecret" | "accountNumber";

/** The AAD context — unchanged from the first version of this module, so stored values stay readable. */
export function paymentSecretContext(companyId: string, field: SecretField): string {
  return `payments:${RAZORPAY}:${companyId}:${field}`;
}

function encrypt(plain: string, companyId: string, field: SecretField): EncryptedValue {
  return encryptPlatformSecret(plain, paymentSecretContext(companyId, field));
}

function decrypt(value: EncryptedValue | null | undefined, companyId: string, field: SecretField): string | null {
  return decryptPlatformSecret(value, paymentSecretContext(companyId, field));
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

interface StoredRazorpayAccount {
  _id: string; // "razorpay"
  keyId: string;
  keySecret: EncryptedValue;
  keySecretLast4: string;
  webhookSecret: EncryptedValue | null;
  webhookSecretLast4: string | null;
  accountNumber: EncryptedValue | null;
  accountNumberLast4: string | null;
  payoutsEnabled: boolean;
  lastTest: { ok: boolean; at: Date; message: string } | null;
  connectedAt: Date;
  updatedAt: Date;
  updatedBy: string | null;
}

async function collection() {
  const db = await getDb();
  return db.collection<StoredRazorpayAccount>(PAYMENT_ACCOUNTS_COLLECTION);
}

async function readStored(): Promise<StoredRazorpayAccount | null> {
  return (await collection()).findOne({ _id: RAZORPAY });
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

export type RazorpayPurpose = "payments" | "payouts";

export interface RazorpayCredentials {
  /** "company" = the company's own connected account; "platform_env" = the owner's env credentials. */
  source: "company" | "platform_env";
  keyId: string;
  keySecret: string;
  /** Secret Razorpay signs webhooks with; null = webhooks are rejected. */
  webhookSecret: string | null;
  /** RazorpayX source account (payouts). */
  accountNumber: string | null;
}

/** The platform owner's env credentials — unchanged from before per-company accounts. */
function envCredentials(purpose: RazorpayPurpose): RazorpayCredentials | null {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const accountNumber = process.env.RAZORPAY_ACCOUNT_NUMBER || null;
  if (purpose === "payouts") {
    if (process.env.HRMS_PAYOUT_PROVIDER !== "razorpay") return null;
    return { source: "platform_env", keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || null, accountNumber };
  }
  // FMS webhooks historically fell back to the key secret when no webhook secret was set.
  return { source: "platform_env", keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || keySecret, accountNumber };
}

type CompanyResolution = { kind: "none" } | { kind: "unreadable" } | { kind: "ok"; creds: RazorpayCredentials; payoutsEnabled: boolean };

async function resolveStored(stored: StoredRazorpayAccount | null, companyId: string): Promise<CompanyResolution> {
  if (!stored) return { kind: "none" };
  const keySecret = decrypt(stored.keySecret, companyId, "keySecret");
  if (!keySecret) return { kind: "unreadable" };
  return {
    kind: "ok",
    payoutsEnabled: stored.payoutsEnabled,
    creds: {
      source: "company",
      keyId: stored.keyId,
      keySecret,
      webhookSecret: decrypt(stored.webhookSecret, companyId, "webhookSecret"),
      accountNumber: decrypt(stored.accountNumber, companyId, "accountNumber"),
    },
  };
}

/**
 * The Razorpay credentials the current company collects payments / pays
 * salaries with, or null when it has none ("not connected"). See the module
 * comment for the order. The company is always the CURRENT one (Host header or
 * `runAsCompany`); there is deliberately no way to ask for another company's.
 */
export async function resolveRazorpayCredentials(purpose: RazorpayPurpose): Promise<RazorpayCredentials | null> {
  const companyId = await currentCompanyId();
  const own = await resolveStored(await readStored(), companyId);
  if (own.kind === "unreadable") return null;
  if (own.kind === "ok") {
    if (purpose === "payments") return own.creds;
    if (own.payoutsEnabled && own.creds.accountNumber) return own.creds;
  }
  if (!(await isPlatformOwnerContext())) return null;
  return envCredentials(purpose);
}

/**
 * The company a per-company webhook URL (`…/<companyId>`) is for: an existing,
 * active company, or null. Callers then run the webhook inside
 * `runAsCompany(id, …)` so everything — credentials, intents, payouts — is
 * that company's.
 */
export async function resolveWebhookCompany(companyIdParam: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(companyIdParam)) return null;
  const company = await getCompany(companyIdParam);
  return company && company.status === "active" ? company._id : null;
}

// ---------------------------------------------------------------------------
// View (what the settings page may see — never a secret)
// ---------------------------------------------------------------------------

export interface PaymentAccountView {
  status: "not_connected" | "connected" | "unreadable";
  keyId: string | null;
  mode: "test" | "live" | null;
  keySecretLast4: string | null;
  webhookSecretLast4: string | null;
  accountNumberLast4: string | null;
  payoutsEnabled: boolean;
  lastTest: { ok: boolean; at: string; message: string } | null;
  connectedAt: string | null;
  encryptionConfigured: boolean;
  /** Platform owner only: this purpose runs on the platform env credentials (nothing connected here covers it). */
  usingPlatformEnv: { payments: boolean; payouts: boolean };
  webhookUrls: { payments: string; payouts: string };
}

function modeOf(keyId: string | null): "test" | "live" | null {
  const m = keyId?.match(/^rzp_(test|live)_/);
  return m ? (m[1] as "test" | "live") : null;
}

/** On `*.localhost` (development) the port comes from the request's Host header. */
async function localHostHint(): Promise<string | null> {
  if (platformRootDomain() !== "localhost") return null;
  try {
    return (await headers()).get("host");
  } catch (err) {
    unstable_rethrow(err);
    return null;
  }
}

/**
 * The origin shown in the webhook URLs. The route resolves the company from
 * the path, so any host serving the app works; we pick the most permanent
 * one: the company's automatic subdomain (can't be removed, unlike a custom
 * domain), or for the platform owner its long-standing site URL.
 */
async function webhookOrigin(companyId: string): Promise<string> {
  const company = await getCompany(companyId);
  if (!company || company.isPlatformOwner) return companySiteUrl();
  return companyBaseUrl(company.slug, await localHostHint());
}

export function paymentWebhookPaths(companyId: string): { payments: string; payouts: string } {
  const id = encodeURIComponent(companyId);
  return { payments: `/api/cashflow-ai/webhooks/razorpay/${id}`, payouts: `/api/talentos/payroll/webhook/${id}` };
}

export async function getPaymentAccountView(): Promise<PaymentAccountView> {
  const companyId = await currentCompanyId();
  const [stored, origin, owner] = await Promise.all([readStored(), webhookOrigin(companyId), isPlatformOwnerContext()]);
  const paths = paymentWebhookPaths(companyId);
  const webhookUrls = { payments: `${origin}${paths.payments}`, payouts: `${origin}${paths.payouts}` };
  const encryptionConfigured = isPlatformEncryptionConfigured();
  const own = await resolveStored(stored, companyId);
  const usingPlatformEnv = {
    payments: owner && own.kind === "none" && envCredentials("payments") !== null,
    payouts: owner && own.kind !== "unreadable" && !(own.kind === "ok" && own.payoutsEnabled && own.creds.accountNumber) && envCredentials("payouts") !== null,
  };

  if (!stored) {
    return {
      status: "not_connected",
      keyId: null,
      mode: null,
      keySecretLast4: null,
      webhookSecretLast4: null,
      accountNumberLast4: null,
      payoutsEnabled: false,
      lastTest: null,
      connectedAt: null,
      encryptionConfigured,
      usingPlatformEnv,
      webhookUrls,
    };
  }
  return {
    status: own.kind === "ok" ? "connected" : "unreadable",
    keyId: stored.keyId,
    mode: modeOf(stored.keyId),
    keySecretLast4: stored.keySecretLast4,
    webhookSecretLast4: stored.webhookSecretLast4,
    accountNumberLast4: stored.accountNumberLast4,
    payoutsEnabled: stored.payoutsEnabled,
    lastTest: stored.lastTest ? { ok: stored.lastTest.ok, at: stored.lastTest.at.toISOString(), message: stored.lastTest.message } : null,
    connectedAt: stored.connectedAt.toISOString(),
    encryptionConfigured,
    usingPlatformEnv,
    webhookUrls,
  };
}

// ---------------------------------------------------------------------------
// Save / test / disconnect
// ---------------------------------------------------------------------------

export interface PaymentAccountInput {
  keyId: string;
  /** Blank keeps the stored secret (required when connecting for the first time). */
  keySecret: string;
  /** Blank keeps the stored webhook secret. */
  webhookSecret: string;
  payoutsEnabled: boolean;
  /** Blank keeps the stored account number. */
  accountNumber: string;
}

export type PaymentAccountResult =
  | { ok: true; account: PaymentAccountView; message?: string }
  | { ok: false; error: string; errors?: Partial<Record<keyof PaymentAccountInput, string>>; account?: PaymentAccountView };

/** Who made a change, for the company's (FMS) audit trail. */
export interface PaymentAccountActor {
  id: string;
  email?: string | null;
}

export const KEY_ID_PATTERN = /^rzp_(test|live)_[A-Za-z0-9]{8,32}$/;
const SECRET_PATTERN = /^\S{8,128}$/;
const ACCOUNT_NUMBER_PATTERN = /^[A-Za-z0-9]{6,32}$/;
const ENCRYPTION_MISSING_MESSAGE = "Secure storage for payment keys isn't set up on this server yet (PLATFORM_ENCRYPTION_KEY), so they can't be saved. Ask your platform administrator to configure it.";
const AUDIT_ENTITY_ID = "payment_account:razorpay";

export function validateKeyId(keyId: string): string | null {
  if (!keyId) return "Enter your Razorpay Key ID.";
  if (!KEY_ID_PATTERN.test(keyId)) return "That doesn't look like a Razorpay Key ID — it starts with rzp_test_ or rzp_live_.";
  return null;
}

/** Connect/disconnect/key changes go into the company's FMS audit trail (collections land in FMS). Never a secret — last 4 at most. */
async function audit(actor: PaymentAccountActor | null, action: "create" | "update" | "delete", summary: string, metadata: Record<string, unknown>) {
  await recordAudit({
    actorId: actor?.id ?? "system",
    actorEmail: actor?.email ?? null,
    action,
    entity: "settings",
    entityId: AUDIT_ENTITY_ID,
    entityLabel: "Razorpay account",
    summary,
    metadata,
  });
}

export async function savePaymentAccount(raw: PaymentAccountInput, actor: PaymentAccountActor | null): Promise<PaymentAccountResult> {
  const input = {
    keyId: String(raw?.keyId ?? "").trim(),
    keySecret: String(raw?.keySecret ?? "").trim(),
    webhookSecret: String(raw?.webhookSecret ?? "").trim(),
    payoutsEnabled: raw?.payoutsEnabled === true,
    accountNumber: String(raw?.accountNumber ?? "").replace(/\s+/g, ""),
  };
  if (!isPlatformEncryptionConfigured()) return { ok: false, error: ENCRYPTION_MISSING_MESSAGE };

  const companyId = await currentCompanyId();
  const stored = await readStored();
  // A record whose secrets can't be decrypted (key changed) must be re-entered in full.
  const storedReadable = stored ? decrypt(stored.keySecret, companyId, "keySecret") !== null : false;
  const existing = storedReadable ? stored : null;

  const errors: Partial<Record<keyof PaymentAccountInput, string>> = {};
  const keyIdError = validateKeyId(input.keyId);
  if (keyIdError) errors.keyId = keyIdError;
  if (!input.keySecret && !existing) errors.keySecret = "Enter your Razorpay Key Secret.";
  else if (input.keySecret && !SECRET_PATTERN.test(input.keySecret)) errors.keySecret = "The Key Secret should be 8–128 characters with no spaces.";
  if (input.webhookSecret && !SECRET_PATTERN.test(input.webhookSecret)) errors.webhookSecret = "The webhook secret should be 8–128 characters with no spaces.";
  if (input.accountNumber && !ACCOUNT_NUMBER_PATTERN.test(input.accountNumber)) errors.accountNumber = "Enter the RazorpayX account number (letters and digits only).";
  if (input.payoutsEnabled && !input.accountNumber && !existing?.accountNumber) errors.accountNumber = "Enter your RazorpayX account number to enable salary payouts.";
  if (Object.keys(errors).length) return { ok: false, error: "Please fix the highlighted fields.", errors };

  // Keys from a different Razorpay account invalidate the kept secrets too.
  const sameAccount = existing?.keyId === input.keyId;
  if (existing && !sameAccount && !input.keySecret) {
    return { ok: false, error: "Please fix the highlighted fields.", errors: { keySecret: "Enter the Key Secret for this new Key ID." } };
  }

  const now = new Date();
  const doc: Omit<StoredRazorpayAccount, "_id"> = {
    keyId: input.keyId,
    keySecret: input.keySecret ? encrypt(input.keySecret, companyId, "keySecret") : existing!.keySecret,
    keySecretLast4: input.keySecret ? last4(input.keySecret) : existing!.keySecretLast4,
    webhookSecret: input.webhookSecret ? encrypt(input.webhookSecret, companyId, "webhookSecret") : sameAccount ? existing!.webhookSecret : null,
    webhookSecretLast4: input.webhookSecret ? last4(input.webhookSecret) : sameAccount ? existing!.webhookSecretLast4 : null,
    accountNumber: input.accountNumber ? encrypt(input.accountNumber, companyId, "accountNumber") : sameAccount ? existing!.accountNumber : null,
    accountNumberLast4: input.accountNumber ? last4(input.accountNumber) : sameAccount ? existing!.accountNumberLast4 : null,
    payoutsEnabled: input.payoutsEnabled,
    // New secrets haven't been tested yet.
    lastTest: sameAccount && !input.keySecret && !input.accountNumber ? existing!.lastTest : null,
    connectedAt: stored?.connectedAt ?? now,
    updatedAt: now,
    updatedBy: actor?.id ?? null,
  };
  await (await collection()).replaceOne({ _id: RAZORPAY }, doc as StoredRazorpayAccount, { upsert: true });

  const changed = [
    !stored || stored.keyId !== input.keyId ? "key ID" : null,
    input.keySecret ? "key secret" : null,
    input.webhookSecret ? "webhook secret" : null,
    input.accountNumber ? "RazorpayX account" : null,
    stored && stored.payoutsEnabled !== input.payoutsEnabled ? `payouts ${input.payoutsEnabled ? "on" : "off"}` : null,
  ].filter(Boolean);
  await audit(actor, stored ? "update" : "create", stored ? `Razorpay account updated${changed.length ? `: ${changed.join(", ")}` : ""}` : `Razorpay account connected (${input.keyId})`, {
    keyId: input.keyId,
    mode: modeOf(input.keyId),
    payoutsEnabled: input.payoutsEnabled,
  });
  {
    const { alertOwners } = await import("@/lib/products/cashflow-ai/payment-alerts");
    await alertOwners("The Razorpay connection was changed", [`${actor?.email ?? "A user"} ${stored ? `changed the Razorpay settings (${changed.join(", ") || "no keys"})` : `connected Razorpay (${input.keyId})`}.`, "Keys and the RazorpayX account decide where payments are sent from. If this was not you, disconnect Razorpay now and change your password."]);
  }
  return { ok: true, account: await getPaymentAccountView(), message: stored ? "Razorpay settings saved." : "Razorpay connected. Run “Test connection” to check the keys." };
}

async function rzpGet(path: string, creds: RazorpayCredentials): Promise<{ status: number } | { error: string }> {
  try {
    const res = await fetch(`${RZP_API}${path}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${creds.keyId}:${creds.keySecret}`).toString("base64")}` },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    return { status: res.status };
  } catch {
    return { error: "Couldn't reach Razorpay. Please try again in a minute." };
  }
}

/** A cheap authenticated read against Razorpay (and RazorpayX, when payouts are on). Records the outcome. Tests the company's OWN keys only. */
export async function testPaymentAccount(): Promise<PaymentAccountResult> {
  const companyId = await currentCompanyId();
  const stored = await readStored();
  if (!stored) return { ok: false, error: "Connect a Razorpay account first." };
  const own = await resolveStored(stored, companyId);
  if (own.kind !== "ok") return { ok: false, error: "The stored credentials can't be read. Enter your keys again and save." };
  const creds = own.creds;

  let result: { ok: boolean; message: string };
  const payments = await rzpGet("/payments?count=1", creds);
  if ("error" in payments) result = { ok: false, message: payments.error };
  else if (payments.status === 401) result = { ok: false, message: "Razorpay rejected these keys. Check the Key ID and Key Secret." };
  else if (payments.status !== 200) result = { ok: false, message: `Razorpay answered with an unexpected status (${payments.status}).` };
  else result = { ok: true, message: `Connected to Razorpay (${modeOf(creds.keyId) === "live" ? "live" : "test"} mode).` };

  if (result.ok && stored.payoutsEnabled && creds.accountNumber) {
    const payouts = await rzpGet(`/transactions?account_number=${encodeURIComponent(creds.accountNumber)}&count=1`, creds);
    if ("error" in payouts) result = { ok: false, message: payouts.error };
    else if (payouts.status !== 200) result = { ok: false, message: "Payments work, but RazorpayX didn't accept the account number. Check it, and that RazorpayX is activated for these keys." };
    else result = { ok: true, message: `${result.message} RazorpayX payouts account verified.` };
  }

  await (await collection()).updateOne({ _id: RAZORPAY }, { $set: { lastTest: { ...result, at: new Date() } } });
  const account = await getPaymentAccountView();
  return result.ok ? { ok: true, account, message: result.message } : { ok: false, error: result.message, account };
}

export async function disconnectPaymentAccount(actor: PaymentAccountActor | null): Promise<PaymentAccountResult> {
  const removed = await (await collection()).findOneAndDelete({ _id: RAZORPAY });
  if (removed) await audit(actor, "delete", `Razorpay account disconnected (${removed.keyId})`, { keyId: removed.keyId });
  if (removed) {
    const { alertOwners } = await import("@/lib/products/cashflow-ai/payment-alerts");
    await alertOwners("Razorpay was disconnected", [`${actor?.email ?? "A user"} disconnected Razorpay (${removed.keyId}). Payments and payouts stop until it is connected again.`]);
  }
  return { ok: true, account: await getPaymentAccountView(), message: "Razorpay disconnected. Stored keys were deleted." };
}
