import { platformEvents } from "@/lib/notify/triggers/platform";
import "server-only";
import type { Collection } from "mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { companyAppBaseUrl } from "@/lib/platform/tenancy/provisioning";
import { getDefaultPlan, getPlan } from "@/lib/platform/billing/plans";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { getBillingSettings, type PlatformBillingSettings } from "@/lib/platform/billing/settings";
import { recordSubscriptionEvent } from "@/lib/platform/billing/events";
import { resolveTrialDays } from "@/lib/platform/billing/pricing";
import { effectiveSubscriptionStatus, neverPaid, trialDaysLeft } from "@/lib/platform/billing/lifecycle";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import { recordPlatformAudit } from "@/lib/platform/audit";
export { effectiveSubscriptionStatus, trialDaysLeft } from "@/lib/platform/billing/lifecycle";
import type { CompanySubscription, SubscriptionStatus } from "@/lib/platform/billing/types";
import { sendEmail } from "@/lib/platform/email";
import { renderEmail } from "@/lib/platform/email/template";

/**
 * Free-trial lifecycle, run once a day by `/api/platform/billing/trials/cron`
 * across every company (raw platform DB — a registry-level job). All timings
 * come from the Platform Console (`getBillingSettings().billing`):
 *
 *  1. A company with no stored subscription (created before billing existed)
 *     gets the trial `getCompanySubscription` already assumes for it,
 *     persisted, so the steps below and the product see the same thing.
 *  2. Reminder emails to the owner at each of `trialReminderDays` days left.
 *     Each threshold is claimed atomically on `subscription.trialRemindersSent`
 *     before sending, so a re-run (or two overlapping runs) never emails
 *     twice. If a run was missed only the most urgent due reminder is sent,
 *     the earlier thresholds are recorded as covered. A failed send releases
 *     its claim and is retried on the next run.
 *  3. An expired trial moves to `grace` until trialEndsAt + `graceDays` (still
 *     usable), or straight to `suspended` (read-only) when graceDays is 0 or
 *     already over. A trial-born grace (never paid: `currentPeriodStart` null)
 *     that runs out becomes `suspended`. Payment-failure grace belongs to the
 *     subscriptions workstream and is left alone here.
 *
 * Every transition is written to the subscription history
 * (`recordSubscriptionEvent`, idempotent per trial end) and the platform audit
 * log (actor "system"). Never touches the platform owner; skips companies the
 * platform owner has suspended outright (their workspace is offline).
 */

const DAY_MS = 86_400_000;
const USERS = "admin_users";

type CompanyDoc = Company & { subscription?: CompanySubscription };

export interface TrialSweepResult {
  scanned: number;
  legacyTrialsStarted: number;
  /** Reminders sent, by threshold (days left). */
  reminders: Record<number, number>;
  /** Trials that ended into the grace period. */
  toGrace: number;
  /** Trials (or trial grace periods) that ended into read-only. */
  suspended: number;
  emailFailures: number;
  /** Companies with no Director to email (transitions still applied). */
  noOwner: number;
  /** Companies whose processing threw (logged; retried next run). */
  errors: number;
}

async function ownerEmail(companyId: string): Promise<string | null> {
  const owner = await (await getPlatformDb())
    .collection<{ companyId: string; email: string; roles?: string[]; createdAt?: Date }>(USERS)
    .find({ companyId, roles: "super_admin" }, { projection: { email: 1 } })
    .sort({ createdAt: 1, _id: 1 })
    .limit(1)
    .next();
  return owner?.email ?? null;
}

const billingUrl = (slug: string) => `${companyAppBaseUrl(slug)}/commandos/settings/billing`;
const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
const brandOf = (s: PlatformBillingSettings) => s.seller.tradeName || s.seller.legalName || "Our team";

function reminderEmail(brand: string, company: CompanyDoc, planName: string, daysLeft: number) {
  return {
    subject: `${plural(daysLeft)} left in your ${company.name} trial`,
    ...renderEmail({
      brand,
      heading: `${plural(daysLeft)} left in your free trial`,
      paragraphs: [
        `The free trial of ${planName} for ${company.name} ends in ${plural(daysLeft)}.`,
        "Choose a plan before then to keep everything running without interruption. Nothing is deleted when a trial ends, and choosing a plan brings everything straight back.",
      ],
      action: { label: "Choose a plan", url: billingUrl(company.slug) },
    }),
  };
}

function graceEmail(brand: string, company: CompanyDoc, graceEndsAt: Date, now: Date) {
  const days = trialDaysLeft(graceEndsAt, now);
  return {
    subject: `Your ${company.name} trial has ended`,
    ...renderEmail({
      brand,
      heading: "Your free trial has ended",
      paragraphs: [
        `The free trial for ${company.name} has ended. Everything keeps working for ${plural(days)} more while you choose a plan.`,
        "After that the workspace becomes read-only: everyone can still sign in and see their data, but nothing new can be created until a plan is chosen.",
      ],
      action: { label: "Choose a plan", url: billingUrl(company.slug) },
    }),
  };
}

function suspendedEmail(brand: string, company: CompanyDoc) {
  return {
    subject: `Your ${company.name} workspace is now read-only`,
    ...renderEmail({
      brand,
      heading: "Your free trial has ended",
      paragraphs: [
        `The free trial for ${company.name} has ended, so the workspace is now read-only: everyone can still sign in and see their data, but nothing new can be created.`,
        "Your data is safe. Choose a plan to continue right where you left off.",
      ],
      action: { label: "Choose a plan", url: billingUrl(company.slug) },
    }),
  };
}

/** Persists the implicit trial of a company that has no subscription yet. Returns it, or null if one appeared meanwhile. */
async function persistLegacyTrial(col: Collection<CompanyDoc>, company: CompanyDoc, defaultTrialDays: number, now: Date): Promise<CompanySubscription | null> {
  const plan = await getDefaultPlan();
  const sub: CompanySubscription = {
    planId: plan?._id ?? "trial",
    status: "trialing",
    interval: "monthly",
    trialEndsAt: new Date(company.createdAt.getTime() + resolveTrialDays(plan, defaultTrialDays) * DAY_MS),
    currentPeriodStart: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    provider: null,
    trialRemindersSent: [],
    updatedAt: now,
  };
  const res = await col.updateOne({ _id: company._id, isPlatformOwner: { $ne: true }, subscription: { $exists: false } }, { $set: { subscription: sub } });
  if (res.modifiedCount !== 1) return null;
  await recordSubscriptionEvent({ companyId: company._id, type: "trial_started", planId: sub.planId, interval: "monthly", at: company.createdAt, key: "legacy-trial" });
  return sub;
}

async function notify(result: TrialSweepResult, companyId: string, message: { subject: string; html: string; text: string }): Promise<boolean> {
  const to = await ownerEmail(companyId);
  if (!to) {
    result.noOwner++;
    return false;
  }
  const sent = await sendEmail({ to, ...message, event: "billing_trial", companyId });
  if (!sent.ok) result.emailFailures++;
  return sent.ok;
}

export async function runTrialSweep(now: Date = new Date()): Promise<TrialSweepResult> {
  const settings = await getBillingSettings();
  const { graceDays, defaultTrialDays } = settings.billing;
  const reminderDays = [...new Set(settings.billing.trialReminderDays.filter((d) => Number.isInteger(d) && d > 0))].sort((a, b) => b - a);
  const brand = brandOf(settings);
  const col = (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION);
  const result: TrialSweepResult = { scanned: 0, legacyTrialsStarted: 0, reminders: Object.fromEntries(reminderDays.map((d) => [d, 0])), toGrace: 0, suspended: 0, emailFailures: 0, noOwner: 0, errors: 0 };

  const cursor = col.find(
    {
      isPlatformOwner: { $ne: true },
      status: "active",
      $or: [{ subscription: { $exists: false } }, { "subscription.status": "trialing" }, { "subscription.status": "grace", "subscription.currentPeriodStart": null }],
    },
    { projection: { _id: 1, slug: 1, name: 1, status: 1, isPlatformOwner: 1, createdAt: 1, subscription: 1 } },
  );

  for await (const company of cursor) {
    result.scanned++;
    try {
      let sub = company.subscription;
      if (!sub) {
        const persisted = await persistLegacyTrial(col, company, defaultTrialDays, now);
        if (!persisted) continue; // something else gave it a subscription meanwhile; next run handles it
        result.legacyTrialsStarted++;
        sub = persisted;
      }

      // Trial-born grace ran out → read-only.
      if (sub.status === "grace") {
        if (!neverPaid(sub) || !sub.graceEndsAt || sub.graceEndsAt.getTime() > now.getTime()) continue;
        const res = await col.updateOne(
          { _id: company._id, isPlatformOwner: { $ne: true }, "subscription.status": "grace", "subscription.currentPeriodStart": null, "subscription.graceEndsAt": sub.graceEndsAt },
          { $set: { "subscription.status": "suspended", "subscription.updatedAt": now } },
        );
        if (res.modifiedCount !== 1) continue;
        result.suspended++;
        await recordSubscriptionEvent({ companyId: company._id, type: "suspended", planId: sub.planId, at: now, key: `trial-grace-end:${sub.graceEndsAt.toISOString()}` });
        await recordPlatformAudit({ actorId: "system", action: "subscription.trial_grace_expired", target: { type: "company", id: company._id }, companyId: company._id, details: { from: "grace", to: "suspended", planId: sub.planId } });
        await notify(result, company._id, suspendedEmail(brand, company));
        continue;
      }

      if (sub.status !== "trialing" || !sub.trialEndsAt) continue;

      // Trial over → grace (graceDays > 0 and not yet over) or read-only.
      if (sub.trialEndsAt.getTime() <= now.getTime()) {
        const next = effectiveSubscriptionStatus(sub, graceDays, now);
        const res = await col.updateOne(
          { _id: company._id, isPlatformOwner: { $ne: true }, "subscription.status": "trialing", "subscription.trialEndsAt": sub.trialEndsAt },
          { $set: { "subscription.status": next.status, "subscription.graceEndsAt": next.graceEndsAt, "subscription.updatedAt": now } },
        );
        if (res.modifiedCount !== 1) continue;
        const key = `trial-end:${sub.trialEndsAt.toISOString()}`;
        if (next.status === "grace") {
          result.toGrace++;
          await recordSubscriptionEvent({ companyId: company._id, type: "grace", planId: sub.planId, at: now, key });
        } else {
          result.suspended++;
          await recordSubscriptionEvent({ companyId: company._id, type: "suspended", planId: sub.planId, at: now, key });
        }
        await recordPlatformAudit({
          actorId: "system",
          action: "subscription.trial_expired",
          target: { type: "company", id: company._id },
          companyId: company._id,
          details: { from: "trialing", to: next.status, planId: sub.planId, graceEndsAt: next.graceEndsAt },
        });
        await notify(result, company._id, next.status === "grace" && next.graceEndsAt ? graceEmail(brand, company, next.graceEndsAt, now) : suspendedEmail(brand, company));
        continue;
      }

      // Reminders: every threshold at or above the days left is due; send the most urgent one.
      const daysLeft = trialDaysLeft(sub.trialEndsAt, now);
      const sentAlready = new Set(sub.trialRemindersSent ?? []);
      const due = reminderDays.filter((d) => daysLeft <= d && !sentAlready.has(d));
      if (due.length === 0) continue;
      const threshold = Math.min(...due);

      const claim = await col.updateOne(
        { _id: company._id, isPlatformOwner: { $ne: true }, "subscription.status": "trialing", "subscription.trialRemindersSent": { $ne: threshold } },
        { $addToSet: { "subscription.trialRemindersSent": { $each: due } } },
      );
      if (claim.modifiedCount !== 1) continue;

      const plan = await getPlan(sub.planId);
      const sent = await notify(result, company._id, reminderEmail(brand, company, plan?.name ?? brand, daysLeft));
      await runAsCompany(company._id, () => workspaceEvents.trialReminder(daysLeft)).catch(() => {});
      if (sent) result.reminders[threshold] = (result.reminders[threshold] ?? 0) + 1;
      else await col.updateOne({ _id: company._id }, { $pullAll: { "subscription.trialRemindersSent": due } });
    } catch (err) {
      console.error(`[billing:trials] sweep failed for company ${company._id}`, err);
      result.errors++;
    }
  }
  // Tell the platform team once a day how many trials end within 3 days.
  try {
    const soon = await col.countDocuments({ isPlatformOwner: { $ne: true }, status: "active", "subscription.status": "trialing", "subscription.trialEndsAt": { $gt: now, $lte: new Date(now.getTime() + 3 * 86_400_000) } });
    if (soon > 0) await platformEvents.trialsEnding(soon);
  } catch (err) {
    console.error("[billing:trials] could not notify the team", err);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Extending a trial (Platform Console → company detail).
// ---------------------------------------------------------------------------

export const MAX_TRIAL_EXTENSION_DAYS = 365;

export interface TrialOverview {
  planId: string;
  planName: string | null;
  /** Stored status with pending time-based transitions applied. */
  status: SubscriptionStatus;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  daysLeft: number | null;
  /** Whether the trial can be extended (on trial, or its trial ran out and it never paid). */
  canExtend: boolean;
}

/** The company's trial state for the Platform Console; null for an unknown company or the platform owner. */
export async function getTrialOverview(companyId: string, now: Date = new Date()): Promise<TrialOverview | null> {
  const sub = await getCompanySubscription(companyId);
  if (!sub || sub.status === "internal") return null;
  const { graceDays } = (await getBillingSettings()).billing;
  const eff = effectiveSubscriptionStatus(sub, graceDays, now);
  const plan = await getPlan(sub.planId);
  return {
    planId: sub.planId,
    planName: plan?.name ?? null,
    status: eff.status,
    trialEndsAt: sub.trialEndsAt,
    graceEndsAt: eff.graceEndsAt,
    daysLeft: eff.status === "trialing" && sub.trialEndsAt ? trialDaysLeft(sub.trialEndsAt, now) : null,
    canExtend: canExtendTrial(sub),
  };
}

function canExtendTrial(sub: CompanySubscription): boolean {
  if (sub.status === "trialing") return true;
  return (sub.status === "grace" || sub.status === "suspended") && neverPaid(sub) && Boolean(sub.trialEndsAt);
}

export type ExtendTrialResult = { ok: true; trialEndsAt: Date } | { ok: false; error: string };

/**
 * Adds `days` to a company's trial — counted from its current end, or from
 * now if the trial has already ended (which puts the company back on trial).
 * Resets the reminders so the new end date gets its own. Audited.
 */
export async function extendTrial(companyId: string, days: number, actorId: string, now: Date = new Date()): Promise<ExtendTrialResult> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_TRIAL_EXTENSION_DAYS) return { ok: false, error: `Enter 1–${MAX_TRIAL_EXTENSION_DAYS} days.` };
  const sub = await getCompanySubscription(companyId);
  if (!sub) return { ok: false, error: "That company no longer exists." };
  if (sub.status === "internal") return { ok: false, error: "The platform owner is never on a trial." };
  if (!canExtendTrial(sub)) return { ok: false, error: "Only a company on trial, or whose trial ended without paying, can have its trial extended." };

  // A live trial is lengthened from its end; an ended one restarts from now.
  const from = sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt.getTime() > now.getTime() ? sub.trialEndsAt : now;
  const trialEndsAt = new Date(from.getTime() + days * DAY_MS);
  const next: CompanySubscription = { ...sub, status: "trialing", trialEndsAt, graceEndsAt: null, trialRemindersSent: [], updatedAt: now };
  const col = (await getPlatformDb()).collection<CompanyDoc>(COMPANIES_COLLECTION);
  // Conditional on what we read, so a concurrent change (a payment, the sweep) isn't overwritten.
  const stored = (await col.findOne({ _id: companyId }, { projection: { subscription: 1 } }))?.subscription;
  const unchanged = stored ? { "subscription.status": stored.status, "subscription.trialEndsAt": stored.trialEndsAt } : { subscription: { $exists: false } };
  const res = await col.updateOne({ _id: companyId, isPlatformOwner: { $ne: true }, ...unchanged }, { $set: { subscription: next } });
  if (res.modifiedCount !== 1) return { ok: false, error: "The subscription changed just now. Reload and try again." };

  if (sub.status !== "trialing") {
    await recordSubscriptionEvent({ companyId, type: "trial_started", planId: sub.planId, interval: sub.interval, at: now, key: `trial-extended:${trialEndsAt.toISOString()}` });
  }
  await recordPlatformAudit({
    actorId,
    action: "company.trial.extend",
    target: { type: "company", id: companyId },
    companyId,
    details: { days, previousStatus: sub.status, previousTrialEndsAt: sub.trialEndsAt, trialEndsAt },
  });
  return { ok: true, trialEndsAt };
}
