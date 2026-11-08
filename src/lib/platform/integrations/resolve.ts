import "server-only";
import { siteUrl } from "@/lib/seo";
import { decryptPlatformSecret } from "@/lib/platform/crypto";
import { loadIntegrationsDoc, resolvedRootDomain, type IntegrationsDoc, type StoredSecret } from "@/lib/platform/integrations/store";
import type { VercelConfig } from "@/lib/platform/domains/vercel";

/**
 * The effective email and domain provider configuration, resolved per field:
 *
 *   1. the value saved in Platform Console → Integrations (`platform_settings`)
 *   2. else the environment variable deployments have always used
 *   3. else the built-in default
 *
 * So an env-only deployment keeps working with nothing saved, and anything
 * saved takes over without a redeploy. Only the DB document is cached (see
 * `store.ts`); env is read on every call. Server-only: the resolved values
 * include decrypted credentials and must never reach the browser.
 */

export type ConfigSource = "db" | "env" | "default";

export const SECRET_CONTEXT = {
  resendApiKey: "integrations:resend:apiKey",
  vercelToken: "integrations:vercel:apiToken",
} as const;

export const EMAIL_PROVIDERS = ["resend", "console"] as const;
export const DOMAIN_PROVIDERS = ["vercel", "manual"] as const;
export type EmailProviderId = (typeof EMAIL_PROVIDERS)[number];
export type DomainProviderId = (typeof DOMAIN_PROVIDERS)[number];

/** The sender when none is set: `no-reply@` on the platform's own root domain (Console → Integrations, `PLATFORM_ROOT_DOMAIN`, or the production domain). */
export function defaultEmailFrom(): string {
  const root = resolvedRootDomain().replace(/:\d+$/, "");
  return `SelfRun AI <no-reply@${root === "localhost" ? new URL(siteUrl).hostname : root}>`;
}

function env(name: string): string | null {
  return process.env[name]?.trim() || null;
}

/** A stored secret, decrypted; null when absent or undecryptable (wrong / missing key). */
function openSecret(stored: StoredSecret | null | undefined, context: string): string | null {
  return stored ? decryptPlatformSecret(stored.enc, context) : null;
}

function pick(db: string | null | undefined, envName: string, fallback: string | null): { value: string | null; source: ConfigSource } {
  const saved = db?.trim();
  if (saved) return { value: saved, source: "db" };
  const fromEnv = env(envName);
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: fallback, source: "default" };
}

function pickSecret(stored: StoredSecret | null | undefined, context: string, envName: string): { value: string | null; source: ConfigSource | null } {
  const saved = openSecret(stored, context);
  if (saved) return { value: saved, source: "db" };
  const fromEnv = env(envName);
  if (fromEnv) return { value: fromEnv, source: "env" };
  return { value: null, source: null };
}

export interface ResolvedEmailConfig {
  provider: EmailProviderId;
  providerSource: ConfigSource;
  /** The provider was chosen on purpose (not inferred) — the console adapter only sends in production when explicit. */
  explicit: boolean;
  resendApiKey: string | null;
  apiKeySource: ConfigSource | null;
  from: string;
  fromSource: ConfigSource;
}

export function emailConfigFrom(doc: IntegrationsDoc | null): ResolvedEmailConfig {
  const apiKey = pickSecret(doc?.email?.resendApiKey, SECRET_CONTEXT.resendApiKey, "RESEND_API_KEY");
  const from = pick(doc?.email?.from, "EMAIL_FROM", defaultEmailFrom());

  let provider: EmailProviderId;
  let providerSource: ConfigSource;
  const saved = doc?.email?.provider;
  const fromEnv = env("EMAIL_PROVIDER")?.toLowerCase();
  if (saved && (EMAIL_PROVIDERS as readonly string[]).includes(saved)) {
    provider = saved;
    providerSource = "db";
  } else if (fromEnv) {
    if (!(EMAIL_PROVIDERS as readonly string[]).includes(fromEnv)) throw new Error(`Unknown EMAIL_PROVIDER "${fromEnv}" (expected one of: ${EMAIL_PROVIDERS.join(", ")})`);
    provider = fromEnv as EmailProviderId;
    providerSource = "env";
  } else {
    provider = apiKey.value ? "resend" : "console";
    providerSource = "default";
  }
  return { provider, providerSource, explicit: providerSource !== "default", resendApiKey: apiKey.value, apiKeySource: apiKey.source, from: from.value!, fromSource: from.source };
}

export async function resolveEmailConfig(): Promise<ResolvedEmailConfig> {
  return emailConfigFrom(await loadIntegrationsDoc());
}

export interface ResolvedDomainConfig {
  provider: DomainProviderId;
  providerSource: ConfigSource;
  /** Null unless both a token and a project id are available. */
  vercel: VercelConfig | null;
  tokenSource: ConfigSource | null;
  projectSource: ConfigSource;
  teamSource: ConfigSource;
  rootDomain: string;
  rootDomainSource: ConfigSource;
}

export function domainConfigFrom(doc: IntegrationsDoc | null): ResolvedDomainConfig {
  const d = doc?.domains;
  const token = pickSecret(d?.vercelToken, SECRET_CONTEXT.vercelToken, "VERCEL_API_TOKEN");
  const project = pick(d?.vercelProjectId, "VERCEL_PROJECT_ID", null);
  const team = pick(d?.vercelTeamId, "VERCEL_TEAM_ID", null);
  const vercel = token.value && project.value ? { token: token.value, project: project.value, team: team.value } : null;

  const savedRoot = d?.rootDomain?.trim().toLowerCase();
  const envRoot = (process.env.PLATFORM_ROOT_DOMAIN ?? "").split(",")[0].trim().toLowerCase();
  const rootDomainSource: ConfigSource = savedRoot ? "db" : envRoot ? "env" : "default";

  let provider: DomainProviderId;
  let providerSource: ConfigSource;
  const saved = d?.provider;
  const fromEnv = env("DOMAIN_PROVIDER")?.toLowerCase();
  if (saved && (DOMAIN_PROVIDERS as readonly string[]).includes(saved)) {
    provider = saved;
    providerSource = "db";
  } else if (fromEnv) {
    if (!(DOMAIN_PROVIDERS as readonly string[]).includes(fromEnv)) throw new Error(`Unknown DOMAIN_PROVIDER "${fromEnv}" (expected one of: ${DOMAIN_PROVIDERS.join(", ")})`);
    provider = fromEnv as DomainProviderId;
    providerSource = "env";
  } else {
    provider = vercel ? "vercel" : "manual";
    providerSource = "default";
  }
  return {
    provider,
    providerSource,
    vercel,
    tokenSource: token.source,
    projectSource: project.source,
    teamSource: team.source,
    rootDomain: savedRoot || envRoot || "localhost",
    rootDomainSource,
  };
}

export async function resolveDomainConfig(): Promise<ResolvedDomainConfig> {
  return domainConfigFrom(await loadIntegrationsDoc());
}
