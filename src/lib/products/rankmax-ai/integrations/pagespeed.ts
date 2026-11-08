import "server-only";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";
import { COLLECTIONS, seoCollection } from "@/lib/products/rankmax-ai/db";
import { getSettings, integrationEnv } from "@/lib/products/rankmax-ai/settings";
import { reconcileIssues, type IssueFinding } from "@/lib/products/rankmax-ai/issues";
import { mapLimit } from "@/lib/products/rankmax-ai/fetch";
import type { PagePerformance, SeoPage } from "@/lib/products/rankmax-ai/types";

/**
 * PageSpeed Insights adapter: Lighthouse lab metrics (LCP, CLS, TBT, FCP,
 * Speed Index, performance score) plus Google's real-user (CrUX) category
 * when the URL has enough traffic. Works without a key at low volume; set
 * PAGESPEED_API_KEY for regular use. Always tests the PUBLIC production URL,
 * because Google's servers can't reach a local/staging origin.
 */

const LIMITS = {
  lcpMs: { good: 2500, poor: 4000, label: "LCP" },
  cls: { good: 0.1, poor: 0.25, label: "CLS" },
  tbtMs: { good: 200, poor: 600, label: "TBT" },
} as const;

async function runPsi(url: string, strategy: "mobile" | "desktop"): Promise<PagePerformance> {
  const key = (await integrationEnv()).pagespeedKey;
  const qs = new URLSearchParams({ url, strategy, category: "performance" });
  if (key) qs.set("key", key);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, { signal: controller.signal, cache: "no-store" });
    const data = (await res.json()) as {
      error?: { message?: string };
      loadingExperience?: { overall_category?: string };
      lighthouseResult?: { categories?: { performance?: { score?: number | null } }; audits?: Record<string, { numericValue?: number }> };
    };
    if (!res.ok) throw new Error(data.error?.message ?? `HTTP ${res.status}`);
    const a = data.lighthouseResult?.audits ?? {};
    const n = (k: string) => (typeof a[k]?.numericValue === "number" ? Math.round((a[k].numericValue as number) * (k === "cumulative-layout-shift" ? 1000 : 1)) / (k === "cumulative-layout-shift" ? 1000 : 1) : null);
    const score = data.lighthouseResult?.categories?.performance?.score;
    return {
      strategy,
      score: typeof score === "number" ? Math.round(score * 100) : null,
      lcpMs: n("largest-contentful-paint"),
      cls: n("cumulative-layout-shift"),
      tbtMs: n("total-blocking-time"),
      fcpMs: n("first-contentful-paint"),
      speedIndexMs: n("speed-index"),
      fieldCategory: data.loadingExperience?.overall_category ?? null,
      checkedAt: new Date(),
      error: null,
    };
  } catch (err) {
    return { strategy, score: null, lcpMs: null, cls: null, tbtMs: null, fcpMs: null, speedIndexMs: null, fieldCategory: null, checkedAt: new Date(), error: controller.signal.aborted ? "Timed out" : err instanceof Error ? err.message : "Failed" };
  } finally {
    clearTimeout(timer);
  }
}

export function cwvVerdict(p: PagePerformance): { level: "good" | "needs" | "poor" | null; details: string[] } {
  if (p.error || p.score === null) return { level: null, details: [] };
  const details: string[] = [];
  let level: "good" | "needs" | "poor" = "good";
  for (const [key, lim] of Object.entries(LIMITS) as [keyof typeof LIMITS, (typeof LIMITS)[keyof typeof LIMITS]][]) {
    const v = p[key];
    if (v === null) continue;
    const fmt = key === "cls" ? String(v) : `${v} ms`;
    if (v > lim.poor) {
      level = "poor";
      details.push(`${lim.label} ${fmt} (poor > ${key === "cls" ? lim.poor : `${lim.poor} ms`})`);
    } else if (v > lim.good) {
      if (level === "good") level = "needs";
      details.push(`${lim.label} ${fmt} (good ≤ ${key === "cls" ? lim.good : `${lim.good} ms`})`);
    }
  }
  if (p.fieldCategory === "SLOW") {
    level = "poor";
    details.push("Real-user (CrUX) experience: SLOW");
  }
  details.push(`Performance score ${p.score}`);
  return { level, details };
}

/** Tests the given pages (max 25 per call) and reconciles their Core Web Vitals issues. */
export async function runPageSpeed(paths: string[]): Promise<{ checked: number; failed: number; errors: string[] }> {
  const s = await getSettings();
  const origin = /localhost|127\.0\.0\.1|\.local\b/.test(s.siteOrigin) ? await companySiteUrl() : s.siteOrigin;
  const pages = await seoCollection<SeoPage>(COLLECTIONS.pages);
  const findings: IssueFinding[] = [];
  const errors: string[] = [];
  const list = paths.slice(0, 25);
  const results = await mapLimit(list, 3, async (path) => {
    const perf = await runPsi(`${origin}${path}`, s.integrations.psi.strategy);
    await pages.updateOne({ path }, { $set: { performance: perf } });
    if (perf.error) {
      if (errors.length < 5) errors.push(`${path}: ${perf.error}`);
      return false;
    }
    const v = cwvVerdict(perf);
    if (v.level === "poor") findings.push({ path, checkId: "cwv_poor", details: v.details });
    else if (v.level === "needs") findings.push({ path, checkId: "cwv_needs_improvement", details: v.details });
    return true;
  });
  const ok = list.filter((_, i) => results[i]);
  await reconcileIssues(findings, { source: "pagespeed", runId: null, paths: ok, checkIds: ["cwv_poor", "cwv_needs_improvement"] });
  return { checked: ok.length, failed: list.length - ok.length, errors };
}
