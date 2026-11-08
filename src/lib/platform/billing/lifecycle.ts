import type { CompanySubscription, SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Time-based subscription transitions as pure functions (client-safe, no
 * data access), shared by entitlements, the trial sweep and the banner so
 * they always agree.
 */

const DAY_MS = 86_400_000;

/** Whole days left, rounded up (0 once passed). */
export function trialDaysLeft(trialEndsAt: Date, now: Date): number {
  return Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS));
}

/**
 * The status a subscription is really in right now, applying transitions the
 * daily sweep hasn't persisted yet: an ended trial is in grace until
 * trialEndsAt + graceDays, then suspended; an ended grace is suspended.
 */
export function effectiveSubscriptionStatus(sub: Pick<CompanySubscription, "status" | "trialEndsAt" | "graceEndsAt">, graceDays: number, now: Date): { status: SubscriptionStatus; graceEndsAt: Date | null } {
  if (sub.status === "trialing" && sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime()) {
    const graceEndsAt = new Date(sub.trialEndsAt.getTime() + Math.max(0, graceDays) * DAY_MS);
    return graceEndsAt.getTime() > now.getTime() ? { status: "grace", graceEndsAt } : { status: "suspended", graceEndsAt: null };
  }
  if (sub.status === "grace" && sub.graceEndsAt && sub.graceEndsAt.getTime() <= now.getTime()) return { status: "suspended", graceEndsAt: null };
  return { status: sub.status, graceEndsAt: sub.graceEndsAt };
}

/** Whether a subscription has never been paid for (its access comes from the trial alone). */
export const neverPaid = (sub: Pick<CompanySubscription, "currentPeriodStart">) => !sub.currentPeriodStart;
