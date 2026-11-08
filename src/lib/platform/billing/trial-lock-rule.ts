import type { CompanySubscription } from "@/lib/platform/billing/types";

/**
 * A free trial that ended without a subscription locks the workspace (pure; see `trial-lock.ts` for where it is read and enforced).
 * Paying lifts it at once. Companies that have ever paid keep the read-only mode they always had; the platform owner, the demo company
 * and complimentary companies are never locked.
 */

export type TrialLockInput = Pick<CompanySubscription, "status" | "trialEndsAt" | "currentPeriodStart" | "complimentary">;

export function isTrialLocked(sub: TrialLockInput | null, now: Date): boolean {
  if (!sub || sub.status === "internal" || sub.complimentary) return false;
  if (sub.status === "active" || sub.currentPeriodStart) return false; // paying, or has paid before
  return !!sub.trialEndsAt && sub.trialEndsAt.getTime() <= now.getTime();
}

/** Paths that stay open while locked: the page that explains it, billing (where the plan is bought), sign-in/out and the relay they use. */
export const TRIAL_LOCK_OPEN_PATH = /^\/(commandos\/(subscribe-required|settings\/(billing|usage)|verify-email|login|logout|change-password|forgot-password|reset-password)|api\/(secure|account\/session|client-error)|_next)(\/|$)/i;
