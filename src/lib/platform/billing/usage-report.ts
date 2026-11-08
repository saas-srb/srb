import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { entitlementsFor } from "@/lib/platform/billing/entitlements";
import { SEAT_FILTER, STORAGE_USAGE_ID } from "@/lib/platform/billing/enforce";
import { usagePeriod } from "@/lib/platform/billing/usage";
import type { SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Platform Console "Usage & limits": per company, what it uses against its
 * effective limits (plan + add-ons). Reads the raw platform database with
 * explicit `companyId` filters — registry-level counters only, never a
 * company's business data.
 */

/** A metric at or above this share of its limit is "near". */
export const NEAR_LIMIT_RATIO = 0.8;

export type UsageLevel = "over" | "near" | "ok";

export interface UsageMeter {
  used: number;
  /** null = unlimited. */
  limit: number | null;
  level: UsageLevel;
}

export interface CompanyUsageRow {
  id: string;
  name: string;
  slug: string;
  isPlatformOwner: boolean;
  planId: string | null;
  planName: string | null;
  status: SubscriptionStatus;
  seats: UsageMeter;
  aiTokens: UsageMeter;
  /** Megabytes (rounded up to 0.01). */
  storageMb: UsageMeter;
  /** Worst level across the three meters. */
  level: UsageLevel;
}

export function meterLevel(used: number, limit: number | null): UsageLevel {
  if (limit === null) return "ok";
  if (used > limit || (limit === 0 && used > 0)) return "over";
  if (limit > 0 && used >= limit * NEAR_LIMIT_RATIO) return "near";
  return "ok";
}

const meter = (used: number, limit: number | null): UsageMeter => ({ used, limit, level: meterLevel(used, limit) });
const worst = (levels: UsageLevel[]): UsageLevel => (levels.includes("over") ? "over" : levels.includes("near") ? "near" : "ok");

export async function listCompanyUsage(period = usagePeriod()): Promise<CompanyUsageRow[]> {
  const db = await getPlatformDb();
  const companies = await db
    .collection<Company>(COMPANIES_COLLECTION)
    .find({}, { projection: { name: 1, slug: 1, isPlatformOwner: 1 } })
    .sort({ name: 1 })
    .toArray();
  const ids = companies.map((c) => String(c._id));
  if (ids.length === 0) return [];

  const usage = db.collection<{ _id: string; companyId: string; total: number }>("billing_usage");
  const [seatRows, aiRows, storageRows] = await Promise.all([
    db
      .collection("admin_users")
      .aggregate<{ _id: string; n: number }>([{ $match: { companyId: { $in: ids }, ...SEAT_FILTER } }, { $group: { _id: "$companyId", n: { $sum: 1 } } }])
      .toArray(),
    usage.find({ companyId: { $in: ids }, metric: "ai_tokens", period }, { projection: { companyId: 1, total: 1 } }).toArray(),
    usage.find({ companyId: { $in: ids }, _id: { $in: ids.map((id) => `${id}::${STORAGE_USAGE_ID}`) } }, { projection: { companyId: 1, total: 1 } }).toArray(),
  ]);
  const seats = new Map(seatRows.map((r) => [r._id, r.n]));
  const ai = new Map(aiRows.map((r) => [r.companyId, r.total]));
  const storage = new Map(storageRows.map((r) => [r.companyId, r.total]));

  const rows: CompanyUsageRow[] = [];
  // Entitlements read a subscription + plan (+ add-ons) each; bounded concurrency.
  for (let i = 0; i < companies.length; i += 20) {
    const batch = companies.slice(i, i + 20);
    const ents = await Promise.all(batch.map((c) => entitlementsFor(String(c._id))));
    batch.forEach((c, j) => {
      const id = String(c._id);
      const e = ents[j];
      const storageMb = Math.ceil(((storage.get(id) ?? 0) / (1024 * 1024)) * 100) / 100;
      const row = {
        id,
        name: c.name,
        slug: c.slug,
        isPlatformOwner: Boolean(c.isPlatformOwner),
        planId: e.planId,
        planName: e.planName,
        status: e.status,
        seats: meter(seats.get(id) ?? 0, e.limits.seats),
        aiTokens: meter(ai.get(id) ?? 0, e.limits.aiTokensPerMonth),
        storageMb: meter(storageMb, e.limits.storageMb),
      };
      rows.push({ ...row, level: worst([row.seats.level, row.aiTokens.level, row.storageMb.level]) });
    });
  }
  return rows;
}
