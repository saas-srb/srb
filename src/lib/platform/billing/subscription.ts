import "server-only";
import { forgetTrialLock } from "@/lib/platform/billing/trial-lock";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { getDefaultPlan, getPlan } from "@/lib/platform/billing/plans";
import { type CompanySubscription } from "@/lib/platform/billing/types";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { resolveTrialDays } from "@/lib/platform/billing/pricing";
import { signupTrialDays } from "@/lib/platform/billing/signup-plan-rule";
import type { BillingInterval } from "@/lib/platform/billing/types";
import { recordSubscriptionEvent } from "@/lib/platform/billing/events";

/**
 * A company's subscription lives on its registry document
 * (`companies.subscription`, platform-level) so routing, the console and
 * enforcement can all read it without entering the company's workspace.
 * The platform owner is `internal` (never billed, never limited).
 */

type CompanyWithSubscription = Company & { subscription?: CompanySubscription };

async function companies() {
  return (await getPlatformDb()).collection<CompanyWithSubscription>(COMPANIES_COLLECTION);
}

const INTERNAL: CompanySubscription = {
  planId: "internal",
  status: "internal",
  interval: "monthly",
  trialEndsAt: null,
  currentPeriodStart: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  provider: null,
  updatedAt: new Date(0),
};

/**
 * The company's subscription. A company with none recorded (created before
 * billing existed) is treated as trialing the default plan from its creation
 * date — nothing is written until something changes it.
 */
export async function getCompanySubscription(companyId: string): Promise<CompanySubscription | null> {
  const company = await (await companies()).findOne({ _id: companyId }, { projection: { isPlatformOwner: 1, isDemo: 1, subscription: 1, createdAt: 1 } });
  if (!company) return null;
  if (company.isPlatformOwner || company.isDemo === true) return INTERNAL;
  if (company.subscription) return company.subscription;
  const plan = await getDefaultPlan();
  // A free-for-life default plan is simply active, with no trial and no end.
  if (plan?.lifetimeFree) return { ...INTERNAL, planId: plan._id, status: "active", updatedAt: company.createdAt };
  const trialDays = resolveTrialDays(plan, (await getBillingSettings()).billing.defaultTrialDays);
  return {
    ...INTERNAL,
    planId: plan?._id ?? "trial",
    status: "trialing",
    trialEndsAt: new Date(company.createdAt.getTime() + trialDays * 86_400_000),
    updatedAt: company.createdAt,
  };
}

/**
 * Starts a trial of the default (or given) plan — called when a company is created. A plan chosen on the pricing page (`planId`) always gets
 * a real trial of that plan (one month unless the plan or the platform settings say otherwise), on the cycle the visitor chose.
 */
export async function startTrial(companyId: string, planId?: string, interval?: BillingInterval): Promise<CompanySubscription> {
  const chosen = planId ? await getPlan(planId) : null;
  const plan = chosen ?? (await getDefaultPlan());
  const platformDays = (await getBillingSettings()).billing.defaultTrialDays;
  const trialDays = chosen && !chosen.lifetimeFree ? signupTrialDays(chosen.trialDays, platformDays) : resolveTrialDays(plan, platformDays);
  const now = new Date();
  const free = plan?.lifetimeFree === true;
  const sub: CompanySubscription = {
    ...INTERNAL,
    planId: plan?._id ?? "trial",
    ...(interval && chosen && !chosen.lifetimeFree ? { interval } : {}),
    status: free ? "active" : "trialing",
    trialEndsAt: free ? null : new Date(now.getTime() + trialDays * 86_400_000),
    updatedAt: now,
  };
  const res = await (await companies()).updateOne({ _id: companyId, isPlatformOwner: { $ne: true } }, { $set: { subscription: sub } });
  if (res.modifiedCount === 1 && !free) await recordSubscriptionEvent({ companyId, type: "trial_started", planId: sub.planId, interval: sub.interval, at: now });
  return sub;
}

/**
 * Partial update of a company's subscription (never the platform owner's — the
 * filter below excludes it). A non-owner company marked complimentary in the
 * Platform Console is stored as "internal" and can still be changed back.
 */
export async function updateCompanySubscription(companyId: string, patch: Partial<CompanySubscription>): Promise<void> {
  const current = await getCompanySubscription(companyId);
  if (!current) return;
  await (await companies()).updateOne({ _id: companyId, isPlatformOwner: { $ne: true } }, { $set: { subscription: { ...current, ...patch, updatedAt: new Date() } } });
  forgetTrialLock(); // buying a plan lifts a trial lock at once
}
