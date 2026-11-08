import { platformEvents } from "@/lib/notify/triggers/platform";
import "server-only";
import type { Filter } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, forgetCompanyRouting, type Company, type CompanyDomain, type CompanyStatus } from "@/lib/platform/tenancy/companies";
import { panelLabels } from "@/lib/platform/panels/choices";
import { MODULES, ONBOARDING_STEPS } from "@/lib/platform/onboarding/catalog";
import type { CompanyProfile, OnboardingState } from "@/lib/platform/onboarding/state";
import type { StoredBranding } from "@/lib/platform/branding/types";
import { countAwaitingApproval } from "@/lib/platform/signup";

/**
 * The platform owner's view across every company. Everything here reads the
 * RAW database (`getPlatformDb()`), never `getDb()`: the console is
 * deliberately cross-company, so per-company figures come from explicit
 * `companyId` filters on the unscoped collections. It only ever reads
 * registry-level facts (who owns a company, how many users, setup progress)
 * — never a company's business data.
 */

const USERS = "admin_users";
export const CONSOLE_PAGE_SIZE = 20;

type CompanyDoc = Company & { profile?: CompanyProfile; onboarding?: OnboardingState; enabledModules?: string[]; branding?: StoredBranding; statusChangedAt?: Date; statusChangedBy?: string };

export interface OnboardingProgress {
  done: number;
  total: number;
  completedAt: Date | null;
  dismissedAt: Date | null;
}

export interface CompanyRow {
  id: string;
  slug: string;
  name: string;
  status: CompanyStatus;
  isPlatformOwner: boolean;
  ownerEmail: string | null;
  /** false only when the owner signed up and hasn't verified their email yet (missing field = verified). */
  ownerEmailVerified: boolean;
  userCount: number;
  domains: string[];
  onboarding: OnboardingProgress;
  createdAt: Date;
  /** A suspended company's people asked to be reactivated and nobody has decided yet. */
  reactivationPending: boolean;
}

export interface CompanyDetail extends CompanyRow {
  profile: CompanyProfile | null;
  /** Product labels; null = no choice recorded, so every product is on. */
  enabledPanels: string[] | null;
  branding: { wordmark: string | null; logoUrl: string | null; primaryColor: string | null };
  domainRecords: { host: string; kind: "subdomain" | "custom"; status: "pending" | "verified"; isPrimary: boolean; providerError: string | null }[];
  lastSignInAt: Date | null;
  statusChangedAt: Date | null;
}

import { pendingReactivationIds } from "@/lib/platform/reactivation-pending";

async function db() {
  const platform = await getPlatformDb();
  return {
    companies: platform.collection<CompanyDoc>(COMPANIES_COLLECTION),
    domains: platform.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION),
    users: platform.collection<{ companyId: string; email: string; emailVerified?: boolean; roles?: string[]; createdAt?: Date; lastLoginAt?: Date | null }>(USERS),
  };
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function progress(state: OnboardingState | undefined): OnboardingProgress {
  const done = ONBOARDING_STEPS.filter((s) => state?.completedSteps?.includes(s.key)).length;
  return { done, total: ONBOARDING_STEPS.length, completedAt: state?.completedAt ?? null, dismissedAt: state?.dismissedAt ?? null };
}

/** Per company: user count, first Director (the owner), latest sign-in; and its hostnames. */
async function companyFacts(ids: string[]) {
  const { users, domains } = await db();
  const [counts, owners, domainRows] = await Promise.all([
    users.aggregate<{ _id: string; users: number; lastLoginAt: Date | null }>([{ $match: { companyId: { $in: ids } } }, { $group: { _id: "$companyId", users: { $sum: 1 }, lastLoginAt: { $max: "$lastLoginAt" } } }]).toArray(),
    users
      .aggregate<{ _id: string; email: string; verified: boolean }>([{ $match: { companyId: { $in: ids }, roles: "super_admin" } }, { $sort: { createdAt: 1, _id: 1 } }, { $group: { _id: "$companyId", email: { $first: "$email" }, verified: { $first: { $ne: ["$emailVerified", false] } } } }])
      .toArray(),
    domains.find({ companyId: { $in: ids } }).sort({ isPrimary: -1, _id: 1 }).toArray(),
  ]);
  return {
    count: new Map(counts.map((c) => [c._id, c])),
    owner: new Map(owners.map((o) => [o._id, o.email])),
    ownerVerified: new Map(owners.map((o) => [o._id, o.verified])),
    domains: domainRows.reduce((m, d) => m.set(d.companyId, [...(m.get(d.companyId) ?? []), d]), new Map<string, CompanyDomain[]>()),
  };
}

function toRow(c: CompanyDoc, facts: Awaited<ReturnType<typeof companyFacts>>): CompanyRow {
  return {
    id: c._id,
    slug: c.slug,
    name: c.name,
    status: c.status,
    isPlatformOwner: Boolean(c.isPlatformOwner),
    ownerEmail: facts.owner.get(c._id) ?? null,
    ownerEmailVerified: facts.ownerVerified.get(c._id) ?? true,
    userCount: facts.count.get(c._id)?.users ?? 0,
    domains: (facts.domains.get(c._id) ?? []).map((d) => d._id),
    onboarding: progress(c.onboarding),
    createdAt: c.createdAt,
    reactivationPending: false,
  };
}

export interface ListCompaniesInput {
  /** Matches company name, slug, or any of its Directors' email. */
  q?: string;
  /** "reactivation" = companies with a reactivation request waiting. */
  status?: CompanyStatus | "reactivation" | "all";
  page?: number;
  pageSize?: number;
}

export async function listCompanies(input: ListCompaniesInput = {}): Promise<{ rows: CompanyRow[]; total: number; page: number; totalPages: number; waiting: number }> {
  const { companies, users } = await db();
  const pageSize = Math.min(Math.max(input.pageSize ?? CONSOLE_PAGE_SIZE, 1), 100);
  const filter: Filter<CompanyDoc> = {};
  if (input.status === "active" || input.status === "suspended") filter.status = input.status;
  const waiting = await pendingReactivationIds().catch(() => [] as string[]);
  if (input.status === "reactivation") filter._id = { $in: waiting };

  const q = input.q?.trim().slice(0, 100);
  if (q) {
    const re = new RegExp(escapeRegex(q), "i");
    const ownedBy = await users.distinct("companyId", { roles: "super_admin", email: re });
    filter.$or = [{ name: re }, { slug: re }, { _id: { $in: ownedBy } }];
  }

  const total = await companies.countDocuments(filter);
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(Math.floor(input.page ?? 1), 1), totalPages);
  const docs = await companies
    .find(filter)
    .sort({ createdAt: -1, _id: 1 })
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .toArray();
  const facts = await companyFacts(docs.map((d) => d._id));
  const flagged = new Set(waiting);
  return { rows: docs.map((d) => ({ ...toRow(d, facts), reactivationPending: flagged.has(d._id) })), total, page, totalPages, waiting: waiting.length };
}

export async function getCompanyDetail(id: string): Promise<CompanyDetail | null> {
  const { companies } = await db();
  const c = await companies.findOne({ _id: id });
  if (!c) return null;
  const facts = await companyFacts([c._id]);
  const labels = await panelLabels();
  const b = c.branding ?? {};
  const wordmark = `${b.namePrimary ?? ""}${b.nameAccent ?? ""}`.trim();
  return {
    ...toRow(c, facts),
    profile: c.profile ?? null,
    enabledPanels: c.enabledModules ? c.enabledModules.map((k) => labels.get(k) ?? k) : null,
    branding: { wordmark: wordmark || null, logoUrl: b.logoUrl || null, primaryColor: b.primaryColor || null },
    domainRecords: (facts.domains.get(c._id) ?? []).map((d) => ({
      host: d._id,
      kind: d.kind ?? "custom",
      status: d.status,
      isPrimary: d.isPrimary,
      providerError: d.provider?.error ?? null,
    })),
    lastSignInAt: facts.count.get(c._id)?.lastLoginAt ?? null,
    statusChangedAt: c.statusChangedAt ?? null,
  };
}

export type SetStatusResult = { ok: true } | { ok: false; error: string };

/**
 * Suspends or reactivates a company. A suspended company's hosts stop routing
 * ("No workspace here") — its data is untouched. The platform owner can
 * never be suspended: that would lock everyone out of this console.
 */
export async function setCompanyStatus(id: string, status: CompanyStatus, actorId: string): Promise<SetStatusResult> {
  if (status !== "active" && status !== "suspended") return { ok: false, error: "Unknown status." };
  const { companies } = await db();
  const c = await companies.findOne({ _id: id }, { projection: { isPlatformOwner: 1 } });
  if (!c) return { ok: false, error: "Company not found." };
  if (c.isPlatformOwner) return { ok: false, error: "The platform owner company can't be suspended." };
  const now = new Date();
  await companies.updateOne({ _id: id, isPlatformOwner: { $ne: true } }, { $set: { status, updatedAt: now, statusChangedAt: now, statusChangedBy: actorId } });
  // Other server instances pick the change up when their routing cache expires (about a minute).
  forgetCompanyRouting();
  const named = await companies.findOne({ _id: id }, { projection: { name: 1 } });
  await platformEvents.companyStatus(named?.name ?? id, id, status, actorId);
  return { ok: true };
}

export interface PlatformKpis {
  total: number;
  active: number;
  suspended: number;
  createdLast7Days: number;
  createdLast30Days: number;
  pendingApprovals: number;
}

export async function getPlatformKpis(): Promise<PlatformKpis> {
  const { companies } = await db();
  const day = 24 * 60 * 60 * 1000;
  const [total, active, suspended, createdLast7Days, createdLast30Days, pendingApprovals] = await Promise.all([
    companies.countDocuments({}),
    companies.countDocuments({ status: "active" }),
    companies.countDocuments({ status: "suspended" }),
    companies.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * day) } }),
    companies.countDocuments({ createdAt: { $gte: new Date(Date.now() - 30 * day) } }),
    countAwaitingApproval(),
  ]);
  return { total, active, suspended, createdLast7Days, createdLast30Days, pendingApprovals };
}
