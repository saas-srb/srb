import { platformEvents } from "@/lib/notify/triggers/platform";
import { workspaceEvents } from "@/lib/notify/triggers/workspace";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import "server-only";
import { randomUUID } from "node:crypto";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { getPlan } from "@/lib/platform/billing/plans";
import type { BillingInterval, CompanySubscription, Plan } from "@/lib/platform/billing/types";

/**
 * Append-only subscription history (platform-level `subscription_events`).
 * The subscription document on `companies` only holds the CURRENT state; the
 * revenue dashboard (`metrics.ts`) needs history for MRR movements, churn and
 * trial conversion, so every state change is also logged here.
 *
 * WHO CALLS THIS: the subscriptions and trials workstreams, right AFTER the
 * company's `subscription` has been written (so a default MRR can be derived
 * from the new state). Recording never throws — a failed history write must
 * not fail a payment webhook — and is a no-op for the platform owner.
 *
 *   trial started ............ recordSubscriptionEvent({ companyId, type: "trial_started", planId })
 *   first successful charge .. recordSubscriptionEvent({ companyId, type: "activated", planId, interval })
 *   plan / interval change ... recordSubscriptionEvent({ companyId, type: "plan_changed", planId, interval })
 *   payment failed ........... recordSubscriptionEvent({ companyId, type: "past_due", planId, interval })
 *   retries exhausted ........ recordSubscriptionEvent({ companyId, type: "grace", planId, interval })
 *   trial/grace expired ...... recordSubscriptionEvent({ companyId, type: "suspended", planId })
 *   canceled ................. recordSubscriptionEvent({ companyId, type: "canceled", planId })
 *   paid again after suspend/cancel, or past_due/grace recovered
 *                             recordSubscriptionEvent({ companyId, type: "reactivated", planId, interval })
 *
 * Pass `key` (e.g. the provider webhook event id) to make a retried call a no-op.
 */

export const SUBSCRIPTION_EVENTS_COLLECTION = "subscription_events";

export type SubscriptionEventType = "trial_started" | "activated" | "plan_changed" | "past_due" | "grace" | "suspended" | "canceled" | "reactivated";

export interface SubscriptionEvent {
  _id: string;
  companyId: string;
  type: SubscriptionEventType;
  planId: string | null;
  interval: BillingInterval | null;
  /** MRR the company contributes AFTER this event: paise, pre-tax, monthly-normalised (yearly / 12). 0 = not paying. */
  mrr: number;
  at: Date;
}

export interface RecordSubscriptionEventInput {
  companyId: string;
  type: SubscriptionEventType;
  planId: string | null;
  interval?: BillingInterval | null;
  /** Override the derived MRR (paise, monthly-normalised). Normally omitted. */
  mrr?: number;
  at?: Date;
  /** Idempotency key: a second call with the same key is ignored. */
  key?: string;
}

/** Events after which a company pays nothing. */
const NON_PAYING: ReadonlySet<SubscriptionEventType> = new Set(["trial_started", "suspended", "canceled"]);

/** Catalogue MRR of a plan at an interval — paise, pre-tax; yearly price / 12 (rounded). */
export function planMrr(plan: Pick<Plan, "priceMonthly" | "priceYearly"> | null | undefined, interval: BillingInterval | null | undefined): number {
  if (!plan) return 0;
  return interval === "yearly" ? Math.round(plan.priceYearly / 12) : plan.priceMonthly;
}

async function collection() {
  return (await getPlatformDb()).collection<SubscriptionEvent>(SUBSCRIPTION_EVENTS_COLLECTION);
}

/**
 * Appends one event. Returns the stored event, or null when skipped
 * (platform owner, unknown company, duplicate `key`, or a write error).
 */
export async function recordSubscriptionEvent(input: RecordSubscriptionEventInput): Promise<SubscriptionEvent | null> {
  try {
    const db = await getPlatformDb();
    const company = await db
      .collection<Company & { subscription?: CompanySubscription }>(COMPANIES_COLLECTION)
      .findOne({ _id: input.companyId }, { projection: { isPlatformOwner: 1, subscription: 1 } });
    if (!company || company.isPlatformOwner) return null;

    const interval = input.interval ?? company.subscription?.interval ?? "monthly";
    let mrr = input.mrr;
    if (mrr === undefined) {
      // A plan change during a trial is still a trial: nothing is being paid yet.
      const stillTrialing = input.type === "plan_changed" && company.subscription?.status === "trialing";
      mrr = NON_PAYING.has(input.type) || stillTrialing || !input.planId ? 0 : planMrr(await getPlan(input.planId), interval);
    }
    const event: SubscriptionEvent = {
      _id: input.key ? `${input.companyId}:${input.key}` : randomUUID(),
      companyId: input.companyId,
      type: input.type,
      planId: input.planId,
      interval,
      mrr: Math.max(0, Math.round(mrr)),
      at: input.at ?? new Date(),
    };
    await (await collection()).insertOne(event);
    try {
      const plan = input.planId ? await getPlan(input.planId) : null;
      const co = await db.collection<Company>(COMPANIES_COLLECTION).findOne({ _id: input.companyId }, { projection: { name: 1 } });
      await platformEvents.subscription(co?.name ?? input.companyId, input.companyId, input.type, plan?.name ?? null);
      await runAsCompany(input.companyId, () => workspaceEvents.billing(input.type, plan?.name ?? null));
    } catch (err) {
      console.error("[billing] could not notify about subscription event", err);
    }
    return event;
  } catch (err) {
    if ((err as { code?: number })?.code !== 11000) console.error("[billing] recordSubscriptionEvent failed", err);
    return null;
  }
}

let indexed = false;
/** Events for the given window, plus each company's last event before it (its opening state). */
export async function loadSubscriptionEvents(from: Date): Promise<{ opening: SubscriptionEvent[]; inWindow: SubscriptionEvent[] }> {
  const col = await collection();
  if (!indexed) {
    indexed = true;
    await col.createIndex({ companyId: 1, at: 1 }).catch(() => {});
  }
  const [opening, inWindow] = await Promise.all([
    col
      .aggregate<{ _id: string; event: SubscriptionEvent }>([
        { $match: { at: { $lt: from } } },
        { $sort: { at: 1, _id: 1 } },
        { $group: { _id: "$companyId", event: { $last: "$$ROOT" } } },
      ])
      .toArray()
      .then((rows) => rows.map((r) => r.event)),
    col.find({ at: { $gte: from } }).sort({ at: 1, _id: 1 }).toArray(),
  ]);
  return { opening, inWindow };
}
