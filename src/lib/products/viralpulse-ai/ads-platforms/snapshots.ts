import "server-only";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { smmsCollection } from "@/lib/products/viralpulse-ai/db";
import { AD_COLLECTIONS } from "./types";

/**
 * `smms_metric_snapshots`: one row per (platform, externalId, level, metric, date, source), value overwritten on every sync so re-running
 * a sync never duplicates. Shared with the analytics work package: it only needs this collection's shape.
 */
export interface SnapshotDoc {
  _id: string;
  platform: string;
  externalId: string;
  level: "campaign" | "adset" | "ad" | "account" | "post" | "channel";
  metric: string;
  value: number;
  /** YYYY-MM-DD in the ad account's reporting day. */
  date: string;
  source: string;
  capturedAt: Date;
  /** Our own ids, so paid data joins by launch and not by name. */
  launchId?: string;
  campaignId?: string;
  adId?: string;
}

export interface SnapshotInput {
  platform: string;
  externalId: string;
  level: SnapshotDoc["level"];
  metric: string;
  value: number;
  date: string;
  source: string;
  launchId?: string;
  campaignId?: string;
  adId?: string;
}

let ensured = false;
export async function snapshotsCollection() {
  const col = await smmsCollection<SnapshotDoc>(AD_COLLECTIONS.snapshots);
  if (!ensured) {
    ensured = true;
    await Promise.all([
      col.createIndex({ platform: 1, externalId: 1, level: 1, metric: 1, date: 1, source: 1 }, { unique: true }).catch(() => {}),
      col.createIndex({ campaignId: 1, date: -1 }).catch(() => {}),
      col.createIndex({ launchId: 1, date: -1 }).catch(() => {}),
    ]);
  }
  return col;
}
export function resetSnapshotIndexCacheForTests() {
  ensured = false;
}

/** The natural key of a snapshot WITHIN one company. The stored `_id` is `<companyId>|<this>`: two companies connecting the same Page / channel / ad account must not collide on a shared collection. */
export const snapshotKey = (s: Pick<SnapshotInput, "platform" | "externalId" | "level" | "metric" | "date" | "source">) => [s.platform, s.externalId, s.level, s.metric, s.date, s.source].join("|");

/** Idempotent: the same rows twice leave one row each, holding the latest value. Returns the number written. */
export async function upsertSnapshots(rows: SnapshotInput[], capturedAt: Date = new Date()): Promise<number> {
  if (!rows.length) return 0;
  const col = await snapshotsCollection();
  const company = await currentCompanyId();
  const unique = new Map<string, SnapshotInput>();
  for (const r of rows) if (Number.isFinite(r.value)) unique.set(snapshotKey(r), r);
  const ops = [...unique.values()].map((r) => ({
    updateOne: {
      filter: { platform: r.platform, externalId: r.externalId, level: r.level, metric: r.metric, date: r.date, source: r.source },
      update: { $set: { value: r.value, capturedAt, ...(r.launchId ? { launchId: r.launchId } : {}), ...(r.campaignId ? { campaignId: r.campaignId } : {}), ...(r.adId ? { adId: r.adId } : {}) }, $setOnInsert: { _id: `${company}|${snapshotKey(r)}` } },
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += 500) await col.bulkWrite(ops.slice(i, i + 500), { ordered: false });
  return ops.length;
}
