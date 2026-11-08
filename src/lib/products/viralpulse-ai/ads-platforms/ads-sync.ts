import "server-only";
import { randomUUID } from "node:crypto";
import { smmsCollection } from "@/lib/products/viralpulse-ai/db";
import { migrateLegacyCampaigns } from "@/lib/products/viralpulse-ai/campaigns";
import { AD_COLLECTIONS } from "./types";
import { defaultDeps, type AdsDeps } from "./deps";
import { approvalCovers, launchesCollection, type LaunchDoc } from "./launches";
import { formatMinorPlain, getGuard } from "./guard";
import { MetaApiError } from "./meta/errors";
import { getAdAccountInfo } from "./meta/account";
import { readInsights, readStatuses, type InsightRow, type ObjectStatus } from "./meta/sync";
import { upsertSnapshots, type SnapshotInput } from "./snapshots";

/**
 * The status + insights sync (cron job `viralpulse-ads`, every 30 minutes, per company). For every Meta launch that exists in Meta:
 *   - reads status / effective_status / review feedback of the campaign, ad sets and ads; a new disapproval or issue notifies the admins;
 *   - notices a campaign someone paused or archived inside Meta and records it;
 *   - checks the ad account (not active, payment problem, spend cap nearly used) and notifies once a day per problem;
 *   - pulls daily insights for the last days at campaign, ad set and ad level and upserts them into `smms_metric_snapshots`.
 * A rate-limited account is skipped until Meta says it may be called again. Every run is recorded in `smms_ad_sync_runs`.
 */

export const INSIGHTS_SOURCE = "meta_ads_insights";
const MIN_GAP_MS = 10 * 60_000;
const INSIGHT_DAYS = 3;

export interface SyncRunDoc {
  _id: string;
  startedAt: Date;
  finishedAt: Date | null;
  launches: number;
  snapshots: number;
  alerts: number;
  errors: { launchId: string; message: string }[];
  usage: { maxPct: number; tier: string | null; calls: number };
  skippedRateLimited: number;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
export async function syncRunsCollection() {
  return smmsCollection<SyncRunDoc>(AD_COLLECTIONS.syncRuns);
}

/** Pure: which review problems are new compared with what we stored. */
export function newProblems(prev: LaunchDoc["review"], now: Map<string, ObjectStatus>): { id: string; effectiveStatus: string; issues: string[] }[] {
  const out: { id: string; effectiveStatus: string; issues: string[] }[] = [];
  for (const [id, s] of now) {
    if (s.level !== "ad") continue;
    const bad = s.effectiveStatus === "DISAPPROVED" || s.effectiveStatus === "WITH_ISSUES";
    if (bad && prev[id]?.effectiveStatus !== s.effectiveStatus) out.push({ id, effectiveStatus: s.effectiveStatus!, issues: s.issues });
  }
  return out;
}

export function toSnapshots(l: LaunchDoc, rows: InsightRow[]): SnapshotInput[] {
  const adByExt = new Map(Object.entries(l.objects.ads).map(([adId, ext]) => [ext, adId]));
  return rows.map((r) => ({ platform: "meta", externalId: r.externalId, level: r.level, metric: r.metric, value: r.value, date: r.date, source: INSIGHTS_SOURCE, launchId: l._id, campaignId: l.campaignId, ...(r.level === "ad" && adByExt.get(r.externalId) ? { adId: adByExt.get(r.externalId) } : {}) }));
}

export async function runAdsSync(deps: AdsDeps = defaultDeps): Promise<SyncRunDoc> {
  const now = deps.now();
  const runs = await syncRunsCollection();
  const run: SyncRunDoc = { _id: randomUUID(), startedAt: now, finishedAt: null, launches: 0, snapshots: 0, alerts: 0, errors: [], usage: { maxPct: 0, tier: null, calls: 0 }, skippedRateLimited: 0 };
  await migrateLegacyCampaigns().catch(() => 0);
  const col = await launchesCollection();
  // While the kill switch is on every launch is looked at on every run (no minimum gap): a pause that failed must be retried at once.
  const killSwitch = (await getGuard()).killSwitch;
  const due = await col.find({ active: true, state: "ready", "objects.campaign": { $exists: true }, $and: [...(killSwitch ? [] : [{ $or: [{ lastSyncAt: null }, { lastSyncAt: { $lt: new Date(now.getTime() - MIN_GAP_MS) } }] }]), { $or: [{ syncDeferredUntil: null }, { syncDeferredUntil: { $lt: now } }] }] }).toArray();
  const total = await col.countDocuments({ active: true, state: "ready", syncDeferredUntil: { $gt: now } });
  run.skippedRateLimited = total;
  for (const l of due) {
    run.launches++;
    try {
      await syncOne(l, deps, run);
    } catch (e) {
      if (e instanceof MetaApiError && e.kind === "rate_limit") {
        await col.updateOne({ _id: l._id }, { $set: { syncDeferredUntil: new Date(now.getTime() + Math.max(e.retryAfterMs ?? 0, 5 * 60_000)) } });
        run.skippedRateLimited++;
      } else {
        run.errors.push({ launchId: l._id, message: (e instanceof Error ? e.message : "sync failed").slice(0, 300) });
      }
    }
  }
  run.finishedAt = deps.now();
  await runs.insertOne(run);
  return run;
}

async function syncOne(l: LaunchDoc, deps: AdsDeps, run: SyncRunDoc): Promise<void> {
  const col = await launchesCollection();
  const now = deps.now();
  const link = `/viralpulse-ai/campaigns/${l.campaignId}`;
  const adExt = Object.values(l.objects.ads);
  const campaignExt = l.objects.campaign!;
  await deps.withMeta(l.adAccountId, async (c) => {
    const [cs, as] = await Promise.all([readStatuses(c, "campaign", [campaignExt]), readStatuses(c, "ad", adExt)]);
    const extToAd = new Map(Object.entries(l.objects.ads).map(([adId, ext]) => [ext, adId]));
    // New problems.
    for (const p of newProblems(l.review, as)) {
      const adId = extToAd.get(p.id)!;
      const ad = l.ads.find((a) => a.id === adId);
      run.alerts++;
      await deps.notify({
        title: p.effectiveStatus === "DISAPPROVED" ? `Meta disapproved an ad in ${l.campaignName}` : `Meta found issues with an ad in ${l.campaignName}`,
        body: `${ad?.name ?? "An ad"}: ${p.issues[0] ?? "open the ad in Meta Ads Manager for the reason"}`,
        link,
        dedupeKey: `ads-review:${l._id}:${adId}:${p.effectiveStatus}`,
      });
    }
    const review = { ...l.review };
    for (const [id, s] of as) {
      const adId = extToAd.get(id);
      if (adId) review[adId] = { status: s.status, effectiveStatus: s.effectiveStatus, issues: s.issues, at: now };
    }
    // Paused/archived/deleted inside Meta.
    const guard = await getGuard();
    let pushEvent: LaunchDoc["events"][number] | null = null;
    const cStatus = cs.get(campaignExt);
    const set: Record<string, unknown> = { review, lastSyncAt: now, syncDeferredUntil: null, externalStatus: { campaign: cStatus?.effectiveStatus ?? null, at: now } };
    if (cStatus?.status === "DELETED" || cStatus?.status === "ARCHIVED") {
      set.delivery = "archived";
      set.active = false;
    } else if (cStatus?.status === "PAUSED" && l.delivery === "active") {
      set.delivery = "paused";
      await deps.notify({ title: `${l.campaignName} was paused in Meta`, body: "Someone paused the campaign inside Meta Ads Manager. It is shown as paused here.", link, dedupeKey: `ads-paused:${l._id}:${day(now)}` });
      run.alerts++;
    } else if (cStatus?.status === "ACTIVE" && (guard.killSwitch || !l.approval || !approvalCovers(l))) {
      // Spending in Meta that our records do not allow: the kill switch is on, or the budget was never approved (or changed since). Pause it.
      const why = guard.killSwitch ? "the ads kill switch is on" : "its budget is not approved";
      try {
        await c.post(campaignExt, { status: "PAUSED" }, { idempotentWrite: true });
        set.delivery = "paused";
        set.externalStatus = { campaign: "PAUSED", at: now };
        pushEvent = { at: now, by: "system", type: "paused", note: `Found running in Meta while ${why}; paused.` };
        await deps.notify({ title: `${l.campaignName} was paused: ${why}`, body: `The campaign was running in Meta Ads Manager but ${why}, so it was paused automatically.`, link, dedupeKey: `ads-enforced:${l._id}:${day(now)}` });
        await deps.audit({ actorId: "system", actorEmail: null, action: "status", entity: "campaign", entityId: l.campaignId, entityLabel: l.campaignName, recordId: l.campaignId, summary: `Paused automatically: running in Meta while ${why}`, metadata: { launchId: l._id } });
      } catch (e) {
        const message = (e instanceof Error ? e.message : "pause failed").slice(0, 200);
        run.errors.push({ launchId: l._id, message: `Could not pause a campaign that must not run (${why}): ${message}` });
        await deps.notify({ title: `${l.campaignName} is running in Meta and could not be paused`, body: `It must not run (${why}) but the automatic pause failed: ${message} Pause it in Meta Ads Manager. This is retried on the next sync.`, link, dedupeKey: `ads-enforce-failed:${l._id}:${day(now)}` });
      }
      run.alerts++;
    }
    await col.updateOne({ _id: l._id }, { $set: set, ...(pushEvent ? { $push: { events: { $each: [pushEvent], $slice: -100 } } } : {}) } as never);
    // Account health.
    const info = await getAdAccountInfo(c, l.actId).catch(() => null);
    if (info) {
      if (info.status !== null && info.status !== 1 && l.delivery === "active") {
        run.alerts++;
        await deps.notify({ title: `Meta ad account problem: ${info.statusLabel}`, body: `${info.name} cannot deliver ads (${info.statusLabel}). Check payment and account quality in Meta Business settings.`, link, dedupeKey: `ads-account:${l.actId}:${info.status}:${day(now)}` });
      }
      if (info.spendCapMinor && info.amountSpentMinor !== null && l.delivery === "active") {
        const left = info.spendCapMinor - info.amountSpentMinor;
        if (left <= l.commitment.dailyMinor * 2) {
          run.alerts++;
          await deps.notify({ title: "Meta ad account spend limit almost reached", body: `${info.name} has ${formatMinorPlain(Math.max(left, 0), info.currency)} left under its spend limit. Ads stop when it is used up.`, link, dedupeKey: `ads-lowcap:${l.actId}:${day(now)}` });
        }
      }
    }
    // Insights.
    const since = day(new Date(now.getTime() - (INSIGHT_DAYS - 1) * 86_400_000));
    const until = day(now);
    for (const level of ["campaign", "adset", "ad"] as const) {
      const rows = await readInsights(c, l.actId, level, [campaignExt], since, until);
      run.snapshots += await upsertSnapshots(toSnapshots(l, rows), now);
    }
    if (c.lastUsage) {
      run.usage.maxPct = Math.max(run.usage.maxPct, c.lastUsage.maxPct);
      run.usage.tier = c.lastUsage.tier ?? run.usage.tier;
    }
    run.usage.calls += c.calls;
  });
}
