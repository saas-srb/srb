import "server-only";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { smmsCollection } from "@/lib/products/viralpulse-ai/db";
import { snapshotKey, snapshotsCollection, type SnapshotDoc } from "@/lib/products/viralpulse-ai/ads-platforms/snapshots";
import { DEFAULT_SETTINGS, ORGANIC_SOURCES, metricSource, type AccountSyncState, type MetricRow, type MetricsSettings } from "./types";

/** Collections of the metrics layer: `smms_metric_sync` (one state row per account), `smms_metric_settings` (one row), plus WP6a's `smms_metric_snapshots`. */
export const SYNC_COLLECTION = "smms_metric_sync";
export const SETTINGS_COLLECTION = "smms_metric_settings";

export const syncCol = () => smmsCollection<AccountSyncState>(SYNC_COLLECTION);
const settingsCol = () => smmsCollection<{ _id: string } & Partial<MetricsSettings>>(SETTINGS_COLLECTION);

const clamp = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function normalizeSettings(raw: Partial<MetricsSettings> | null | undefined): MetricsSettings {
  const r = raw ?? {};
  const x = (r.x ?? {}) as Partial<MetricsSettings["x"]>;
  return {
    retentionDays: clamp(r.retentionDays, 90, 3650, DEFAULT_SETTINGS.retentionDays),
    recentPostDays: clamp(r.recentPostDays, 1, 60, DEFAULT_SETTINGS.recentPostDays),
    olderPostDays: clamp(r.olderPostDays, 7, 730, DEFAULT_SETTINGS.olderPostDays),
    youtubeDailyUnitCap: clamp(r.youtubeDailyUnitCap, 100, 10000, DEFAULT_SETTINGS.youtubeDailyUnitCap),
    x: { enabled: x.enabled === true, maxPostsPerRun: clamp(x.maxPostsPerRun, 1, 200, DEFAULT_SETTINGS.x.maxPostsPerRun), minHoursBetween: clamp(x.minHoursBetween, 1, 168, DEFAULT_SETTINGS.x.minHoursBetween) },
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : null,
    updatedBy: typeof r.updatedBy === "string" ? r.updatedBy : null,
  };
}

export async function getMetricsSettings(): Promise<MetricsSettings> {
  return normalizeSettings(await (await settingsCol()).findOne({}));
}

export async function saveMetricsSettings(input: Partial<MetricsSettings>, actorId: string): Promise<MetricsSettings> {
  const next = normalizeSettings({ ...(await getMetricsSettings()), ...input, x: { ...(await getMetricsSettings()).x, ...(input.x ?? {}) }, updatedAt: new Date().toISOString(), updatedBy: actorId });
  // One row per company, found by company alone (the scoped layer adds it) so an earlier row under the old fixed id "main" is still the one
  // updated; a new row's `_id` carries the company id because a fixed id would collide across companies in this shared collection.
  await (await settingsCol()).updateOne({}, { $set: next as never, $setOnInsert: { _id: `main:${await currentCompanyId()}` } as never }, { upsert: true });
  return next;
}

/**
 * Idempotent: the unique key is (platform, externalId, level, metric, date, source), so the same read twice leaves one row holding the
 * newest value. Rows older than the retention window are not written.
 */
export async function writeRows(rows: MetricRow[], capturedAt: Date, retentionDays: number): Promise<number> {
  if (!rows.length) return 0;
  const col = await snapshotsCollection();
  const cutoff = new Date(capturedAt.getTime() - retentionDays * 86_400_000).toISOString().slice(0, 10);
  const company = await currentCompanyId();
  const unique = new Map<string, MetricRow>();
  for (const r of rows) {
    if (!Number.isFinite(r.value) || r.date < cutoff) continue;
    unique.set(snapshotKey({ platform: r.platform, externalId: r.externalId, level: r.level, metric: r.metric, date: r.date, source: metricSource(r.platform) }), r);
  }
  const ops = [...unique.entries()].map(([key, r]) => ({
    updateOne: {
      filter: { platform: r.platform, externalId: r.externalId, level: r.level, metric: r.metric, date: r.date, source: metricSource(r.platform) },
      update: { $set: { value: r.value, capturedAt, accountId: r.accountId, ...(r.postId ? { postId: r.postId } : {}) }, $setOnInsert: { _id: `${company}|${key}` } },
      upsert: true,
    },
  }));
  for (let i = 0; i < ops.length; i += 500) await col.bulkWrite(ops.slice(i, i + 500) as never, { ordered: false });
  return ops.length;
}

/** Deletes organic snapshots past the retention window. Paid snapshots (WP6a) are not touched. */
export async function purgeOld(now: Date, retentionDays: number): Promise<number> {
  const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString().slice(0, 10);
  return (await (await snapshotsCollection()).deleteMany({ source: { $in: ORGANIC_SOURCES }, date: { $lt: cutoff } })).deletedCount;
}

export type OrganicSnapshot = SnapshotDoc & { accountId?: string; postId?: string };
