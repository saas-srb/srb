import "server-only";
import { getSettings } from "@/lib/products/rankmax-ai/settings";
import { runCrawl, latestCompletedRun, CrawlBusyError } from "@/lib/products/rankmax-ai/crawler";
import { syncSearchConsole } from "@/lib/products/rankmax-ai/integrations/gsc";
import { syncAnalytics } from "@/lib/products/rankmax-ai/integrations/ga4";
import { movers } from "@/lib/products/rankmax-ai/rankings";
import { allActiveKeywords } from "@/lib/products/rankmax-ai/keywords";
import { verifyBacklinks } from "@/lib/products/rankmax-ai/backlinks";
import { audienceUserIds } from "@/lib/notify/audience";
import { notifySeoUsers } from "@/lib/products/rankmax-ai/notifications";

/**
 * Daily SEO housekeeping for the CURRENT company: Search Console + Analytics sync when enabled, the scheduled website audit (daily or
 * weekly per Settings), a weekly backlink re-verification on Mondays and the "keywords dropped 5+ places" alert. A company that hasn't
 * enabled a schedule in /rankmax-ai/settings is a no-op: new companies default to no scheduled audit, sync or backlink check.
 */
export async function runSeoHousekeeping(): Promise<Record<string, unknown>> {
  const s = await getSettings();
  const out: Record<string, unknown> = {};
  const attempt = async (key: string, fn: () => Promise<unknown>) => {
    try {
      out[key] = await fn();
    } catch (err) {
      out[key] = { error: err instanceof Error ? err.message : "failed" };
    }
  };
  if (s.schedule.syncSearchData && s.integrations.gsc.enabled) await attempt("gsc", syncSearchConsole);
  if (s.schedule.syncSearchData && s.integrations.ga4.enabled) await attempt("ga4", syncAnalytics);

  const last = await latestCompletedRun();
  const ageDays = last ? (Date.now() - last.startedAt.getTime()) / 86400000 : Infinity;
  const due = (s.schedule.auditFrequency === "daily" && ageDays >= 0.9) || (s.schedule.auditFrequency === "weekly" && ageDays >= 6.9);
  if (due) {
    await attempt("audit", async () => {
      try {
        const run = await runCrawl({ trigger: "schedule", actorId: null, actorEmail: null });
        const team = await audienceUserIds("seo", "admin");
        await notifySeoUsers(team, run.status === "completed"
          ? { type: "seo_audit_completed", title: `Scheduled audit finished — score ${run.scores?.overall ?? "—"}`, body: `${run.pagesCrawled} pages checked.`, link: "/rankmax-ai/audits", dedupeKey: `seo-audit:${run._id}` }
          : { type: "seo_audit_failed", title: "Scheduled website audit did not finish", body: "Open SEO → Audits to see why.", link: "/rankmax-ai/audits", dedupeKey: `seo-audit:${run._id}` });
        return { runId: run._id, status: run.status, pages: run.pagesCrawled };
      } catch (err) {
        if (err instanceof CrawlBusyError) return { skipped: "audit already running" };
        throw err;
      }
    });
  }
  if (s.schedule.verifyBacklinks && new Date().getDay() === 1) await attempt("backlinks", () => verifyBacklinks());
  // Keywords that lost 5+ places over the last week → tell the SEO team once a day.
  await attempt("rankingDrops", async () => {
    const { dropped } = await movers(await allActiveKeywords(), 7);
    const big = dropped.filter((m) => m.change <= -5).slice(0, 5);
    if (big.length === 0) return { dropped: 0 };
    await notifySeoUsers(await audienceUserIds("seo", "admin"), { type: "seo_ranking_drop", title: `${big.length} keyword${big.length === 1 ? "" : "s"} dropped 5+ places this week`, body: big.map((m) => `${m.keyword.keyword}: ${m.from ?? "–"} → ${m.to ?? "–"}`).join("; ").slice(0, 200), link: "/rankmax-ai/keywords", dedupeKey: `seo-drop:${new Date().toISOString().slice(0, 10)}` });
    return { dropped: big.length };
  });
  return out;
}
