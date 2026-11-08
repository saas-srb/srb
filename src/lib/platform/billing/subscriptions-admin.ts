import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { PLATFORM_AUDIT_COLLECTION, type PlatformAuditEntry } from "@/lib/platform/audit";
import { getPlan, listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { SUBSCRIPTION_EVENTS_COLLECTION, type SubscriptionEvent } from "@/lib/platform/billing/events";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import {
  applyChange,
  cancelSubscription,
  changePlan,
  hasLiveSubscription,
  isInterval,
  priceSubscription,
  subscriptionMrr,
  type BillingActionResult,
} from "@/lib/platform/billing/subscriptions";
import type { BillingInterval, CompanySubscription, SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Platform Console → Subscriptions: every company's subscription, and the
 * owner's manual actions on one (all audited, all through `applyChange` so
 * revenue history stays right). Razorpay-backed changes go through the same
 * functions the company uses; manual ones (no Razorpay subscription) only
 * change our record.
 */

const DAY_MS = 86_400_000;
export const SUBSCRIPTIONS_PAGE_SIZE = 25;

export interface SubscriptionRow {
  companyId: string;
  name: string;
  slug: string;
  companyStatus: string;
  planId: string;
  planName: string;
  interval: BillingInterval;
  status: SubscriptionStatus;
  complimentary: boolean;
  trialEndsAt: string | null;
  renewsAt: string | null;
  cancelAtPeriodEnd: boolean;
  /** Pre-tax, monthly-normalised, smallest currency unit. */
  mrr: number;
  currency: string;
  razorpaySubscriptionId: string | null;
  /** The subscription is only implied (company created before billing, nothing stored yet). */
  implicit: boolean;
}

export const SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ["trialing", "active", "past_due", "grace", "suspended", "canceled", "internal"];

type CompanyDoc = Company & { subscription?: CompanySubscription };

async function toRow(c: CompanyDoc, planNames: Map<string, string>, currency: string): Promise<SubscriptionRow | null> {
  const sub = await getCompanySubscription(c._id);
  if (!sub) return null;
  return {
    companyId: c._id,
    name: c.name,
    slug: c.slug,
    companyStatus: c.status,
    planId: sub.planId,
    planName: sub.status === "internal" ? (sub.complimentary ? "Complimentary" : "Internal") : (planNames.get(sub.planId) ?? sub.planId),
    interval: sub.interval,
    status: sub.status,
    complimentary: Boolean(sub.complimentary),
    trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
    renewsAt: sub.status === "active" || sub.status === "past_due" ? (sub.currentPeriodEnd?.toISOString() ?? null) : null,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    mrr: await subscriptionMrr(sub),
    currency: sub.pricing?.currency ?? currency,
    razorpaySubscriptionId: sub.provider?.subscriptionId ?? null,
    implicit: !c.subscription && !c.isPlatformOwner,
  };
}

export interface ListSubscriptionsInput {
  q?: string;
  status?: string;
  planId?: string;
  page?: number;
}

/**
 * Every company's subscription with filters. Filtering happens after the
 * implied-trial defaults are applied, so it is done in memory — fine for
 * hundreds of companies; move to an aggregation if the platform grows past that.
 */
export async function listSubscriptions(input: ListSubscriptionsInput = {}): Promise<{ rows: SubscriptionRow[]; total: number; page: number; totalPages: number; totals: { mrr: number; currency: string; byStatus: Record<string, number> } }> {
  const [docs, plans, settings] = await Promise.all([
    (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION).find({}, { projection: { name: 1, slug: 1, status: 1, isPlatformOwner: 1, subscription: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray(),
    listPlans(),
    getBillingSettings(),
  ]);
  const planNames = new Map(plans.map((p) => [p._id, p.name]));
  const all = (await Promise.all(docs.map((c) => toRow(c, planNames, settings.billing.currency)))).filter((r): r is SubscriptionRow => r !== null);

  const byStatus: Record<string, number> = {};
  let mrr = 0;
  for (const r of all) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    mrr += r.mrr;
  }

  const q = input.q?.trim().toLowerCase() ?? "";
  const status = SUBSCRIPTION_STATUSES.includes(input.status as SubscriptionStatus) ? input.status : null;
  const planId = input.planId && planNames.has(input.planId) ? input.planId : null;
  const filtered = all.filter((r) => (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q) || r.razorpaySubscriptionId?.toLowerCase().includes(q)) && (!status || r.status === status) && (!planId || r.planId === planId));

  const totalPages = Math.max(1, Math.ceil(filtered.length / SUBSCRIPTIONS_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(input.page ?? 1)), totalPages);
  return {
    rows: filtered.slice((page - 1) * SUBSCRIPTIONS_PAGE_SIZE, page * SUBSCRIPTIONS_PAGE_SIZE),
    total: filtered.length,
    page,
    totalPages,
    totals: { mrr, currency: settings.billing.currency, byStatus },
  };
}

export interface SubscriptionDetail {
  row: SubscriptionRow;
  isPlatformOwner: boolean;
  sub: CompanySubscription;
  pendingPlanName: string | null;
  events: SubscriptionEvent[];
  audit: PlatformAuditEntry[];
}

export async function getSubscriptionDetail(companyId: string): Promise<SubscriptionDetail | null> {
  const db = await getPlatformDb();
  const company = await db.collection<CompanyDoc>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { name: 1, slug: 1, status: 1, isPlatformOwner: 1, subscription: 1, createdAt: 1 } });
  if (!company) return null;
  const [plans, settings, sub] = await Promise.all([listPlans(), getBillingSettings(), getCompanySubscription(companyId)]);
  if (!sub) return null;
  const row = await toRow(company, new Map(plans.map((p) => [p._id, p.name])), settings.billing.currency);
  if (!row) return null;
  const [events, audit, pendingPlan] = await Promise.all([
    db.collection<SubscriptionEvent>(SUBSCRIPTION_EVENTS_COLLECTION).find({ companyId }).sort({ at: -1 }).limit(20).toArray(),
    db.collection<PlatformAuditEntry>(PLATFORM_AUDIT_COLLECTION).find({ companyId, action: /^subscription\./ }).sort({ at: -1 }).limit(20).toArray(),
    sub.pendingChange ? getPlan(sub.pendingChange.planId) : Promise.resolve(null),
  ]);
  return { row, isPlatformOwner: Boolean(company.isPlatformOwner), sub, pendingPlanName: pendingPlan?.name ?? null, events, audit };
}

// ── Owner actions (all audited) ───────────────────────────────────────────────

async function editable(companyId: string): Promise<{ ok: true; sub: CompanySubscription } | { ok: false; error: string }> {
  const company = await (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION).findOne({ _id: companyId }, { projection: { isPlatformOwner: 1 } });
  if (!company) return { ok: false, error: "Unknown company." };
  if (company.isPlatformOwner) return { ok: false, error: "The platform owner's workspace is never billed." };
  const sub = await getCompanySubscription(companyId);
  return sub ? { ok: true, sub } : { ok: false, error: "Unknown company." };
}

/** Where access goes back to when it's restored: a paid period still running → active, a trial still running → trialing, else grace. */
async function restoredState(sub: CompanySubscription, now: number): Promise<Partial<CompanySubscription>> {
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now) return { status: "active", graceEndsAt: null, dunning: null };
  if (sub.trialEndsAt && sub.trialEndsAt.getTime() > now && !sub.currentPeriodEnd) return { status: "trialing", graceEndsAt: null };
  const grace = (await getBillingSettings()).billing.graceDays;
  return { status: "grace", graceEndsAt: new Date(now + Math.max(1, grace) * DAY_MS) };
}

/**
 * Change plan. With a live Razorpay subscription the company's own change
 * rules apply (`when` forces immediate or cycle end); otherwise only our record
 * changes (trial / manually managed / complimentary off).
 */
export async function adminChangePlan(companyId: string, input: { planId: string; interval: string; when?: string }, actorId: string): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  if (!isInterval(input.interval)) return { ok: false, error: "Choose monthly or yearly." };
  const when = input.when === "now" || input.when === "cycle_end" ? input.when : "auto";
  if (hasLiveSubscription(e.sub)) return changePlan(companyId, { planId: input.planId, interval: input.interval, when }, actorId, "subscription.admin.change_plan");
  if (e.sub.status === "internal") return { ok: false, error: "Turn off complimentary first." };
  const priced = await priceSubscription({ companyId, planId: input.planId, interval: input.interval, couponCode: null });
  if (!priced.ok) return priced;
  if (priced.pricing.planId === e.sub.planId && priced.pricing.interval === e.sub.interval) return { ok: false, error: "That's the current plan." };
  await applyChange(companyId, e.sub, { planId: priced.pricing.planId, interval: priced.pricing.interval, pricing: priced.pricing, pendingChange: null, ...(priced.pricing.priceVersion ? { priceVersion: priced.pricing.priceVersion } : {}) }, { actorId, action: "subscription.admin.change_plan", details: { manual: true } });
  return { ok: true, message: `Plan changed to ${priced.summary.planName} (${priced.pricing.interval}).` };
}

/** Adds days to the trial (from its end, or from today if it already ended). Only without a paid period. */
export async function adminExtendTrial(companyId: string, days: number, actorId: string): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  const n = Math.floor(Number(days));
  if (!Number.isInteger(n) || n < 1 || n > 365) return { ok: false, error: "Enter 1–365 days." };
  const sub = e.sub;
  if (!["trialing", "suspended", "canceled"].includes(sub.status)) return { ok: false, error: `A ${sub.status.replace("_", " ")} subscription has no trial to extend.` };
  if (sub.status !== "trialing" && sub.currentPeriodEnd) return { ok: false, error: "This company has already paid — reactivate it instead." };
  const now = Date.now();
  const from = Math.max(now, sub.trialEndsAt?.getTime() ?? now);
  const trialEndsAt = new Date(from + n * DAY_MS);
  await applyChange(companyId, sub, { status: "trialing", trialEndsAt, graceEndsAt: null, cancelAtPeriodEnd: sub.status === "trialing" ? sub.cancelAtPeriodEnd : false }, { actorId, action: "subscription.admin.extend_trial", details: { days: n, trialEndsAt } });
  return { ok: true, message: `Trial extended by ${n} day${n === 1 ? "" : "s"}.` };
}

/**
 * Complimentary = never billed, every product, no limits (stored status
 * "internal"). A live Razorpay subscription is canceled first. Turning it off
 * puts the company on a fresh trial of its plan (default trial length), or — `after: "subscribe"` — straight to "must subscribe": no trial,
 * the workspace is read-only until it buys a plan.
 */
export async function adminSetComplimentary(companyId: string, on: boolean, actorId: string, after: "trial" | "subscribe" = "trial"): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  const sub = e.sub;
  if (on) {
    if (sub.status === "internal") return { ok: false, error: "Already complimentary." };
    if (sub.provider?.subscriptionId && ["trialing", "active", "past_due", "grace"].includes(sub.status)) {
      const res = await cancelSubscription(companyId, { when: "now" }, actorId, "subscription.admin.cancel_for_complimentary");
      if (!res.ok) return res;
    }
    const fresh = (await getCompanySubscription(companyId))!;
    await applyChange(companyId, fresh, { status: "internal", complimentary: true, cancelAtPeriodEnd: false, graceEndsAt: null, pendingChange: null, dunning: null }, { actorId, action: "subscription.admin.complimentary_on" });
    return { ok: true, message: "Marked complimentary — this company is no longer billed." };
  }
  if (sub.status !== "internal") return { ok: false, error: "This company isn't complimentary." };
  if (after === "subscribe") {
    await applyChange(companyId, sub, { status: "suspended", complimentary: false, trialEndsAt: new Date(Date.now() - 1000), graceEndsAt: null, currentPeriodStart: null, currentPeriodEnd: null, cancelAtPeriodEnd: false, pendingChange: null, dunning: null }, { actorId, action: "subscription.admin.complimentary_off", details: { requireSubscription: true } });
    return { ok: true, message: "Free access removed — the company must now choose a plan to continue." };
  }
  const settings = await getBillingSettings();
  const plan = await getPlan(sub.planId);
  const days = plan?.trialDays ?? settings.billing.defaultTrialDays;
  await applyChange(companyId, sub, { status: "trialing", complimentary: false, trialEndsAt: new Date(Date.now() + days * DAY_MS), currentPeriodStart: null, currentPeriodEnd: null }, { actorId, action: "subscription.admin.complimentary_off", details: { trialDays: days } });
  return { ok: true, message: `No longer complimentary — the company is on a ${days}-day trial.` };
}

export async function adminCancel(companyId: string, when: string, actorId: string): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  return cancelSubscription(companyId, { when: when === "now" ? "now" : "period_end" }, actorId, "subscription.admin.cancel");
}

/** Billing suspension (read-only workspace) — separate from suspending the whole company. */
export async function adminSuspend(companyId: string, actorId: string): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  if (e.sub.status === "suspended") return { ok: false, error: "Already suspended." };
  if (e.sub.status === "internal") return { ok: false, error: "Turn off complimentary first." };
  await applyChange(companyId, e.sub, { status: "suspended" }, { actorId, action: "subscription.admin.suspend" });
  return { ok: true, message: "Billing suspended — the workspace is read-only." };
}

/** Lifts a billing suspension: back to the running paid period / trial, else a fresh grace period. */
export async function adminUnsuspend(companyId: string, actorId: string): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  if (e.sub.status !== "suspended") return { ok: false, error: "This subscription isn't suspended." };
  const after = await applyChange(companyId, e.sub, await restoredState(e.sub, Date.now()), { actorId, action: "subscription.admin.unsuspend" });
  return { ok: true, message: `Suspension lifted — status is now ${after.status.replace("_", " ")}.` };
}

/**
 * Reactivates a canceled subscription. With `days`, grants a manually
 * managed paid period of that length (offline payment); otherwise restores
 * like unsuspend. A Razorpay subscription can't be revived — the company
 * subscribes again from its billing page.
 */
export async function adminReactivate(companyId: string, days: number | null, actorId: string): Promise<BillingActionResult> {
  const e = await editable(companyId);
  if (!e.ok) return e;
  if (!["canceled", "suspended"].includes(e.sub.status)) return { ok: false, error: "Only canceled or suspended subscriptions can be reactivated." };
  const now = Date.now();
  let patch: Partial<CompanySubscription>;
  if (days !== null && days !== undefined && String(days) !== "") {
    const n = Math.floor(Number(days));
    if (!Number.isInteger(n) || n < 1 || n > 730) return { ok: false, error: "Enter 1–730 days." };
    patch = { status: "active", currentPeriodStart: new Date(now), currentPeriodEnd: new Date(now + n * DAY_MS), cancelAtPeriodEnd: false, graceEndsAt: null, dunning: null, provider: e.sub.provider ? { ...e.sub.provider, subscriptionId: null } : null };
  } else {
    patch = { ...(await restoredState(e.sub, now)), cancelAtPeriodEnd: false };
  }
  const after = await applyChange(companyId, e.sub, patch, { actorId, action: "subscription.admin.reactivate", details: { days: days ?? null, manualPeriod: Boolean(patch.currentPeriodEnd) } });
  return { ok: true, message: `Reactivated — status is now ${after.status.replace("_", " ")}.` };
}
