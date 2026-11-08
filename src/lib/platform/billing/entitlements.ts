import "server-only";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { cache } from "react";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getPlan } from "@/lib/platform/billing/plans";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { MODULES } from "@/lib/platform/onboarding/catalog";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { effectiveSubscriptionStatus, trialDaysLeft } from "@/lib/platform/billing/lifecycle";
import { getModuleUnlocks } from "@/lib/platform/billing/addons";
import { UNLIMITED_LIMITS, effectiveLimitsFor } from "@/lib/platform/billing/limits";
import { withCreditLimits } from "@/lib/platform/billing/credits-store";
import { applyFlagOverrides, applyModuleOverrides } from "@/lib/platform/billing/overrides";
import type { Entitlements } from "@/lib/platform/billing/types";

const UNLIMITED = UNLIMITED_LIMITS;
const CORE = MODULES.filter((m) => m.core).map((m) => m.key);

/**
 * What the current company may use right now — the single question every
 * product and API asks (enforcement helpers: `enforce.ts`).
 * Resolved once per request. The platform owner is unlimited.
 */
export const getEntitlements = cache(async (): Promise<Entitlements> => entitlementsFor(await currentCompanyId()));

/**
 * A given company's entitlements (uncached) — for platform-level code that
 * looks at several companies in one request. Limits include add-on extras.
 */
export async function entitlementsFor(companyId: string): Promise<Entitlements> {
  const sub = await getCompanySubscription(companyId);
  if (!sub || sub.status === "internal") {
    return { planId: null, planName: null, status: "internal", modules: null, limits: { ...UNLIMITED }, flags: null, readOnly: false, trialDaysLeft: null };
  }
  const now = new Date();
  // Time-based transitions are applied on read, so an expired trial (→ grace for the
  // platform's grace days, then suspended) or grace takes effect immediately, even
  // before the daily sweep persists it.
  const { status } = effectiveSubscriptionStatus(sub, (await getBillingSettings()).billing.graceDays, now);

  const plan = await getPlan(sub.planId);
  // Products in the plan, plus any unlocked by module add-ons the company holds.
  const planModules = !plan || plan.modules === "all" ? null : new Set<string>([...CORE, ...plan.modules, ...(await getModuleUnlocks(companyId))]);
  // Then what the platform admin unlocked or locked for this company alone.
  const modules = applyModuleOverrides(planModules, sub.overrides, now, MODULES.map((m) => m.key), CORE);
  // A company scheduled for deletion is read-only until the day it is deleted, or until the request is cancelled.
  const pendingDeletionAt = (await getCompany(companyId).catch(() => null))?.deletion?.purgeAt ?? null;
  const baseLimits = await effectiveLimitsFor(sub, plan);
  return {
    planId: sub.planId,
    planName: plan?.name ?? null,
    pendingDeletionAt,
    status,
    modules,
    // Top-ups bought on top of the plan count here, so every limit check in the product sees them.
    limits: await withCreditLimits(companyId, baseLimits),
    baseLimits,
    // A plan that was deleted keeps its company running (no product locked, no limits): flags follow the same rule.
    flags: applyFlagOverrides(plan ? plan.flags ?? [] : null, sub.overrides, now),
    readOnly: status === "suspended" || status === "canceled" || pendingDeletionAt !== null,
    trialDaysLeft: status === "trialing" && sub.trialEndsAt ? trialDaysLeft(sub.trialEndsAt, now) : null,
  };
}

/** Whether the company's plan includes a product (core products always). */
export async function canUseModule(moduleKey: string): Promise<boolean> {
  const e = await getEntitlements();
  return e.modules === null || e.modules.has(moduleKey);
}
