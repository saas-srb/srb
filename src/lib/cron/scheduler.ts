import "server-only";
import { CRON_JOBS } from "@/lib/cron/registry";
import { effectiveJobs } from "@/lib/cron/config";
import { firesAt } from "@/lib/cron/schedule";
import { runJob } from "@/lib/cron/runner";

/**
 * The in-app scheduler, for deployments that are not on Vercel (a server or a container: set RUN_SCHEDULER=1 on ONE instance). Every
 * 20 seconds it starts the jobs whose schedule falls in the current minute (the registry's times, or the ones set in the Platform Console, and
 * not the ones paused there): no HTTP call, no secret. The lock
 * in `runJob` means a second instance (or Vercel Cron, if it is still on) can never run the same job at the same time.
 */
const g = globalThis as unknown as { __cronScheduler?: ReturnType<typeof setInterval>; __cronLast?: Map<string, number> };

export function startScheduler(): void {
  if (g.__cronScheduler) return;
  const last = (g.__cronLast ??= new Map());
  const tick = async () => {
    const now = new Date();
    const minute = Math.floor(now.getTime() / 60_000);
    const cfg = await effectiveJobs(); // the schedules and pauses set in the Platform Console
    for (const job of CRON_JOBS) {
      const c = cfg.get(job.key);
      if (last.get(job.key) === minute || !c?.enabled || !firesAt(c.schedule, now)) continue;
      last.set(job.key, minute);
      void runJob(job.key, { trigger: "scheduler" }).catch((err) => console.error(`[scheduler] ${job.key} could not start`, err));
    }
  };
  g.__cronScheduler = setInterval(() => void tick().catch((err) => console.error("[scheduler] tick failed", err)), 20_000);
  g.__cronScheduler.unref?.();
  console.log(`[scheduler] running ${CRON_JOBS.length} jobs from the registry (UTC)`);
}
