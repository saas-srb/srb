import "server-only";
import { getRevenueSnapshot, type RevenueSnapshot, type TrialEnding, type TrackedStatus } from "@/lib/platform/billing/metrics";

/**
 * Platform Console dashboard data (cross-company, raw DB): subscription status
 * mix, trials ending soon and the headline revenue figures. All of it comes
 * from `billing/metrics.ts`, so the dashboard and /console/revenue always
 * agree. Companies with no stored subscription (created before billing) count
 * as trialing from their creation date, matching `getCompanySubscription`.
 * The platform owner is excluded.
 */

export interface SubscriptionSnapshot {
  counts: Record<TrackedStatus, number>;
  /** First 20, soonest first. */
  trialsEndingSoon: TrialEnding[];
  trialsEndingCount: number;
  mrr: number;
  arr: number;
  paying: number;
  arpa: RevenueSnapshot["arpa"];
  currency: string;
}

export async function getSubscriptionSnapshot(now = new Date()): Promise<SubscriptionSnapshot> {
  const s = await getRevenueSnapshot(now);
  return { counts: s.counts, trialsEndingSoon: s.trialsEndingSoon.slice(0, 20), trialsEndingCount: s.trialsEndingSoon.length, mrr: s.mrr, arr: s.arr, paying: s.paying, arpa: s.arpa, currency: s.currency };
}
