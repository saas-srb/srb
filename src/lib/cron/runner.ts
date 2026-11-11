import "server-only";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { hasBearer } from "@/lib/security/bearer";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { CRON_BY_KEY } from "@/lib/cron/registry";
import { JOB_RUNNERS, summarize } from "@/lib/cron/jobs";
import { alertJobFailed, effectiveJob } from "@/lib/cron/config";
import { intervalMs, previousRun } from "@/lib/cron/schedule";
import { authorizeCron } from "@/lib/cron/auth";
import { isSaasAppHost, isSaasHost } from "@/lib/platform/saas/hosts";
import { getConfig } from "@/lib/platform/config/store";
import { acquireLease as acquire, releaseLease as release } from "@/lib/cron/lease";

/**
 * Runs scheduled jobs the same safe way however they are started (Vercel Cron, the in-app scheduler, "Run now" in the Platform Console):
 *   - a lock per job in the database, so two servers (or a double-fired cron) never run the same job at once;
 *   - a record of every run (when, how long, what it did, who started it) for the Scheduled jobs page, kept 30 days;
 *   - a failure is recorded and returned, never thrown into the scheduler.
 */

export type Trigger = "cron" | "scheduler" | "manual";
export type RunStatus = "running" | "ok" | "failed" | "skipped";

export interface CronRun {
  _id: string;
  job: string;
  trigger: Trigger;
  by: string | null;
  status: RunStatus;
  startedAt: Date;
  finishedAt: Date | null;
  durationMs: number | null;
  summary: string;
  error: string;
  expiresAt: Date;
}
const KEEP_DAYS = 30;
let indexed = false;
async function runs() {
  const c = (await getPlatformDb()).collection<CronRun>("cron_runs");
  if (!indexed) {
    indexed = true;
    await Promise.all([c.createIndex({ job: 1, startedAt: -1 }).catch(() => {}), c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch(() => {})]);
  }
  return c;
}
export interface RunOutcome {
  ok: boolean;
  skipped?: boolean;
  runId: string;
  durationMs: number;
  summary: string;
  error?: string;
  result?: unknown;
}

export async function runJob(key: string, opts: { trigger: Trigger; by?: string | null }): Promise<RunOutcome> {
  const job = CRON_BY_KEY.get(key);
  const runner = JOB_RUNNERS[key];
  const runId = randomUUID();
  const startedAt = new Date();
  if (!job || !runner) return { ok: false, runId, durationMs: 0, summary: "", error: "Unknown job." };
  const log = await runs();
  const base = { _id: runId, job: key, trigger: opts.trigger, by: opts.by ?? null, startedAt, expiresAt: new Date(startedAt.getTime() + KEEP_DAYS * 86_400_000) };

  // Paused jobs do nothing when their schedule fires; "Run now" still works. When the schedule was changed, a call from Vercel Cron (which
  // happens at the registry's times) only runs the job if the changed schedule has come due since its last run.
  if (opts.trigger !== "manual") {
    const cfg = await effectiveJob(key);
    const skip = async (summary: string): Promise<RunOutcome> => {
      await log.insertOne({ ...base, status: "skipped", finishedAt: startedAt, durationMs: 0, summary, error: "" }).catch(() => {});
      return { ok: true, skipped: true, runId, durationMs: 0, summary };
    };
    if (cfg && !cfg.enabled) return skip("Skipped: this job is paused.");
    if (cfg?.overridden && opts.trigger === "cron") {
      const due = previousRun(cfg.schedule, startedAt);
      const lastRan = await log.find({ job: key, status: { $in: ["ok", "failed", "running"] } }).sort({ startedAt: -1 }).limit(1).next();
      if (due && lastRan && lastRan.startedAt.getTime() >= due.getTime()) return skip(`Skipped: not due under its schedule (${cfg.schedule}).`);
    }
  }

  const holder = runId;
  if (!(await acquire(key, job.maxDurationSec + 60, holder))) {
    const summary = "Skipped: this job is already running.";
    await log.insertOne({ ...base, status: "skipped", finishedAt: startedAt, durationMs: 0, summary, error: "" }).catch(() => {});
    return { ok: true, skipped: true, runId, durationMs: 0, summary };
  }
  await log.insertOne({ ...base, status: "running", finishedAt: null, durationMs: null, summary: "", error: "" }).catch(() => {});
  try {
    const result = await runner();
    const { text, failed } = summarize(result);
    const durationMs = Date.now() - startedAt.getTime();
    await log.updateOne({ _id: runId }, { $set: { status: "ok", finishedAt: new Date(), durationMs, summary: text, error: failed ? `${failed} failed` : "" } }).catch(() => {});
    return { ok: true, runId, durationMs, summary: text, result };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 400);
    const durationMs = Date.now() - startedAt.getTime();
    console.error(`[cron:${key}] failed`, err);
    await log.updateOne({ _id: runId }, { $set: { status: "failed", finishedAt: new Date(), durationMs, error } }).catch(() => {});
    void alertJobFailed(job, error);
    return { ok: false, runId, durationMs, summary: "", error };
  } finally {
    await release(key, holder);
  }
}

/** The route handler of a cron URL: checks `Authorization: Bearer $CRON_SECRET`, runs the job, answers with how it went (500 when it failed, so the scheduler shows it red). */
export function cronRoute(key: string, opts: { extraSecrets?: (string | undefined)[] } = {}) {
  return async function GET(req: Request): Promise<NextResponse> {
    // Either secret opens the URL: the one saved in the Console (any scheduler) and the Vercel environment one (the only one Vercel Cron can send).
    const secrets = [await getConfig("CRON_SECRET").catch(() => null), process.env.CRON_SECRET, ...(opts.extraSecrets ?? [])].filter((s): s is string => !!s);
    const job = CRON_BY_KEY.get(key);
    const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").split(":")[0].toLowerCase();
    // The previous cron-triggered start of this job, only needed when no secret exists anywhere (see auth.ts).
    const last = secrets.length ? null : await (await runs()).find({ job: key, trigger: "cron" }).sort({ startedAt: -1 }).limit(1).next().catch(() => null);
    const auth = authorizeCron({
      bearerMatches: secrets.some((s) => hasBearer(req, s)),
      secretConfigured: secrets.length > 0,
      userAgent: req.headers.get("user-agent"),
      hostAllowed: isSaasHost(host) || isSaasAppHost(host) || host.endsWith(".vercel.app"),
      lastRunAtMs: last?.startedAt.getTime() ?? null,
      intervalMs: job ? intervalMs(job.schedule) : null,
      nowMs: Date.now(),
    });
    if (!auth.ok) return NextResponse.json({ error: auth.reason === "too-soon" ? "Too soon" : "Unauthorized" }, { status: auth.reason === "too-soon" ? 429 : 401, headers: { "Cache-Control": "no-store", ...(auth.reason === "too-soon" ? { "Retry-After": String(Math.ceil((auth.retryAfterMs ?? 0) / 1000)) } : {}) } });
    if (auth.via === "vercel-cron" && !secrets.length) console.log(`[cron] ${key} started by Vercel Cron without a CRON_SECRET (rate-limited by its interval)`);
    const out = await runJob(key, { trigger: "cron" });
    return NextResponse.json({ ok: out.ok, job: key, skipped: out.skipped ?? false, runId: out.runId, durationMs: out.durationMs, summary: out.summary, error: out.error }, { status: out.ok ? 200 : 500, headers: { "Cache-Control": "no-store" } });
  };
}
