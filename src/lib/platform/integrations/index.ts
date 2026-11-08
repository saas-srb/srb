import "server-only";
import { decryptPlatformSecret, encryptPlatformSecret, isPlatformEncryptionConfigured, last4 } from "@/lib/platform/crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { forgetCompanyRouting, normalizeHost } from "@/lib/platform/tenancy/companies";
import { forgetCompanySiteUrls } from "@/lib/platform/tenancy/site-url";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";
import { checkVercelAccess } from "@/lib/platform/domains/vercel";
import { platformEmailIdentity } from "@/lib/platform/settings";
import { bustIntegrationsCache, INTEGRATIONS_DOC_ID, loadIntegrationsDoc, type IntegrationsDoc, type StoredSecret } from "@/lib/platform/integrations/store";
import {
  DOMAIN_PROVIDERS,
  EMAIL_PROVIDERS,
  SECRET_CONTEXT,
  domainConfigFrom,
  emailConfigFrom,
  resolveDomainConfig,
  type ConfigSource,
  type DomainProviderId,
  type EmailProviderId,
} from "@/lib/platform/integrations/resolve";

/**
 * Platform Console → Integrations: the email and domain providers, stored in
 * `platform_settings` (`_id: "integrations"`). Secrets are encrypted with
 * `encryptPlatformSecret` and only their last four characters ever leave
 * the server. What's effective is resolved per field, DB → env → default
 * (`resolve.ts`), so an env-only deployment keeps working untouched.
 */

export { resolveDomainConfig, resolveEmailConfig } from "@/lib/platform/integrations/resolve";
export type { ConfigSource } from "@/lib/platform/integrations/resolve";

// ── View (client-safe: no secrets, no ciphertext) ────────────────────────────

export interface SecretView {
  /** A value is stored in the Platform Console. */
  saved: boolean;
  /** Where the effective value comes from; null = none anywhere. */
  source: ConfigSource | null;
  last4: string | null;
  /** The stored value can't be decrypted (PLATFORM_ENCRYPTION_KEY missing or changed). */
  unreadable: boolean;
}

export interface FieldView {
  /** What's stored in the Platform Console ("" = nothing; env/default applies). */
  saved: string;
  effective: string;
  source: ConfigSource;
}

export interface IntegrationsView {
  encryptionConfigured: boolean;
  email: { provider: FieldView; apiKey: SecretView; from: FieldView };
  domains: { provider: FieldView; token: SecretView; projectId: FieldView; teamId: FieldView; rootDomain: FieldView };
  updatedAt: string | null;
}

function secretView(stored: StoredSecret | null | undefined, context: string, envName: string, effectiveSource: ConfigSource | null): SecretView {
  const unreadable = Boolean(stored) && decryptPlatformSecret(stored!.enc, context) === null;
  const envValue = process.env[envName]?.trim();
  const shown = effectiveSource === "db" ? (stored?.last4 ?? null) : effectiveSource === "env" && envValue ? last4(envValue) : null;
  return { saved: Boolean(stored), source: effectiveSource, last4: shown, unreadable };
}

/** Everything the Integrations page shows. Never contains a secret or its ciphertext. */
export async function getIntegrationsView(): Promise<IntegrationsView> {
  const doc = await loadIntegrationsDoc();
  let email: ReturnType<typeof emailConfigFrom> | null = null;
  let domains: ReturnType<typeof domainConfigFrom> | null = null;
  // An invalid EMAIL_PROVIDER / DOMAIN_PROVIDER env value throws; show it as "not set" rather than failing the page.
  try {
    email = emailConfigFrom(doc);
  } catch {}
  try {
    domains = domainConfigFrom(doc);
  } catch {}
  const e = doc?.email;
  const d = doc?.domains;
  return {
    encryptionConfigured: isPlatformEncryptionConfigured(),
    email: {
      provider: { saved: e?.provider ?? "", effective: email?.provider ?? "", source: email?.providerSource ?? "default" },
      apiKey: secretView(e?.resendApiKey, SECRET_CONTEXT.resendApiKey, "RESEND_API_KEY", email?.apiKeySource ?? null),
      from: { saved: e?.from ?? "", effective: email?.from ?? "", source: email?.fromSource ?? "default" },
    },
    domains: {
      provider: { saved: d?.provider ?? "", effective: domains?.provider ?? "", source: domains?.providerSource ?? "default" },
      token: secretView(d?.vercelToken, SECRET_CONTEXT.vercelToken, "VERCEL_API_TOKEN", domains?.tokenSource ?? null),
      projectId: { saved: d?.vercelProjectId ?? "", effective: domains?.vercel?.project ?? process.env.VERCEL_PROJECT_ID?.trim() ?? "", source: domains?.projectSource ?? "default" },
      teamId: { saved: d?.vercelTeamId ?? "", effective: domains?.vercel?.team ?? process.env.VERCEL_TEAM_ID?.trim() ?? "", source: domains?.teamSource ?? "default" },
      rootDomain: { saved: d?.rootDomain ?? "", effective: domains?.rootDomain ?? "", source: domains?.rootDomainSource ?? "default" },
    },
    updatedAt: doc?.updatedAt ? doc.updatedAt.toISOString() : null,
  };
}

// ── Save ─────────────────────────────────────────────────────────────────────

export interface IntegrationsInput {
  email: {
    /** "" = automatic (env / default). */
    provider: "" | EmailProviderId;
    /** New API key; empty = keep what's stored. */
    apiKey: string;
    clearApiKey: boolean;
    from: string;
  };
  domains: {
    provider: "" | DomainProviderId;
    /** New API token; empty = keep what's stored. */
    token: string;
    clearToken: boolean;
    projectId: string;
    teamId: string;
    rootDomain: string;
  };
}

export type IntegrationsResult = { ok: true } | { ok: false; errors: Record<string, string> };

const FROM_RE = /^(?:[^<>]{1,80}\s)?<?[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>?$/;
const VERCEL_ID_RE = /^[A-Za-z0-9_-]{1,100}$/;
const SECRET_RE = /^\S{8,500}$/;
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function validRootDomain(host: string): boolean {
  if (host === "localhost") return true;
  const labels = host.split(".");
  return labels.length >= 2 && labels.every((l) => LABEL_RE.test(l)) && /^[a-z]{2,63}$|^xn--/.test(labels[labels.length - 1]);
}

export async function saveIntegrations(input: IntegrationsInput, actorId: string): Promise<IntegrationsResult> {
  const errors: Record<string, string> = {};
  const str = (v: unknown) => String(v ?? "").trim();

  const emailProvider = str(input?.email?.provider);
  if (emailProvider && !(EMAIL_PROVIDERS as readonly string[]).includes(emailProvider)) errors["email.provider"] = "Choose Resend or Console.";
  const apiKey = str(input?.email?.apiKey);
  const clearApiKey = Boolean(input?.email?.clearApiKey);
  if (apiKey && !SECRET_RE.test(apiKey)) errors["email.apiKey"] = "That doesn't look like an API key.";
  const from = str(input?.email?.from);
  if (from && !FROM_RE.test(from)) errors["email.from"] = 'Use an address, or "Name <address>".';

  const domainProvider = str(input?.domains?.provider);
  if (domainProvider && !(DOMAIN_PROVIDERS as readonly string[]).includes(domainProvider)) errors["domains.provider"] = "Choose Vercel or Manual.";
  const token = str(input?.domains?.token);
  const clearToken = Boolean(input?.domains?.clearToken);
  if (token && !SECRET_RE.test(token)) errors["domains.token"] = "That doesn't look like an API token.";
  const projectId = str(input?.domains?.projectId);
  if (projectId && !VERCEL_ID_RE.test(projectId)) errors["domains.projectId"] = "Use the project id from Vercel (letters, digits, - and _).";
  const teamId = str(input?.domains?.teamId);
  if (teamId && !VERCEL_ID_RE.test(teamId)) errors["domains.teamId"] = "Use the team id from Vercel (letters, digits, - and _).";
  const rootRaw = str(input?.domains?.rootDomain);
  const rootDomain = rootRaw ? normalizeHost(rootRaw) : "";
  if (rootRaw && (!rootDomain || !validRootDomain(rootDomain))) errors["domains.rootDomain"] = "Enter a domain, e.g. example.com.";

  if ((apiKey || token) && !isPlatformEncryptionConfigured()) {
    const msg = "Set PLATFORM_ENCRYPTION_KEY on the server before saving credentials here.";
    if (apiKey) errors["email.apiKey"] = msg;
    if (token) errors["domains.token"] = msg;
  }
  if (Object.keys(errors).length) return { ok: false, errors };

  const before = await loadIntegrationsDoc();
  const now = new Date();
  const seal = (plain: string, context: string): StoredSecret => ({ enc: encryptPlatformSecret(plain, context), last4: last4(plain), updatedAt: now });

  const next: Omit<IntegrationsDoc, "_id"> = {
    email: {
      provider: (emailProvider || null) as EmailProviderId | null,
      resendApiKey: apiKey ? seal(apiKey, SECRET_CONTEXT.resendApiKey) : clearApiKey ? null : (before?.email?.resendApiKey ?? null),
      from: from || null,
    },
    domains: {
      provider: (domainProvider || null) as DomainProviderId | null,
      vercelToken: token ? seal(token, SECRET_CONTEXT.vercelToken) : clearToken ? null : (before?.domains?.vercelToken ?? null),
      vercelProjectId: projectId || null,
      vercelTeamId: teamId || null,
      rootDomain: rootDomain || null,
    },
    updatedAt: now,
    updatedBy: actorId,
  };

  const db = await getPlatformDb();
  await db.collection<IntegrationsDoc>("platform_settings").updateOne({ _id: INTEGRATIONS_DOC_ID }, { $set: next }, { upsert: true });
  bustIntegrationsCache();
  await loadIntegrationsDoc();

  // Secret-free audit detail: which fields changed; secrets only as set / cleared.
  const changed: string[] = [];
  const cmp = (key: string, a: unknown, b: unknown) => {
    if ((a ?? null) !== (b ?? null)) changed.push(key);
  };
  cmp("email.provider", before?.email?.provider, next.email!.provider);
  cmp("email.from", before?.email?.from, next.email!.from);
  cmp("domains.provider", before?.domains?.provider, next.domains!.provider);
  cmp("domains.vercelProjectId", before?.domains?.vercelProjectId, next.domains!.vercelProjectId);
  cmp("domains.vercelTeamId", before?.domains?.vercelTeamId, next.domains!.vercelTeamId);
  cmp("domains.rootDomain", before?.domains?.rootDomain, next.domains!.rootDomain);
  const secrets: Record<string, "set" | "cleared"> = {};
  if (apiKey) secrets["email.apiKey"] = "set";
  else if (clearApiKey && before?.email?.resendApiKey) secrets["email.apiKey"] = "cleared";
  if (token) secrets["domains.token"] = "set";
  else if (clearToken && before?.domains?.vercelToken) secrets["domains.token"] = "cleared";

  if (changed.includes("domains.rootDomain")) {
    // New addresses (and routing of the new root) apply now; existing records keep their hosts.
    forgetCompanyRouting();
    forgetCompanySiteUrls();
  }
  if (changed.length || Object.keys(secrets).length) {
    await recordPlatformAudit({ actorId, action: "settings.integrations.update", target: { type: "platform_settings", id: INTEGRATIONS_DOC_ID }, details: { changed, secrets } });
  }
  return { ok: true };
}

// ── Test buttons ─────────────────────────────────────────────────────────────

export type TestResult = { ok: true; message: string } | { ok: false; error: string };

/** Sends a test email through the effective configuration to `to` (the signed-in admin). */
export async function sendIntegrationsTestEmail(to: string, actorId: string): Promise<TestResult> {
  const platform = await platformEmailIdentity();
  const { html, text } = renderEmail({
    brand: platform.name,
    heading: "Test email",
    paragraphs: ["This is a test from Platform Console → Integrations. If you can read it, outgoing email works."],
    footnote: `Sent ${new Date().toUTCString()}.`,
  });
  const res = await sendEmail({ to, subject: `${platform.name}: test email`, html, text });
  await recordPlatformAudit({ actorId, action: "integrations.email.test", target: { type: "platform_settings", id: INTEGRATIONS_DOC_ID }, details: { ok: res.ok } });
  return res.ok ? { ok: true, message: `Sent to ${to}. Check the inbox (and spam).` } : { ok: false, error: res.error };
}

/** Read-only check that the effective Vercel token can see the configured project. */
export async function testDomainProvider(actorId: string): Promise<TestResult> {
  let cfg;
  try {
    cfg = await resolveDomainConfig();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (cfg.provider === "manual") return { ok: true, message: "Manual provider: nothing to check. Hosts are attached by the operator." };
  if (!cfg.vercel) return { ok: false, error: "Vercel needs both an API token and a project id." };
  const res = await checkVercelAccess(cfg.vercel);
  await recordPlatformAudit({ actorId, action: "integrations.domains.test", target: { type: "platform_settings", id: INTEGRATIONS_DOC_ID }, details: { ok: res.ok } });
  return res.ok ? { ok: true, message: `Connected to Vercel project "${res.projectName}".` } : res;
}
