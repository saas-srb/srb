import "server-only";
import { listJobStatus } from "@/lib/cron/status";

/**
 * What a company may see about the platform's scheduled jobs: when each runs, when it last ran, whether it is on schedule, and what it
 * does. No errors, counts or internals from other companies: the run history is shared by everyone, so only the job's own timing is shown.
 */
export type CompanyJobState = "on_schedule" | "delayed" | "paused" | "not_yet";

export interface CompanyJobView {
  key: string;
  name: string;
  description: string;
  product: string;
  /** "each company": it runs once for your workspace among the others; "platform": it is SelfRun's own (billing, domains, app builds). */
  scope: "platform" | "each company";
  schedule: string;
  when: string;
  nextRunAt: string | null;
  lastRanAt: string | null;
  state: CompanyJobState;
  alsoRunsOn: string | null;
  configure: { label: string; href: string } | null;
  frequent: boolean;
}

const STATE: Record<string, CompanyJobState> = { healthy: "on_schedule", running: "on_schedule", failing: "delayed", overdue: "delayed", paused: "paused", waiting: "not_yet" };

export async function listCompanyJobs(): Promise<CompanyJobView[]> {
  return (await listJobStatus()).map((j) => ({
    key: j.key, name: j.name, description: j.description, product: j.product, scope: j.scope, schedule: j.effectiveSchedule, when: j.when, nextRunAt: j.nextRunAt,
    lastRanAt: j.lastOkAt, state: STATE[j.health] ?? "not_yet", alsoRunsOn: j.alsoRunsOn ?? null, configure: j.configure ?? null, frequent: !!j.frequent,
  }));
}
