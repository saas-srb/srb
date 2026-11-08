import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { listPlans } from "@/lib/platform/billing/plans";
import { planMrr, recordSubscriptionEvent, SUBSCRIPTION_EVENTS_COLLECTION, type SubscriptionEventType } from "@/lib/platform/billing/events";
import type { BillingInterval, CompanySubscription } from "@/lib/platform/billing/types";

/**
 * One-off history backfill for `subscription_events`, so revenue analytics
 * aren't empty right after deploy. For every customer company that has a
 * stored subscription but NO events yet, it writes the best reconstruction of
 * how it got to its current state:
 *
 *   trialing ................. trial_started (at createdAt)
 *   active/past_due/grace .... trial_started (createdAt) + activated (currentPeriodStart,
 *                              else subscription.updatedAt, never before createdAt)
 *   grace already expired .... as above + suspended (at graceEndsAt)
 *   canceled/suspended ....... trial_started; if it was ever paid (has a
 *                              currentPeriodStart): activated + canceled/suspended
 *                              (at subscription.updatedAt), so its MRR ends at 0
 *
 * MRR is the plan's catalogue price for the subscription's cycle, monthly
 * normalised — the same rule as live events. The activation date is an
 * estimate (the subscription document only keeps the current period), which is
 * why this is labelled a backfill.
 *
 * Idempotent: companies that already have any event are skipped, and each
 * event's id is deterministic (`<companyId>:backfill:<type>`), so a re-run or a
 * concurrent run writes nothing twice. Dry run unless `apply` is true.
 */

export interface BackfillPlannedEvent {
  companyId: string;
  companyName: string;
  type: SubscriptionEventType;
  planId: string;
  interval: BillingInterval;
  mrr: number;
  at: Date;
}

export interface BackfillResult {
  apply: boolean;
  scanned: number;
  skippedWithHistory: number;
  skippedNoSubscription: number;
  companies: number;
  planned: BackfillPlannedEvent[];
  written: number;
}

type CompanyDoc = Company & { subscription?: CompanySubscription };

export async function backfillSubscriptionEvents(opts: { apply?: boolean; now?: Date } = {}): Promise<BackfillResult> {
  const apply = opts.apply === true;
  const now = opts.now ?? new Date();
  const db = await getPlatformDb();
  const [plans, companies, withEvents] = await Promise.all([
    listPlans(),
    db
      .collection<CompanyDoc>(COMPANIES_COLLECTION)
      .find({ isPlatformOwner: { $ne: true } }, { projection: { name: 1, createdAt: 1, subscription: 1 } })
      .toArray(),
    db.collection(SUBSCRIPTION_EVENTS_COLLECTION).distinct("companyId"),
  ]);
  const planById = new Map(plans.map((p) => [p._id, p]));
  const hasHistory = new Set(withEvents.map(String));

  const result: BackfillResult = { apply, scanned: companies.length, skippedWithHistory: 0, skippedNoSubscription: 0, companies: 0, planned: [], written: 0 };
  /** A date within [floor, now]; events that must follow another use floor + 1 ms so their order never ties. */
  const clamp = (d: Date | null | undefined, floor: Date) => {
    const t = d instanceof Date && !Number.isNaN(d.getTime()) ? d.getTime() : floor.getTime();
    return new Date(Math.min(Math.max(t, floor.getTime()), now.getTime()));
  };
  const after = (d: Date | null | undefined, prev: Date) => clamp(d, new Date(prev.getTime() + 1));

  for (const c of companies) {
    const s = c.subscription;
    if (!s || s.status === "internal") {
      result.skippedNoSubscription++;
      continue;
    }
    if (hasHistory.has(c._id)) {
      result.skippedWithHistory++;
      continue;
    }
    const interval: BillingInterval = s.interval ?? "monthly";
    const base = { companyId: c._id, companyName: c.name, planId: s.planId, interval };
    const createdAt = clamp(c.createdAt, new Date(0));
    const paidMrr = planMrr(planById.get(s.planId), interval);
    const events: BackfillPlannedEvent[] = [{ ...base, type: "trial_started", mrr: 0, at: createdAt }];
    const paying = s.status === "active" || s.status === "past_due" || s.status === "grace";
    const everPaid = paying || ((s.status === "canceled" || s.status === "suspended") && s.currentPeriodStart);
    if (everPaid) {
      const activatedAt = after(s.currentPeriodStart ?? s.updatedAt, createdAt);
      events.push({ ...base, type: "activated", mrr: paidMrr, at: activatedAt });
      if (!paying) events.push({ ...base, type: s.status === "canceled" ? "canceled" : "suspended", mrr: 0, at: after(s.updatedAt, activatedAt) });
      // Grace already over: effectively suspended (same on-read rule as entitlements), so history ends at 0 too.
      else if (s.status === "grace" && s.graceEndsAt && s.graceEndsAt <= now) events.push({ ...base, type: "suspended", mrr: 0, at: after(s.graceEndsAt, activatedAt) });
    }
    result.companies++;
    result.planned.push(...events);
  }

  if (apply) {
    for (const e of result.planned) {
      const stored = await recordSubscriptionEvent({ companyId: e.companyId, type: e.type, planId: e.planId, interval: e.interval, mrr: e.mrr, at: e.at, key: `backfill:${e.type}` });
      if (stored) result.written++;
    }
  }
  return result;
}
