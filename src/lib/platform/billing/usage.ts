import "server-only";
import { getDb } from "@/lib/mongodb";
import { resolveUsageActor } from "@/lib/platform/billing/usage-actor";
import type { UsageMetric } from "@/lib/platform/billing/types";

/**
 * Metered usage per company per calendar month, in the company-scoped
 * `billing_usage` collection keyed `<metric>:<yyyy-mm>` (a keyed collection,
 * so each company has its own counters). Increment-only and cheap: one upsert.
 */

const COLLECTION = "billing_usage";

export function usagePeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

/** Where a use came from (shown in the usage history): a short label, plus an optional detail line (a subject, a file kind). */
export interface UsageContext {
  source: string;
  detail?: string;
}

export const USAGE_EVENTS_COLLECTION = "usage_events";

/**
 * Appends one row to the company's usage history (`usage_events`): when, which meter, how much (negative = given back, storage only), and
 * what for. AI calls have their own richer log (`ai_usage_events`). Never throws — history must not break the work it describes.
 */
export async function recordUsageEvent(metric: UsageMetric | "storage_bytes", amount: number, ctx: UsageContext, at = new Date()): Promise<void> {
  try {
    if (!Number.isFinite(amount) || amount === 0) return;
    const db = await getDb();
    const col = db.collection(USAGE_EVENTS_COLLECTION);
    if (!eventsIndexed) {
      eventsIndexed = true;
      await col.createIndex({ metric: 1, at: -1 }).catch(() => {});
    }
    const actor = await resolveUsageActor();
    await col.insertOne({ at, metric, amount, source: ctx.source.slice(0, 80), detail: (ctx.detail ?? "").slice(0, 200), actorKey: actor.key, actorKind: actor.kind, actorLabel: actor.label });
  } catch (err) {
    console.error("[usage] could not record history", err);
  }
}
let eventsIndexed = false;

export async function recordUsage(metric: UsageMetric, amount: number, date = new Date(), ctx?: UsageContext): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  if (ctx) await recordUsageEvent(metric, amount, ctx, date);
  const db = await getDb();
  const add = Math.round(amount);
  const row = await db
    .collection<{ _id: string; metric: UsageMetric; period: string; total: number; updatedAt: Date }>(COLLECTION)
    .findOneAndUpdate({ _id: `${metric}:${usagePeriod(date)}` }, { $inc: { total: add }, $set: { metric, period: usagePeriod(date), updatedAt: new Date() } }, { upsert: true, returnDocument: "after" });
  // Whatever went beyond the plan's own monthly allowance is paid from top-up credits (see credits-burn.ts). Only for the current month.
  if (row && usagePeriod(date) === usagePeriod()) {
    const { burnAfterUsage } = await import("@/lib/platform/billing/credits-burn");
    await burnAfterUsage(metric, row.total - add, row.total);
  }
}

export async function getUsage(metric: UsageMetric, period = usagePeriod()): Promise<number> {
  const db = await getDb();
  const doc = await db.collection<{ _id: string; total: number }>(COLLECTION).findOne({ _id: `${metric}:${period}` });
  return doc?.total ?? 0;
}
