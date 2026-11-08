import { BLOCKED_STATUSES, canSignIn } from "@/lib/security/account-status";
import { checkAiTokenUsage, checkStorageUsage } from "@/lib/notify/triggers/usage";
import "server-only";
import { notFound, unstable_rethrow } from "next/navigation";
import { getDb } from "@/lib/mongodb";
import { currentCompanyId, currentCompanyIdOrNull, runAsCompany } from "@/lib/platform/tenancy/context";
import { resolveConnection } from "@/lib/platform/connections/resolve";
import { getEntitlements } from "@/lib/platform/billing/entitlements";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getUsage, recordUsage, recordUsageEvent } from "@/lib/platform/billing/usage";
import { isPanelAvailable } from "@/lib/platform/panels/store";
import type { ModuleKey } from "@/lib/platform/onboarding/catalog";
import type { SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Plan enforcement for the business products: read-only mode and the seat /
 * AI-token / storage limits. Everything reads the current
 * company's entitlements (`getEntitlements()`), so the platform owner
 * (`internal`) is never gated or blocked — only metered. Product modules are
 * available across plans; workspace roles and product availability control access.
 *
 * Two styles for every check: `…BlockReason()` returns a friendly message or
 * null (for code that returns `{ ok: false, error }`), `assert…()` throws a
 * `BillingLimitError` carrying the same message (HTTP 402 for API routes).
 */

export const BILLING_SETTINGS_PATH = "/commandos/settings/billing";

export type BillingBlockCode = "read_only" | "seats" | "ai_tokens" | "storage" | "module" | "upload_blocked";

export class BillingLimitError extends Error {
  constructor(
    readonly code: BillingBlockCode,
    message: string,
    /** 402 for plan limits; 422 for a refused upload (the same friendly-message handling, a more honest status). */
    readonly status: number = 402,
  ) {
    super(message);
    this.name = "BillingLimitError";
  }
}

export function isBillingLimitError(err: unknown): err is BillingLimitError {
  return err instanceof BillingLimitError || (err instanceof Error && err.name === "BillingLimitError");
}

const fmt = (n: number) => new Intl.NumberFormat("en-IN").format(n);

// ---------------------------------------------------------------------------
// Module access
// ---------------------------------------------------------------------------

/** Friendly reason a product is locked for the current company, or null when it's included. */
export async function moduleBlockReason(moduleKey: ModuleKey | string): Promise<string | null> {
  const e = await getEntitlements();
  if (e.modules === null || e.modules.has(moduleKey)) return null;
  return `This product isn't included in your ${e.planName ?? "current"} plan. Upgrade in Settings → Billing to unlock it.`;
}

/**
 * Called at the top of a product's protected layout. Plans do not gate product
 * access; the Product Registry can still disable a product globally or for a
 * company. Fails open on lookup errors (the layout's own data access will fail
 * on its own if the database is down).
 */
export async function requireModule(moduleKey: ModuleKey): Promise<void> {
  try {
    // Switched off in the Product Registry (everywhere, or for this company)? The proxy already blocks it; this is the second lock.
    if (!(await isPanelAvailable(await currentCompanyId(), moduleKey))) notFound();
  } catch (err) {
    unstable_rethrow(err);
    console.error(`[billing] module check failed for ${moduleKey}`, err);
  }
}

// ---------------------------------------------------------------------------
// Read-only mode (suspended / canceled)
// ---------------------------------------------------------------------------

export const READ_ONLY_MESSAGE = "Your workspace is read-only because its subscription is suspended or has ended. You can still view everything; renew in Settings → Billing to make changes.";

export async function writeBlockReason(): Promise<string | null> {
  return (await getEntitlements()).readOnly ? READ_ONLY_MESSAGE : null;
}

/** Guard for mutations: throws `BillingLimitError("read_only")` while the company is suspended or canceled. */
export async function assertWritable(): Promise<void> {
  const reason = await writeBlockReason();
  if (reason) throw new BillingLimitError("read_only", reason);
}

// ---------------------------------------------------------------------------
// Seats (active staff accounts)
// ---------------------------------------------------------------------------

/** Accounts holding only these roles don't take a seat (training students log in to learn, not to work). */
const SEATLESS_ROLES = ["training_student"];

/** Whether an account with these roles takes a seat: any role other than a seatless one. */
export function rolesUseSeat(roles: readonly string[] | null | undefined): boolean {
  return Array.isArray(roles) && roles.some((r) => !SEATLESS_ROLES.includes(r));
}

/** Mongo filter for `admin_users` that take a seat (mirrors `rolesUseSeat`). */
export const SEAT_FILTER = { roles: { $elemMatch: { $nin: SEATLESS_ROLES } }, status: { $nin: BLOCKED_STATUSES } };

export async function countSeatsUsed(): Promise<number> {
  return (await getDb()).collection("admin_users").countDocuments(SEAT_FILTER);
}

async function pendingInvitationCount(): Promise<number> {
  return (await getDb()).collection("company_invitations").countDocuments({ status: "pending", expiresAt: { $gt: new Date() } });
}

/**
 * Why `adding` more active accounts can't be created, or null. With
 * `countPendingInvites`, outstanding invitations count as seats already
 * promised (used when sending a new invitation).
 */
export async function seatBlockReason(adding = 1, opts: { countPendingInvites?: boolean } = {}): Promise<string | null> {
  const e = await getEntitlements();
  if (e.readOnly) return READ_ONLY_MESSAGE;
  const limit = e.limits.seats;
  if (limit === null || adding <= 0) return null;
  const [used, pending] = await Promise.all([countSeatsUsed(), opts.countPendingInvites ? pendingInvitationCount() : Promise.resolve(0)]);
  if (used + pending + adding <= limit) return null;
  const inUse = pending > 0 ? `${fmt(used)} active and ${fmt(pending)} invited` : `${fmt(used)} in use`;
  return `Your plan includes ${fmt(limit)} user${limit === 1 ? "" : "s"} (${inUse}). Deactivate someone or upgrade your plan in Settings → Billing.`;
}

export async function assertSeatAvailable(adding = 1, opts: { countPendingInvites?: boolean } = {}): Promise<void> {
  const reason = await seatBlockReason(adding, opts);
  if (reason) throw new BillingLimitError(reason === READ_ONLY_MESSAGE ? "read_only" : "seats", reason);
}

// ---------------------------------------------------------------------------
// One-person plans (Free) and over-limit accounts
// ---------------------------------------------------------------------------

/** A plan with exactly one seat is for ONE person: no second login, no employee, no student, no invitation — anywhere. */
export async function isSinglePersonPlan(): Promise<boolean> {
  const e = await getEntitlements();
  return e.limits.seats === 1;
}

export const ONE_PERSON_MESSAGE = "Your plan is for one person only — no other users, employees or logins can be added. Upgrade in Settings → Billing to add your team.";

/**
 * Why a NEW login with these roles can't be created, or null. A one-person plan refuses every kind of second account
 * (seatless roles included); other plans apply the seat limit to roles that take a seat.
 */
export async function newAccountBlockReason(roles: readonly string[] | null | undefined, opts: { countPendingInvites?: boolean; adding?: number } = {}): Promise<string | null> {
  const e = await getEntitlements();
  if (e.readOnly) return READ_ONLY_MESSAGE;
  if (e.limits.seats === 1) {
    const [accounts, pending] = await Promise.all([
      (await getDb()).collection("admin_users").countDocuments({}),
      opts.countPendingInvites ? pendingInvitationCount() : Promise.resolve(0),
    ]);
    return accounts + pending >= 1 ? ONE_PERSON_MESSAGE : null;
  }
  return rolesUseSeat(roles) ? seatBlockReason(opts.adding ?? 1, { countPendingInvites: opts.countPendingInvites }) : null;
}

/** Why another employee record can't be added (one-person plan: at most one in total), or null. */
export async function employeeBlockReason(): Promise<string | null> {
  const e = await getEntitlements();
  if (e.readOnly) return READ_ONLY_MESSAGE;
  if (e.limits.seats !== 1) return null;
  const n = await (await getDb()).collection("hrms_employees").countDocuments({ deletedAt: null });
  return n >= 1 ? ONE_PERSON_MESSAGE : null;
}

/** Why a training-student login can't be created (they are seatless on team plans, but a one-person plan has no second login), or null. */
export async function studentLoginBlockReason(): Promise<string | null> {
  return (await isSinglePersonPlan()) ? ONE_PERSON_MESSAGE : null;
}


/**
 * After inserting an account: if two requests raced past the pre-check and the plan's seats are now exceeded, the
 * newest account is removed again. Returns the message when it was rolled back, else null.
 */
export async function rollbackIfOverSeats(insertedId: unknown): Promise<string | null> {
  const limit = (await getEntitlements()).limits.seats;
  if (limit === null) return null;
  const users = (await getDb()).collection("admin_users");
  const holders = await users.find(SEAT_FILTER, { projection: { _id: 1 } }).sort({ createdAt: 1, _id: 1 }).toArray();
  const rank = holders.findIndex((h) => String(h._id) === String(insertedId));
  if (rank < limit) return null;
  await users.deleteOne({ _id: insertedId as never });
  return limit === 1 ? ONE_PERSON_MESSAGE : `Your plan includes ${fmt(limit)} users and they are all in use. Upgrade in Settings → Billing.`;
}

const deniedCache = new Map<string, number>();
const allowedCache = new Map<string, { ids: Set<string>; limit: number | null; at: number }>();

/**
 * Whether this account may be used under the plan's seat limit right now. A company that moved to a smaller plan (or
 * had accounts created before the limit existed) keeps its Director and the oldest accounts up to the limit; the
 * rest are locked out until they upgrade or free a seat. Seatless roles and unlimited plans are never affected.
 */
export async function accountWithinSeats(user: { _id: unknown; roles?: string[] | null; status?: string | null; platformRoleId?: string | null }): Promise<boolean> {
  // The one check every product's per-request sign-in passes through: an account that is suspended, deactivated or belongs to someone who left never gets in.
  if (!canSignIn(user)) return false;
  try {
    if (!rolesUseSeat(user.roles)) return true;
    const companyId = await currentCompanyIdOrNull();
    if (!companyId) return true;
    const uid = String(user._id);
    const load = async () => {
      const limit = (await getEntitlements()).limits.seats;
      let ids = new Set<string>();
      if (limit !== null) {
        const holders = await (await getDb()).collection("admin_users").find(SEAT_FILTER, { projection: { _id: 1, roles: 1, createdAt: 1 } }).toArray();
        holders.sort((a, b) => Number((b.roles ?? []).includes("super_admin")) - Number((a.roles ?? []).includes("super_admin")) || +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0) || String(a._id).localeCompare(String(b._id)));
        ids = new Set(holders.slice(0, limit).map((h) => String(h._id)));
      }
      const fresh = { ids, limit, at: Date.now() };
      if (allowedCache.size > 2000) allowedCache.clear();
      allowedCache.set(companyId, fresh);
      return fresh;
    };
    let c = allowedCache.get(companyId);
    if (!c || Date.now() - c.at > 20_000) c = await load();
    if (c.limit === null || c.ids.has(uid)) return true;
    // Not in the cached list: the account may be newer than the list (just created or invited), so look again — unless this very account
    // was found over the limit a moment ago, which keeps an over-limit account from costing a query per request.
    const key = `${companyId}:${uid}`;
    const denied = deniedCache.get(key);
    if (denied && Date.now() - denied < 5_000) return false;
    c = await load();
    if (c.limit === null || c.ids.has(uid)) return true;
    if (deniedCache.size > 2000) deniedCache.clear();
    deniedCache.set(key, Date.now());
    return false;
  } catch (err) {
    console.error("[billing] seat check failed", err); // fail open: a lookup blip must not lock a company out
    return true;
  }
}

// ---------------------------------------------------------------------------
// AI tokens (monthly)
// ---------------------------------------------------------------------------

/** "1 November 2026": the day the monthly allowances start again (the 1st, in UTC like the meters). */
function nextResetLabel(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export interface AiAllowance {
  /** null = unlimited. */
  limit: number | null;
  used: number;
  remaining: number | null;
  planName: string | null;
}

/** This month's AI-token allowance for the current company. */
export async function aiAllowance(): Promise<AiAllowance> {
  const e = await getEntitlements();
  const limit = e.limits.aiTokensPerMonth ?? null;
  const used = limit === null ? 0 : await getUsage("ai_tokens");
  return { limit, used, remaining: limit === null ? null : Math.max(0, limit - used), planName: e.planName };
}

/**
 * Why AI can't be used right now, or null. Every AI feature — assistants, chatbots, Intelligence, content writing, the AI-written website —
 * draws on one monthly token allowance from the plan, so they all stop with this same message. `needTokens` asks for room for a job that
 * is known to be large (the website), so it is refused up front instead of failing half-way.
 */
export async function aiBlockReason(needTokens = 1): Promise<string | null> {
  const e = await getEntitlements();
  if (e.readOnly) return READ_ONLY_MESSAGE;
  const limit = e.limits.aiTokensPerMonth;
  if (limit === null || limit === undefined) return null;
  const plan = e.planName ? `your ${e.planName} plan` : "your plan";
  if (limit === 0) return `AI features aren't included in ${plan}. Upgrade in Settings → Billing to use them.`;
  const used = await getUsage("ai_tokens");
  if (used >= limit) return `You've used all ${fmt(limit)} AI tokens of ${plan} this month. AI features (assistants, chatbots, writing and website generation) are paused until ${nextResetLabel()}. Upgrade your plan in Settings → Billing to continue now.`;
  const left = limit - used;
  if (needTokens > 1 && left < needTokens) return `This needs about ${fmt(needTokens)} AI tokens, but only ${fmt(left)} of ${plan}'s ${fmt(limit)} are left this month. The allowance resets on ${nextResetLabel()} — or upgrade your plan in Settings → Billing.`;
  return null;
}

export async function assertAiAvailable(needTokens = 1): Promise<void> {
  const reason = await aiBlockReason(needTokens);
  if (reason) throw new BillingLimitError(reason === READ_ONLY_MESSAGE ? "read_only" : "ai_tokens", reason);
}

/**
 * Adds tokens to this month's AI meter. `companyId` lets callers that finish
 * outside the request scope (a streamed reply) meter against the company
 * captured when the call started. Never throws — metering must not break a reply.
 */
export async function meterAiTokens(tokens: number, companyId?: string | null): Promise<void> {
  if (!Number.isFinite(tokens) || tokens <= 0) return;
  try {
    const id = companyId === undefined ? await currentCompanyIdOrNull() : companyId;
    if (!id) return;
    await runAsCompany(id, async () => {
      await recordUsage("ai_tokens", tokens);
      await checkAiTokenUsage(tokens);
    });
  } catch (err) {
    console.error("[billing] AI usage metering failed", err);
  }
}

// ---------------------------------------------------------------------------
// Storage (cumulative, bytes)
// ---------------------------------------------------------------------------

/** Keyed doc in the company-scoped `billing_usage` collection holding total bytes stored. */
export const STORAGE_USAGE_ID = "storage_bytes";
const MB = 1024 * 1024;

export async function storageUsedBytes(): Promise<number> {
  const doc = await (await getDb()).collection<{ _id: string; total: number }>("billing_usage").findOne({ _id: STORAGE_USAGE_ID });
  return doc?.total ?? 0;
}

export async function storageBlockReason(addingBytes: number): Promise<string | null> {
  // Outside any company (scripts, seeders) there is no plan to check against.
  if (!(await currentCompanyIdOrNull())) return null;
  const e = await getEntitlements();
  const limitMb = e.limits.storageMb;
  if (limitMb === null || addingBytes <= 0) return null;
  const used = await storageUsedBytes();
  if (used + addingBytes <= limitMb * MB) return null;
  return `Your workspace has used its ${fmt(limitMb)} MB of file storage (${fmt(Math.round(used / MB))} MB stored). Delete old files, or upgrade your plan in Settings → Billing.`;
}

export async function assertStorageAvailable(addingBytes: number): Promise<void> {
  const reason = await storageBlockReason(addingBytes);
  if (reason) throw new BillingLimitError("storage", reason);
}

/** Adjusts the stored-bytes meter (negative on delete; never below 0). Never throws. */
export async function meterStorage(deltaBytes: number, ctx?: { source: string; detail?: string }): Promise<void> {
  if (!Number.isFinite(deltaBytes) || deltaBytes === 0) return;
  try {
    if (!(await currentCompanyIdOrNull())) return;
    if (ctx) await recordUsageEvent("storage_bytes", Math.round(deltaBytes), ctx);
    const beforeBytes = await storageUsedBytes();
    await (await getDb()).collection<{ _id: string }>("billing_usage").updateOne(
      { _id: STORAGE_USAGE_ID },
      [{ $set: { metric: STORAGE_USAGE_ID, total: { $max: [0, { $add: [{ $ifNull: ["$total", 0] }, Math.round(deltaBytes)] }] }, updatedAt: "$$NOW" } }],
      { upsert: true },
    );
    if (deltaBytes > 0) await checkStorageUsage(beforeBytes, beforeBytes + deltaBytes);
  } catch (err) {
    console.error("[billing] storage metering failed", err);
  }
}

// ---------------------------------------------------------------------------
// Billing notice (the banner shown in every product)
// ---------------------------------------------------------------------------

export interface BillingNoticeInfo {
  status: Extract<SubscriptionStatus, "trialing" | "past_due" | "grace" | "suspended" | "canceled"> | "deleting";
  planName: string | null;
  /** Trial or grace days left; null for the other states. */
  daysLeft: number | null;
  /** Trial only: autopay is already set up, so the trial rolls into the paid plan by itself (the date of the first charge). */
  firstChargeAt?: Date | null;
}

/** What the product banner should say for the current company, or null (active / internal). */
export async function getBillingNotice(): Promise<BillingNoticeInfo | null> {
  const e = await getEntitlements();
  if (e.pendingDeletionAt) return { status: "deleting", planName: e.planName, daysLeft: Math.max(0, Math.ceil((e.pendingDeletionAt.getTime() - Date.now()) / 86_400_000)) };
  switch (e.status) {
    case "trialing": {
      const sub = await getCompanySubscription(await currentCompanyId());
      return { status: "trialing", planName: e.planName, daysLeft: e.trialDaysLeft, firstChargeAt: sub?.provider?.subscriptionId ? sub.trialEndsAt : null };
    }
    case "past_due":
    case "suspended":
    case "canceled":
      return { status: e.status, planName: e.planName, daysLeft: null };
    case "grace": {
      const sub = await getCompanySubscription(await currentCompanyId());
      const ends = sub?.graceEndsAt?.getTime();
      return { status: "grace", planName: e.planName, daysLeft: ends ? Math.max(0, Math.ceil((ends - Date.now()) / 86_400_000)) : null };
    }
    default:
      return null;
  }
}


// ---------------------------------------------------------------------------
// Emails, voice minutes and custom domains: the other paid services (see `USAGE_SERVICES`).
// ---------------------------------------------------------------------------

/** Why no more emails may be sent this month, or null. Only inside a company; never for the platform's own mail. */
export async function emailBlockReason(): Promise<string | null> {
  if (!(await currentCompanyIdOrNull())) return null;
  const e = await getEntitlements();
  const limit = e.limits.emailsPerMonth;
  if (limit === null || limit === undefined) return null;
  if (limit === 0) return "Email sending isn't included in your plan. Upgrade your plan in Settings → Billing.";
  const used = await getUsage("emails");
  return used < limit ? null : `This month's ${fmt(limit)} emails are used up. The allowance resets on the 1st — upgrade your plan in Settings → Billing.`;
}

/** Why voice can't be used right now (not in the plan, or this month's minutes are used), or null. */
export async function voiceBlockReason(): Promise<string | null> {
  const e = await getEntitlements();
  if (e.readOnly) return READ_ONLY_MESSAGE;
  // A company on its own ElevenLabs account is not limited by the plan's voice minutes.
  if ((await resolveConnection("elevenlabs").catch(() => null))?.source === "workspace") return null;
  const limit = e.limits.voiceMinutesPerMonth;
  if (limit === null || limit === undefined) return null;
  if (limit === 0) return "Voice isn't included in your plan. Upgrade your plan in Settings → Billing.";
  const used = (await getUsage("voice_seconds")) / 60;
  return used < limit ? null : `This month's ${fmt(limit)} voice minutes are used up. Upgrade your plan in Settings → Billing.`;
}

/** Whether the current company's plan includes a capability flag (`PLAN_FLAGS`): customDomain, whiteLabel, apiAccess, prioritySupport. */
export async function hasPlanFlag(flag: string): Promise<boolean> {
  if (!(await currentCompanyIdOrNull())) return true; // platform-level code: no plan to check
  const e = await getEntitlements();
  return e.flags === null || e.flags.includes(flag);
}

/** Friendly reason a plan flag is missing, or null. */
export async function flagBlockReason(flag: string, what: string): Promise<string | null> {
  return (await hasPlanFlag(flag)) ? null : `${what} isn't included in your plan. Upgrade your plan in Settings → Billing.`;
}

/** Why another custom domain can't be added, or null. `current` = domains already connected. */
export async function domainBlockReason(current: number): Promise<string | null> {
  const e = await getEntitlements();
  if (e.flags !== null && !e.flags.includes("customDomain")) return "Custom domains aren't included in your plan. Upgrade your plan in Settings → Billing.";
  const limit = e.limits.customDomains;
  if (limit === null || limit === undefined) return null;
  if (limit === 0) return "Custom domains aren't included in your plan. Upgrade your plan in Settings → Billing.";
  return current < limit ? null : `Your plan includes ${fmt(limit)} custom domain${limit === 1 ? "" : "s"}. Upgrade your plan in Settings → Billing to add more.`;
}
