import "server-only";
import { forEachCompany } from "@/lib/platform/tenancy/context";

/**
 * What each scheduled job does, by registry key (`registry.ts`). Imported lazily so a job only loads the code it needs. The routes, the
 * Platform Console's "Run now" and the in-app scheduler all come here, so a job behaves the same however it is started.
 */
export const JOB_RUNNERS: Record<string, () => Promise<unknown>> = {
  backups: async () => (await import("@/lib/products/commandos/data-lifecycle")).runLifecycleJobs(),
  "wallet-expiry": async () => forEachCompany(async () => (await import("@/lib/wallet/expiry")).runExpirySweep()),
  playbook: async () => forEachCompany(async () => (await import("@/lib/products/playbook-ai/reminders")).runSopReminders()),
  rankmax: async () => forEachCompany(async () => (await import("@/lib/products/rankmax-ai/housekeeping")).runSeoHousekeeping()),
  cybervault: async () => forEachCompany(async () => (await import("@/lib/products/cybervault/alerts")).runExpirySweep()),
  "viralpulse-publisher": async () => forEachCompany(async () => (await import("@/lib/products/viralpulse-ai/publishing")).runDueSweep()),
  "viralpulse-ads": async () => forEachCompany(async () => (await import("@/lib/products/viralpulse-ai/ads-platforms/ads-sync")).runAdsSync()),
  "viralpulse-metrics": async () =>
    forEachCompany(async () => {
      const [{ runMetricsSync }, { defaultMetricsDeps }] = await Promise.all([import("@/lib/products/viralpulse-ai/metrics/sync"), import("@/lib/products/viralpulse-ai/metrics/deps")]);
      return runMetricsSync(defaultMetricsDeps);
    }),
  "viralpulse-accounts": async () => forEachCompany(async () => (await import("@/lib/products/viralpulse-ai/accounts/service")).runAccountsSweep()),
  "viralpulse-ugc": async () => forEachCompany(async () => (await import("@/lib/products/viralpulse-ai/ugc/api")).runUgcCron()),
  evaliq: async () =>
    forEachCompany(async () => {
      await (await import("@/lib/products/evaliq/db")).ensureOtsIndexes();
      return (await import("@/lib/products/evaliq/sweep")).runSweep();
    }),
  domains: async () => (await import("@/lib/platform/domains/custom")).recheckPendingDomains(),
  trials: async () => (await import("@/lib/platform/billing/trials")).runTrialSweep(new Date()),
  subscriptions: async () => (await import("@/lib/platform/billing/subscriptions")).runDunningSweep(),
  notifications: async () => (await import("@/lib/notify/sweeps")).runAllSweeps(),
  "agentos-calls": async () => forEachCompany(async () => (await import("@/lib/products/agentos/calls/engine")).runCallsSweep()),
  meetings: async () => forEachCompany(async () => (await import("@/lib/dealflow-ai/meetings/sweep")).runMeetingsSweep()),
  apps: async () => (await import("@/lib/apps/enqueue")).runBuildCron(),
};

/** A short, log-sized reading of what a job returned: per-company runs become "12 companies, 1 failed". */
export function summarize(result: unknown): { text: string; failed: number } {
  if (Array.isArray(result) && result.every((r) => r && typeof r === "object" && "companyId" in r && "ok" in r)) {
    const runs = result as { ok: boolean; error?: string }[];
    const bad = runs.filter((r) => !r.ok);
    return { failed: bad.length, text: `${runs.length} ${runs.length === 1 ? "company" : "companies"}${bad.length ? `, ${bad.length} failed (${bad[0].error?.slice(0, 120) ?? "error"})` : ""}` };
  }
  const text = typeof result === "string" ? result : JSON.stringify(result ?? "done");
  return { failed: 0, text: text.length > 400 ? `${text.slice(0, 397)}…` : text };
}
