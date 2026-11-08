import { cronRoute } from "@/lib/cron/runner";

/**
 * Scheduled job "viralpulse-publisher" (every 5 minutes): see `src/lib/cron/registry.ts` and `src/lib/cron/jobs.ts`.
 * Vercel Cron calls it with `Authorization: Bearer $CRON_SECRET`; without that secret it refuses to run.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = cronRoute("viralpulse-publisher");
