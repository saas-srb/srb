"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { recordAudit } from "@/lib/products/viralpulse-ai/audit";
import { loadAnalytics, type AnalyticsFilters } from "@/lib/products/viralpulse-ai/metrics/queries";
import { postsToCsv } from "@/lib/products/viralpulse-ai/metrics/csv";
import { defaultMetricsDeps } from "@/lib/products/viralpulse-ai/metrics/deps";
import { syncNow } from "@/lib/products/viralpulse-ai/metrics/sync";
import { getMetricsSettings, saveMetricsSettings } from "@/lib/products/viralpulse-ai/metrics/store";
import { normalizeSettings } from "@/lib/products/viralpulse-ai/metrics/store";

const str = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 80) : undefined);

/** Reads the platform now (one account, or all), within the cooldown and the platform's own limits. */
export async function syncMetricsNowAction(accountId?: string) {
  return run(["VIEW_ANALYTICS"], async () => {
    const r = await syncNow(defaultMetricsDeps, accountId);
    if (!r.ok) throw new (await import("@/lib/products/viralpulse-ai/viewer")).SmmsInputError(r.error);
    return { message: r.message };
  });
}

/** The filtered Posts & Reels table as CSV text (the browser saves it as a file). */
export async function exportPostsCsvAction(filters: Record<string, string | undefined>) {
  return run(["VIEW_ANALYTICS"], async () => {
    const f: AnalyticsFilters = { from: str(filters.from), to: str(filters.to), platform: str(filters.platform), account: str(filters.account), campaign: str(filters.campaign), contentType: str(filters.contentType), creativeSource: str(filters.creativeSource) };
    const d = await loadAnalytics(f);
    return { csv: postsToCsv(d.posts), filename: `viralpulse-posts-${d.range.from}-to-${d.range.to}.csv`, rows: d.posts.length };
  });
}

export async function saveMetricsSettingsAction(input: { retentionDays: number; recentPostDays: number; olderPostDays: number; youtubeDailyUnitCap: number; xEnabled: boolean; xMaxPostsPerRun: number; xMinHoursBetween: number }) {
  return run(["MANAGE_INTEGRATIONS"], async (v) => {
    const before = await getMetricsSettings();
    const next = normalizeSettings({ ...before, retentionDays: input.retentionDays, recentPostDays: input.recentPostDays, olderPostDays: input.olderPostDays, youtubeDailyUnitCap: input.youtubeDailyUnitCap, x: { enabled: input.xEnabled, maxPostsPerRun: input.xMaxPostsPerRun, minHoursBetween: input.xMinHoursBetween } });
    await saveMetricsSettings(next, v.userId);
    await recordAudit({ actorId: v.userId, actorEmail: v.email, action: "settings", entity: "settings", entityId: "metrics", entityLabel: "Analytics sync", summary: `Analytics sync settings changed: keep history ${next.retentionDays} days, X reads ${next.x.enabled ? "on" : "off"}` });
    return {};
  });
}
