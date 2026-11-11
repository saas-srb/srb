/**
 * Who may start a scheduled job (pure). Vercel Cron only sends `Authorization: Bearer $CRON_SECRET` when a CRON_SECRET environment
 * variable exists. A deployment with no secret anywhere (neither in the environment nor saved in the Console) still has to run its jobs,
 * so Vercel's own call (user agent `vercel-cron/1.0`, on the platform's host) is accepted, but only when the job has not run for at
 * least half its interval: a spoofed call can therefore never cause extra runs or load. The database lease still applies on top.
 */

export const VERCEL_CRON_UA = /^vercel-cron\/\d/i;
/** A job may be started this early, as a share of its interval. */
export const MIN_INTERVAL_SHARE = 0.5;

export type CronAuth = { ok: true; via: "bearer" | "vercel-cron" } | { ok: false; reason: "unauthorized" | "too-soon"; retryAfterMs?: number };

export function authorizeCron(input: {
  bearerMatches: boolean;
  secretConfigured: boolean;
  userAgent: string | null;
  hostAllowed: boolean;
  lastRunAtMs: number | null;
  intervalMs: number | null;
  nowMs: number;
}): CronAuth {
  if (input.bearerMatches) return { ok: true, via: "bearer" };
  // With a secret configured, only the secret opens the URL.
  if (input.secretConfigured) return { ok: false, reason: "unauthorized" };
  if (!input.userAgent || !VERCEL_CRON_UA.test(input.userAgent) || !input.hostAllowed) return { ok: false, reason: "unauthorized" };
  const interval = input.intervalMs ?? 86_400_000;
  if (input.lastRunAtMs !== null) {
    const wait = input.lastRunAtMs + interval * MIN_INTERVAL_SHARE - input.nowMs;
    if (wait > 0) return { ok: false, reason: "too-soon", retryAfterMs: wait };
  }
  return { ok: true, via: "vercel-cron" };
}
