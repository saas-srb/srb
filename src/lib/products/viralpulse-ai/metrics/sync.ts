import "server-only";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { makeHttp, MetricsApiError, type HttpDeps } from "./http";
import { matchTargets, pickTargets, type AccountLite, type AttemptLite, type PostLite } from "./match";
import { getMetricsSettings, purgeOld, syncCol, writeRows } from "./store";
import { pullInstagram } from "./pullers/instagram";
import { pullFacebook } from "./pullers/facebook";
import { pullYoutube } from "./pullers/youtube";
import { pullLinkedin } from "./pullers/linkedin";
import { pullX } from "./pullers/x";
import type { PullAccount, PullCtx, PullOutput } from "./pullers/common";
import { MANUAL_COOLDOWN_MIN, NOTIFY_AFTER_FAILURES, PLATFORM_LABEL, PROVIDER_PLATFORM, SYNC_INTERVAL_MIN, type AccountSyncState, type MetricPlatform, type MetricsSettings } from "./types";

const HOUSEKEEPING = "__housekeeping";

/**
 * The metrics sync (cron job `viralpulse-metrics`, every 3 hours, per company). For every enabled connected account that has an analytics
 * adapter it reads the platform's numbers (see SPEC.md), stores daily snapshots idempotently and records per-account state: last synced,
 * next sync, plain error, warnings. Rate-limited or out-of-quota accounts are deferred until the platform says they may be called again.
 */

export interface SyncAccount extends PullAccount {
  platform: MetricPlatform;
  enabled: boolean;
  isDefault: boolean;
  status: string;
}

export interface MetricsDeps {
  now(): Date;
  sleep(ms: number): Promise<void>;
  fetch: typeof fetch;
  listAccounts(): Promise<SyncAccount[]>;
  withToken<T>(accountId: string, fn: (token: string) => Promise<T>): Promise<T>;
  loadPosts(): Promise<PostLite[]>;
  loadAttempts(): Promise<AttemptLite[]>;
  notify(n: { title: string; body: string; link: string; dedupeKey: string }): Promise<void>;
  linkedinVersion(): Promise<string>;
  /** Budget for one run, so a big company cannot run past the job's time limit. */
  budgetMs?: number;
}

export interface RunSummary {
  accounts: number;
  synced: number;
  failed: number;
  deferred: number;
  skipped: number;
  rows: number;
  purged: number;
}

const PULLERS: Record<MetricPlatform, (c: PullCtx) => Promise<PullOutput>> = { instagram: pullInstagram, facebook: pullFacebook, youtube: pullYoutube, linkedin: pullLinkedin, x: pullX };
const day = (d: Date) => d.toISOString().slice(0, 10);

function blank(a: SyncAccount, now: Date): AccountSyncState {
  return { _id: a.id, accountId: a.id, platform: a.platform, accountName: a.name, status: "never", lastAttemptAt: null, lastOkAt: null, nextSyncAt: null, error: null, errorKind: null, consecutiveFailures: 0, lastNotifiedAt: null, warnings: [], rowsWritten: 0, cursor: {}, quota: { day: day(now), youtubeUnits: 0, youtubeAnalyticsCalls: 0 }, manualAt: null, updatedAt: now };
}

export async function getSyncState(accountId: string): Promise<AccountSyncState | null> {
  return (await syncCol()).findOne({ _id: accountId });
}

/** Reads and stores one account. Never throws for platform problems: they are recorded on the account's state. */
export async function syncAccount(deps: MetricsDeps, a: SyncAccount, opts: { full?: boolean; settings?: MetricsSettings } = {}): Promise<{ state: AccountSyncState; rows: number }> {
  const now = deps.now();
  const col = await syncCol();
  const settings = opts.settings ?? (await getMetricsSettings());
  const prev = (await col.findOne({ _id: a.id })) ?? blank(a, now);
  const first = prev.status === "never" || !prev.cursor.accountThrough;
  const next: AccountSyncState = { ...prev, accountName: a.name, platform: a.platform, lastAttemptAt: now, updatedAt: now };
  let rowsWritten = 0;
  try {
    if (a.status === "revoked" || a.status === "expired") throw new MetricsApiError(`The ${PLATFORM_LABEL[a.platform]} login is ${a.status}. Reconnect it in Settings > Connected accounts.`, "auth", 401);
    const [posts, attempts, accounts] = await Promise.all([deps.loadPosts(), deps.loadAttempts(), deps.listAccounts()]);
    const matched = matchTargets(posts, attempts, accounts);
    const all = matched.byAccount.get(a.id) ?? [];
    const olderDue = opts.full || !prev.cursor.olderAt || prev.cursor.olderAt !== day(now);
    const targets = pickTargets(all, now, settings, olderDue);
    const http = makeHttp({ fetch: deps.fetch, sleep: deps.sleep, now: deps.now } satisfies HttpDeps);
    const linkedinVersion = a.platform === "linkedin" ? await deps.linkedinVersion() : undefined;
    const out = await deps.withToken(a.id, (token) => PULLERS[a.platform]({ token, account: a, http, now, targets, state: { cursor: prev.cursor, quota: prev.quota }, settings, full: Boolean(opts.full) || first, linkedinVersion }));
    rowsWritten = await writeRows(out.rows, now, settings.retentionDays);
    const warnings = [...out.warnings];
    if (matched.unmatched.length) warnings.push(`${matched.unmatched.length} published post${matched.unmatched.length === 1 ? "" : "s"} could not be matched to a platform post id.`);
    Object.assign(next, {
      status: "ok", error: null, errorKind: null, consecutiveFailures: 0, lastOkAt: now, warnings, rowsWritten,
      cursor: { ...prev.cursor, ...out.cursor, ...(olderDue ? { olderAt: day(now) } : {}), ...(first ? { backfilledAt: day(now) } : {}) },
      quota: { day: day(now), youtubeUnits: out.quota?.youtubeUnits ?? 0, youtubeAnalyticsCalls: out.quota?.youtubeAnalyticsCalls ?? 0 },
      nextSyncAt: new Date(now.getTime() + SYNC_INTERVAL_MIN[a.platform] * 60_000),
    });
    if (a.platform === "x") next.nextSyncAt = new Date(now.getTime() + settings.x.minHoursBetween * 3_600_000);
    if (a.platform === "x" && !settings.x.enabled) next.status = "skipped";
  } catch (e) {
    const err = e instanceof MetricsApiError ? e : null;
    const msg = (e instanceof Error ? e.message : "The sync failed.").slice(0, 300);
    if (err && (err.kind === "rate_limit" || err.kind === "quota")) {
      Object.assign(next, { status: "deferred", error: `${err.kind === "quota" ? "Quota used up" : "Rate limited"}: ${msg}`, errorKind: err.kind, nextSyncAt: new Date(now.getTime() + Math.max(err.retryAfterMs ?? 0, 10 * 60_000)) });
    } else {
      const failures = prev.consecutiveFailures + 1;
      const backoff = Math.min(SYNC_INTERVAL_MIN[a.platform] * 2 ** Math.min(failures, 3), 12 * 60) * 60_000;
      Object.assign(next, { status: "error", error: msg, errorKind: err?.kind ?? "transient", consecutiveFailures: failures, nextSyncAt: new Date(now.getTime() + backoff) });
      const quiet = prev.lastNotifiedAt && now.getTime() - prev.lastNotifiedAt.getTime() < 24 * 3_600_000;
      if (failures >= NOTIFY_AFTER_FAILURES && !quiet) {
        await deps.notify({ title: `${PLATFORM_LABEL[a.platform]} numbers are not updating for ${a.name}`, body: msg, link: "/viralpulse-ai/analytics?tab=accounts", dedupeKey: `vp-metrics:${a.id}:${day(now)}` }).catch(() => {});
        next.lastNotifiedAt = now;
      }
    }
  }
  const { _id: _ignored, ...doc } = next;
  void _ignored;
  await col.replaceOne({ _id: a.id }, doc, { upsert: true });
  return { state: next, rows: rowsWritten };
}

export async function runMetricsSync(deps: MetricsDeps): Promise<RunSummary> {
  const started = deps.now();
  const settings = await getMetricsSettings();
  const accounts = (await deps.listAccounts()).filter((a) => a.enabled);
  const states = new Map((await (await syncCol()).find({}).toArray()).map((s) => [s._id, s]));
  const sum: RunSummary = { accounts: accounts.length, synced: 0, failed: 0, deferred: 0, skipped: 0, rows: 0, purged: 0 };
  for (const a of accounts) {
    if (deps.budgetMs && deps.now().getTime() - started.getTime() > deps.budgetMs) break;
    const s = states.get(a.id);
    if (s?.nextSyncAt && s.nextSyncAt.getTime() > deps.now().getTime()) {
      sum.skipped++;
      continue;
    }
    const r = await syncAccount(deps, a, { settings });
    sum.rows += r.rows;
    if (r.state.status === "ok") sum.synced++;
    else if (r.state.status === "deferred") sum.deferred++;
    else if (r.state.status === "skipped") sum.skipped++;
    else sum.failed++;
  }
  // Housekeeping once a day, after the first run of the day.
  // One marker per company. Its `_id` carries the company id: a fixed id would collide across the shared collection, and the marker is
  // found by `accountId` so a row written under the old fixed id is still seen.
  const marker = await (await syncCol()).findOne({ accountId: HOUSEKEEPING });
  if (!marker || day(marker.updatedAt) !== day(started)) {
    sum.purged = await purgeOld(started, settings.retentionDays);
    const row = { accountId: HOUSEKEEPING, platform: "instagram" as const, accountName: "", status: "ok" as const, lastAttemptAt: started, lastOkAt: started, nextSyncAt: null, error: null, errorKind: null, consecutiveFailures: 0, lastNotifiedAt: null, warnings: [], rowsWritten: sum.purged, cursor: {}, quota: { day: day(started), youtubeUnits: 0, youtubeAnalyticsCalls: 0 }, manualAt: null, updatedAt: started };
    await (await syncCol()).updateOne({ accountId: HOUSEKEEPING }, { $set: row as never, $setOnInsert: { _id: `${HOUSEKEEPING}:${await currentCompanyId()}` } as never }, { upsert: true });
  }
  return sum;
}

export type SyncNowResult = { ok: true; synced: number; message: string } | { ok: false; error: string };

/** "Sync now": one account or all; refuses within the cooldown or while a platform has told us to wait. */
export async function syncNow(deps: MetricsDeps, accountId?: string): Promise<SyncNowResult> {
  const now = deps.now();
  const accounts = (await deps.listAccounts()).filter((a) => a.enabled && (!accountId || a.id === accountId));
  if (!accounts.length) return { ok: false, error: accountId ? "That account can't be read (it is switched off or has no analytics support)." : "No connected account supports analytics yet. Connect an Instagram, Facebook, YouTube, LinkedIn or X account first." };
  const col = await syncCol();
  let synced = 0;
  const notes: string[] = [];
  for (const a of accounts) {
    const s = await col.findOne({ _id: a.id });
    if (s?.manualAt && now.getTime() - s.manualAt.getTime() < MANUAL_COOLDOWN_MIN * 60_000) {
      notes.push(`${a.name}: synced a moment ago, try again in ${Math.ceil((MANUAL_COOLDOWN_MIN * 60_000 - (now.getTime() - s.manualAt.getTime())) / 60_000)} min`);
      continue;
    }
    if (s?.status === "deferred" && s.nextSyncAt && s.nextSyncAt.getTime() > now.getTime()) {
      notes.push(`${a.name}: ${s.error ?? "waiting for the platform"}`);
      continue;
    }
    await col.updateOne({ _id: a.id }, { $set: { manualAt: now } }, { upsert: false });
    const r = await syncAccount(deps, a);
    await col.updateOne({ _id: a.id }, { $set: { manualAt: now } });
    if (r.state.status === "ok") synced++;
    else notes.push(`${a.name}: ${r.state.error ?? r.state.status}`);
  }
  if (synced === 0 && notes.length) return { ok: false, error: notes.join(" | ") };
  return { ok: true, synced, message: `Synced ${synced} account${synced === 1 ? "" : "s"}.${notes.length ? ` ${notes.join(" | ")}` : ""}` };
}

export { PROVIDER_PLATFORM };
export type { AccountLite };
