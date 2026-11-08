import { cronRoute } from "@/lib/cron/runner";

/**
 * Scheduled job "trials": see `src/lib/cron/registry.ts` for what it does and when it runs, and `src/lib/cron/jobs.ts` for the code.
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`; without that secret it refuses to run.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = cronRoute("trials");
