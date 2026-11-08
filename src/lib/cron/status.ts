import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { CRON_JOBS, type CronJob } from "@/lib/cron/registry";
import { describeCron, intervalMs, nextRun, previousRun } from "@/lib/cron/schedule";
import type { CronRun } from "@/lib/cron/runner";
import { alertEmails, effectiveJobs } from "@/lib/cron/config";
import { getConfig } from "@/lib/platform/config/store";

/**
 * What the Scheduled jobs page shows: each job from the registry with its last runs and a health reading.
 *   running  — started a moment ago
 *   failing  — its last finished run failed
 *   overdue  — its schedule says it should have run by now and nothing did (scheduler off, wrong path, secret missing)
 *   waiting  — it has not run yet in this database
 *   healthy  — it ran when it was due
 */
export type JobHealth = "running" | "failing" | "overdue" | "waiting" | "healthy" | "paused";

export interface RunView {
  id: string;
  trigger: string;
  by: string | null;
  status: string;
  startedAt: string;
  durationMs: number | null;
  summary: string;
  error: string;
}
export interface JobView extends CronJob {
  /** The schedule in force (the registry's, or the one set in the Console). */
  effectiveSchedule: string;
  overridden: boolean;
  enabled: boolean;
  note: string;
  when: string;
  nextRunAt: string | null;
  health: JobHealth;
  healthNote: string;
  last: RunView | null;
  lastOkAt: string | null;
  runs24h: number;
  failures24h: number;
}

const view = (r: CronRun): RunView => ({ id: r._id, trigger: r.trigger, by: r.by, status: r.status, startedAt: r.startedAt.toISOString(), durationMs: r.durationMs, summary: r.summary, error: r.error });

export function healthOf(job: CronJob, last: CronRun | null, lastDone: CronRun | null, now: Date, enabled = true): { health: JobHealth; note: string } {
  if (!enabled) return { health: "paused", note: "Paused: skipped when its schedule fires." };
  if (last?.status === "running" && now.getTime() - last.startedAt.getTime() < (job.maxDurationSec + 60) * 1000) return { health: "running", note: "Running now." };
  if (lastDone?.status === "failed") return { health: "failing", note: lastDone.error || "The last run failed." };
  const due = previousRun(job.schedule, now);
  const gap = intervalMs(job.schedule, now) ?? 86_400_000;
  const grace = Math.min(Math.max(15 * 60_000, gap * 0.25), 2 * 3_600_000); // a quarter of the gap, between 15 minutes and 2 hours
  if (due && now.getTime() - due.getTime() > grace) {
    const ranSince = lastDone && lastDone.startedAt.getTime() >= due.getTime() - grace;
    if (!ranSince) return lastDone ? { health: "overdue", note: `It should have run at ${due.toISOString().slice(11, 16)} UTC and did not.` } : { health: "waiting", note: "It has not run yet." };
  }
  return lastDone ? { health: "healthy", note: "Ran when it was due." } : { health: "waiting", note: "It has not run yet." };
}

export async function listJobStatus(now = new Date()): Promise<JobView[]> {
  const col = (await getPlatformDb()).collection<CronRun>("cron_runs");
  const since = new Date(now.getTime() - 86_400_000);
  const out: JobView[] = [];
  const cfg = await effectiveJobs();
  for (const base of CRON_JOBS) {
    const c = cfg.get(base.key)!;
    // Health and next run follow the schedule in force.
    const job = { ...base, schedule: c.schedule };
    const [last, lastDone, lastOk, recent] = await Promise.all([
      col.find({ job: job.key }).sort({ startedAt: -1 }).limit(1).next(),
      col.find({ job: job.key, status: { $in: ["ok", "failed"] } }).sort({ startedAt: -1 }).limit(1).next(),
      col.find({ job: job.key, status: "ok" }).sort({ startedAt: -1 }).limit(1).next(),
      col.aggregate<{ _id: string; n: number }>([{ $match: { job: job.key, startedAt: { $gte: since }, status: { $in: ["ok", "failed"] } } }, { $group: { _id: "$status", n: { $sum: 1 } } }]).toArray(),
    ]);
    const { health, note } = healthOf(job, last, lastDone, now, c.enabled);
    out.push({
      ...base, effectiveSchedule: c.schedule, overridden: c.overridden, enabled: c.enabled, note: c.note, when: describeCron(c.schedule), nextRunAt: c.enabled ? (nextRun(c.schedule, now)?.toISOString() ?? null) : null, health, healthNote: note, last: last ? view(last) : null, lastOkAt: lastOk?.startedAt.toISOString() ?? null,
      runs24h: recent.reduce((n, r) => n + r.n, 0), failures24h: recent.find((r) => r._id === "failed")?.n ?? 0,
    });
  }
  return out;
}

export { alertEmails };

export async function jobHistory(key: string, limit = 20): Promise<RunView[]> {
  if (!CRON_JOBS.some((j) => j.key === key)) return [];
  return (await (await getPlatformDb()).collection<CronRun>("cron_runs").find({ job: key }).sort({ startedAt: -1 }).limit(limit).toArray()).map(view);
}

/** How scheduled jobs get started on this server. */
export async function schedulerMode(): Promise<{ mode: "vercel" | "in-app" | "none"; label: string; cronSecretSet: boolean; cronSecretOnVercel: boolean }> {
  const cronSecretOnVercel = !!process.env.CRON_SECRET;
  const cronSecretSet = cronSecretOnVercel || !!(await getConfig("CRON_SECRET").catch(() => null));
  if (process.env.VERCEL) return { mode: "vercel", label: "Vercel Cron (from vercel.json)", cronSecretSet, cronSecretOnVercel };
  if (process.env.RUN_SCHEDULER === "1") return { mode: "in-app", label: "The in-app scheduler (RUN_SCHEDULER=1)", cronSecretSet, cronSecretOnVercel };
  return { mode: "none", label: "Nothing on this server starts them on a schedule", cronSecretSet, cronSecretOnVercel };
}
