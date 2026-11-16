import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";

/**
 * What the Platform Console shows per company: the last computed setup percentage and since when it has been under half. One small row per company in
 * the platform database, refreshed by the daily job (and whenever a Director opens Setup progress). It is a cache for the list, never the truth: the
 * company's own percentage is always derived from its data.
 */
export const PLATFORM_SETUP_COLLECTION = "platform_setup_progress";
export const STUCK_BELOW = 50;
export const STUCK_DAYS = 7;

export interface PlatformSetupRow { _id: string; percent: number; at: Date; belowSince: Date | null }

/** Pure: below half for at least a week. */
export function isStuck(row: Pick<PlatformSetupRow, "percent" | "belowSince"> | null | undefined, now: Date = new Date()): boolean {
  return Boolean(row && row.percent < STUCK_BELOW && row.belowSince && now.getTime() - row.belowSince.getTime() >= STUCK_DAYS * 86_400_000);
}

/** Pure: the new `belowSince` after a fresh percentage. */
export function nextBelowSince(prev: Date | null | undefined, percent: number, now: Date): Date | null {
  return percent < STUCK_BELOW ? (prev ?? now) : null;
}

async function col() { return (await getPlatformDb()).collection<PlatformSetupRow>(PLATFORM_SETUP_COLLECTION); }

export async function recordPlatformSetup(companyId: string, percent: number, now: Date = new Date()): Promise<void> {
  const c = await col();
  const prev = await c.findOne({ _id: companyId });
  await c.updateOne({ _id: companyId }, { $set: { percent, at: now, belowSince: nextBelowSince(prev?.belowSince, percent, now) } }, { upsert: true });
}

export async function getPlatformSetupRows(ids: string[]): Promise<Map<string, PlatformSetupRow>> {
  if (ids.length === 0) return new Map();
  return new Map((await (await col()).find({ _id: { $in: ids } }).toArray()).map((r) => [r._id, r]));
}

export async function stuckCompanyIds(now: Date = new Date()): Promise<string[]> {
  const before = new Date(now.getTime() - STUCK_DAYS * 86_400_000);
  return (await (await col()).find({ percent: { $lt: STUCK_BELOW }, belowSince: { $lte: before } }).toArray()).map((r) => r._id);
}
