import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompanySubscription } from "@/lib/platform/billing/subscription";
import { isTrialLocked } from "@/lib/platform/billing/trial-lock-rule";

/**
 * Free trial over and nothing bought: every page leads to `/commandos/subscribe-required` (and changes are refused) until a plan is
 * subscribed. Sign-in still works, and so does Settings → Billing, where the plan is bought. Data is untouched.
 */
const TTL_MS = 20_000;
const memo = new Map<string, { at: number; locked: boolean }>();

export function forgetTrialLock(): void {
  memo.clear();
}

export async function trialLockedFor(companyId: string): Promise<boolean> {
  const hit = memo.get(companyId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.locked;
  let locked = false;
  try {
    locked = isTrialLocked(await getCompanySubscription(companyId), new Date());
  } catch (err) {
    console.error("[trial-lock] lookup failed", err); // fails open: a database blip must not lock a company out
  }
  if (memo.size > 2000) memo.clear();
  memo.set(companyId, { at: Date.now(), locked });
  return locked;
}

/** The current company's state, once per request. */
export const getTrialLocked = cache(async (): Promise<boolean> => trialLockedFor(await currentCompanyId()));

/** Page guard for the signed-in areas of the products. */
export async function trialLockGate(): Promise<void> {
  if (await getTrialLocked()) redirect("/commandos/subscribe-required");
}
