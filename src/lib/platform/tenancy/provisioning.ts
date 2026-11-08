import "server-only";
import type { BusinessSelection } from "@/lib/platform/business-taxonomy";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { slugFormatError } from "@/lib/platform/tenancy/slug";
import { APP_SLUG_SUFFIX, COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, forgetCompanyRouting, type Company, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { activeDomainProvider, type DomainStatus } from "@/lib/platform/domains";
import { loadIntegrationsDoc, resolvedRootDomain } from "@/lib/platform/integrations/store";
import { getPlatformSettings, reservedSlugError } from "@/lib/platform/settings";
import { getDb } from "@/lib/mongodb";
import { publishStarterWebsite } from "@/lib/platform/website/starter";
import { generateAiWebsite } from "@/lib/platform/website/ai/apply";
import { startTrial } from "@/lib/platform/billing/subscription";
import { isSubdomainOfRoot, rootDomainFromHost } from "@/lib/platform/tenancy/root-domain";

/**
 * Creating a company (tenant): the one code path used by self-serve sign-up, so every company gets an identical workspace.
 */

export { slugFormatError, slugFromName } from "@/lib/platform/tenancy/slug";

export async function isSlugTaken(slug: string): Promise<boolean> {
  const db = await getPlatformDb();
  return (await db.collection<Company>(COMPANIES_COLLECTION).countDocuments({ slug }, { limit: 1 })) > 0;
}

/**
 * The root domain company subdomains live under: Platform Console →
 * Integrations, else `PLATFORM_ROOT_DOMAIN` (first entry), else `localhost`
 * in development. Synchronous — reads the integrations cache that the proxy
 * loads on every page request (async entry points call `loadIntegrationsDoc()` first).
 */
export function platformRootDomain(): string {
  return resolvedRootDomain();
}

/** `<slug>.<root>` — every company's automatic address. */
/**
 * True when the hosting project has the wildcard domain `*.<root>` (`PLATFORM_WILDCARD_SUBDOMAINS=1`): company subdomains
 * are then not attached one by one. See docs/deploy-vercel.md.
 */
export function wildcardSubdomainsEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test((process.env.PLATFORM_WILDCARD_SUBDOMAINS ?? "").trim());
}

export function companySubdomain(slug: string): string {
  return `${slug}.${platformRootDomain()}`;
}

/** `<slug>-app.<root>` — the address of a company's products (Workspace, HRMS, …); its website stays on `<slug>.<root>`. */
export function companyAppSubdomain(slug: string): string {
  return `${slug}${APP_SLUG_SUFFIX}.${platformRootDomain()}`;
}

/**
 * Absolute base URL for a company's workspace. On `localhost` it keeps the
 * port of the request the link is being built from (`hostHint`), since
 * `*.localhost` resolves to the same machine.
 */
export function companyBaseUrl(slug: string, hostHint?: string | null): string {
  return baseUrlFor(slug, hostHint);
}

/** Absolute base URL of a company's App host (`<slug>-app.<root>`): where Workspace and every other product live. */
export function companyAppBaseUrl(slug: string, hostHint?: string | null): string {
  return baseUrlFor(`${slug}${APP_SLUG_SUFFIX}`, hostHint);
}

function baseUrlFor(label: string, hostHint?: string | null): string {
  let root = platformRootDomain();
  if (root === "localhost" && process.env.NODE_ENV === "production") {
    // Production with no root domain configured must never print a localhost address: derive it from the host the
    // request came in on, and say so loudly — the real fix is PLATFORM_ROOT_DOMAIN (see docs/deploy-vercel.md).
    const derived = rootDomainFromHost(hostHint);
    if (derived) {
      console.error(`[tenancy] PLATFORM_ROOT_DOMAIN is not set; using "${derived}" from the request host. Set PLATFORM_ROOT_DOMAIN=${derived} in the environment.`);
      root = derived;
    }
  }
  if (root === "localhost") {
    const port = hostHint?.match(/:(\d+)$/)?.[1] ?? process.env.PORT ?? "3000";
    return `http://${label}.localhost:${port}`;
  }
  return `https://${label}.${root}`;
}

export interface NewCompany {
  name: string;
  slug: string;
  /** `emailVerified` omitted = the field isn't written (counts as verified: scripts, seeders). Self-serve sign-up passes false. */
  owner: { email: string; name: string; passwordHash: string; mustChangePassword: boolean; emailVerified?: boolean };
  /** The company's line of business (ISIC category + sub-category) chosen at registration. */
  business?: BusinessSelection;
  /** Self-serve sign-up waits for the AI-written website (its progress screen has a step for it); every other path writes it in the background. */
  aiWebsite?: "wait" | "background";
  /** The plan chosen on the pricing page: the company starts a free trial of it (default plan when absent). */
  plan?: { id: string; interval: "monthly" | "yearly" };
  /** Where the owner is, from the sign-up request. */
  hints?: { country?: string; languages?: string; timezone?: string };
}

export type ProvisionResult = { ok: true; companyId: string; adminId: string; host: string; hostingError: string | null } | { ok: false; error: string };

export async function createCompanyWithOwner(input: NewCompany): Promise<ProvisionResult> {
  const slugError = slugFormatError(input.slug) ?? (await reservedSlugError(input.slug));
  if (slugError) return { ok: false, error: slugError };
  // The root domain may be set in the Platform Console; make sure it's loaded (scripts have no proxy).
  await loadIntegrationsDoc();
  const host = companySubdomain(input.slug);

  const platform = await getPlatformDb();
  const companies = platform.collection<Company>(COMPANIES_COLLECTION);
  const domains = platform.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION);
  await companies.createIndex({ slug: 1 }, { unique: true });

  const now = new Date();
  // Locale / time zone defaults come from Platform Console → Platform settings.
  const defaults = await getPlatformSettings().catch(() => null);
  const company: Company = {
    _id: randomUUID(),
    slug: input.slug,
    name: input.name.trim(),
    status: "active",
    isPlatformOwner: false,
    ...(input.business ? { business: input.business } : {}),
    ...(input.hints && Object.values(input.hints).some(Boolean) ? { signupHints: input.hints } : {}),
    ...(defaults ? { locale: defaults.defaultLocale, timezone: defaults.defaultTimezone } : {}),
    createdAt: now,
    updatedAt: now,
  };
  try {
    await companies.insertOne(company);
  } catch (err) {
    // The unique index settles two sign-ups racing for the same address.
    if ((err as { code?: number }).code === 11000) return { ok: false, error: "That workspace address was just taken. Choose another." };
    throw err;
  }

  const adminId = await runAsCompany(company._id, async () => {
    const users = (await getDb()).collection("admin_users");
    await users.createIndex({ email: 1 }, { unique: true });
    const res = await users.insertOne({
      email: input.owner.email.trim().toLowerCase(),
      name: input.owner.name.trim(),
      passwordHash: input.owner.passwordHash,
      roles: ["super_admin"],
      manualRoles: ["super_admin"],
      customRoleIds: [],
      // Whoever registers a company is its Director.
      designationId: "director",
      status: "active",
      permissionOverrides: {},
      userType: "employee",
      notes: `Founding Director of ${company.name}`,
      employeeId: null,
      mustChangePassword: input.owner.mustChangePassword,
      ...(input.owner.emailVerified === undefined ? {} : { emailVerified: input.owner.emailVerified, ...(input.owner.emailVerified ? { emailVerifiedAt: now } : {}) }),
      failedLoginAttempts: 0,
      lockedUntil: null,
      createdAt: now,
      updatedAt: now,
    });
    // The Director's HR file in TalentOS (the rest of the profile is theirs to complete there). Never fails the sign-up.
    try {
      const { ensureHrFile } = await import("@/lib/products/commandos/employee-link");
      await ensureHrFile({ userId: res.insertedId, email: input.owner.email, name: input.owner.name, designationTitle: "Director", departmentName: "Management", actorId: String(res.insertedId) });
    } catch (err) {
      console.error(`[provisioning] HR file for the Director of ${company.slug} failed`, err);
    }
    return String(res.insertedId);
  });

  // The automatic subdomain. Routing works from the slug alone; this record is
  // what the Domains settings list, and the provider attach is what gives it TLS.
  await domains.updateOne(
    { _id: host },
    { $setOnInsert: { companyId: company._id, status: "verified", verificationToken: randomUUID(), isPrimary: true, kind: "subdomain", createdAt: now, verifiedAt: now } },
    { upsert: true },
  );
  // Its app host (`<slug>-app.<root>`) is derived from the slug and needs no record of its own, only the provider attach.
  const [hostingError, appHostingError] = await Promise.all([attachAtProvider(host), attachAtProvider(companyAppSubdomain(input.slug))]);
  forgetCompanyRouting();

  // Every new company starts on a free trial of the default plan. Non-fatal.
  await startTrial(company._id, input.plan?.id, input.plan?.interval).catch((err) => console.error(`[provisioning] trial for ${company.slug} failed`, err));

  // A working public site from minute one (neutral starter pages, editable in the CMS). Non-fatal.
  await runAsCompany(company._id, () => publishStarterWebsite()).catch((err) => console.error(`[provisioning] starter website for ${company.slug} failed`, err));

  // Then its own site, written by AI from the business categories it chose, replaces the starter. During self-serve sign-up we wait for it
  // (the sign-up progress screen has a "writing your website" step); elsewhere it is written in the background. The starter stays if AI
  // is unavailable or takes too long, and the company can retry from CMS → AI Website.
  if (process.env.AI_WEBSITE_ON_SIGNUP !== "0") {
    const build = () => runAsCompany(company._id, () => generateAiWebsite()).catch((err) => console.error(`[provisioning] AI website for ${company.slug} failed`, err));
    if (input.aiWebsite === "wait") {
      await Promise.race([build(), new Promise<void>((resolve) => setTimeout(resolve, 240_000))]);
    } else {
      try {
        const { after } = await import("next/server");
        after(build);
      } catch {
        // Outside a request (scripts, seeders): no automatic AI spend. Use CMS → AI Website to generate.
      }
    }
  }

  return { ok: true, companyId: company._id, adminId, host, hostingError: hostingError ?? appHostingError };
}

/**
 * Attaches a host at the hosting provider and records the outcome on its
 * domain record. Never throws — a provider outage mustn't fail a sign-up; the
 * Domains settings page shows the error and retries.
 */
export async function attachAtProvider(host: string): Promise<string | null> {
  return (await syncAtProvider(host, "add")).error;
}

export interface ProviderSync {
  providerId: string;
  /** null when the call failed (see `error`) or nothing needed attaching. */
  status: DomainStatus | null;
  error: string | null;
}

/**
 * One provider call for a host — `add` attaches it, `status` reads it,
 * `verify` asks the provider to re-check ownership now — with the outcome
 * stored on the domain record's `provider` field. Never throws.
 */
export async function syncAtProvider(host: string, op: "add" | "status" | "verify", store: { docId: string; field: "provider" | "appProvider" } = { docId: host, field: "provider" }): Promise<ProviderSync> {
  const platform = await getPlatformDb();
  const domains = platform.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION);
  // A *.localhost address needs nothing attached anywhere.
  if (host.endsWith(".localhost")) return { providerId: "none", status: null, error: null };
  // With a wildcard domain (*.<root>) on the hosting project, every automatic company address is already served with TLS:
  // nothing is attached per company (which also keeps the project's domain count flat). Custom domains are never covered.
  if (wildcardSubdomainsEnabled() && isSubdomainOfRoot(host, platformRootDomain())) {
    const state: DomainStatus = { attached: true, verified: true, dnsConfigured: true, records: [] };
    await domains.updateOne({ _id: store.docId }, { $set: { [store.field]: { id: "wildcard", ...state, error: null, checkedAt: new Date(), challenged: false } } });
    return { providerId: "wildcard", status: state, error: null };
  }
  const provider = await activeDomainProvider();
  let error: string | null = null;
  let status: DomainStatus | null = null;
  try {
    const res = await provider[op](host);
    if (res.ok) status = res.value;
    else error = res.error;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const state = status ?? { attached: false, verified: false, dnsConfigured: false, records: [] };
  // Once the provider has demanded its own ownership proof (a TXT challenge),
  // that stays on record: it's what lets custom.ts trust a later "verified".
  const previous = await domains.findOne({ _id: store.docId }, { projection: { provider: 1, appProvider: 1 } });
  const challenged = Boolean(previous?.[store.field]?.challenged) || (!state.verified && state.records.some((r) => r.type === "TXT"));
  await domains.updateOne({ _id: store.docId }, { $set: { [store.field]: { id: provider.id, ...state, error, checkedAt: new Date(), challenged } } });
  // Keep every record the provider asked for: once it is published the provider stops listing it, but the owner may need it again.
  for (const r of state.records) {
    await domains.updateOne(
      { _id: store.docId, dnsLog: { $not: { $elemMatch: { type: r.type, name: r.name, value: r.value } } } },
      { $push: { dnsLog: { host, type: r.type, name: r.name, value: r.value, reason: r.reason, seenAt: new Date() } } },
    );
  }
  if (error) console.error(`[domains] ${op} ${host} at ${provider.id} failed`, error);
  return { providerId: provider.id, status, error };
}
