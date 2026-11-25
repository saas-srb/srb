import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getPlan } from "@/lib/platform/billing/plans";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { applyLimitOverrides } from "@/lib/platform/billing/overrides";
import type { CompanySubscription, Plan, PlanLimits } from "@/lib/platform/billing/types";

/**
 * A company's effective limits: its plan's limits (from the DB), then whatever
 * the platform admin changed for that company (`overrides.ts`).
 */

export const UNLIMITED_LIMITS: PlanLimits = { seats: null, aiTokensPerMonth: null, storageMb: null, emailsPerMonth: null, voiceMinutesPerMonth: null, customDomains: null };
export type LimitKey = keyof PlanLimits;
/**
 * Effective limits for a subscription whose plan is already loaded: the plan's, then whatever the platform admin set for
 * this company in the Platform Console (see `overrides.ts`). Every limit check in the product reads this, so one change applies everywhere.
 */
export async function effectiveLimitsFor(sub: CompanySubscription | null, plan: Plan | null): Promise<PlanLimits> {
  if (!sub || sub.status === "internal") return { ...UNLIMITED_LIMITS };
  const base = plan?.limits ?? UNLIMITED_LIMITS;
  return applyLimitOverrides({ ...base }, sub.overrides);
}

/** The effective limits of a company. The platform owner is unlimited. */
export async function getEffectiveLimits(companyId: string): Promise<PlanLimits> {
  const sub = await getCompanySubscription(companyId);
  if (!sub || sub.status === "internal") return { ...UNLIMITED_LIMITS };
  return effectiveLimitsFor(sub, await getPlan(sub.planId));
}
