import "server-only";
import {
  listSubscriptions as listPrmsSubscriptions,
  subscriptionMetrics as prmsSubscriptionMetrics,
  type SoftwareSubscription,
} from "@/lib/products/spendiq/software-subscriptions";

/**
 * FMS's Subscriptions read layer (§51 Phase 7). `prms_software_subscriptions`
 * is real (cost, billing cycle, renewal date) but represents a recurring
 * *commitment*, not a booked payment event — it never flows into any
 * `fms_transaction`. Same read-only posture as `fms/training-revenue.ts`:
 * this module only reads PRMS's real exports directly and never writes to
 * any PRMS collection.
 */

export async function listActiveSubscriptions(): Promise<SoftwareSubscription[]> {
  return listPrmsSubscriptions({ status: { $in: ["active", "expiring"] } });
}

/** Total monthly recurring commitment across active/expiring subscriptions — for the FMS dashboard's Subscriptions KPI. */
export async function totalMonthlySubscriptionCommitment(): Promise<number> {
  try {
    const metrics = await prmsSubscriptionMetrics(0);
    return metrics.monthly;
  } catch {
    return 0;
  }
}
