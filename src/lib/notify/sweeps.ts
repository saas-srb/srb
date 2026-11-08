import "server-only";
import { currentCompanyIdOrNull } from "@/lib/platform/tenancy/context";
import { fmsEvents } from "@/lib/notify/triggers/fms";
import { lmsEvents } from "@/lib/notify/triggers/lms";
import { overdueInvoices, invoicesDueWithin } from "@/lib/products/cashflow-ai/receivables";
import { listFilings } from "@/lib/products/cashflow-ai/compliance/filings";
import { filingState } from "@/lib/products/cashflow-ai/compliance/filings-core";
import { getPlan, loadWork } from "@/lib/products/cashflow-ai/work/store";
import { sortInstances, summarise } from "@/lib/products/cashflow-ai/work/engine";
import { istToday } from "@/lib/products/cashflow-ai/accrual/core";
import { overdueBills } from "@/lib/products/cashflow-ai/payables";
import { getStaleLeadsSummary } from "@/lib/leads";
import { getStaleApplicationsSummary } from "@/lib/career-applications";
import { lpmsEvents } from "@/lib/notify/triggers/lpms";
import { getDb } from "@/lib/mongodb";
import { notifyPanel } from "@/lib/notify";
import { day, plural, short, today } from "@/lib/notify/triggers/format";
import { runNotificationSweep as runHrmsSweep } from "@/lib/products/talentos/notifications";
import { runDeadlineSweep as runPmsSweep } from "@/lib/products/sprintos/notifications";
import { runPrmsSweep } from "@/lib/products/spendiq/notifications";
import { runTmsSweep } from "@/lib/products/cohort-ai/notifications";
import { forEachCompany } from "@/lib/platform/tenancy/context";

/**
 * Time-based notifications ("this is overdue", "that is about to expire"). A product runs its sweep when someone opens it; the sweep is
 * throttled per company (here, in memory, plus every notification carries a per-day dedupe key — so even if two servers sweep at once,
 * a person is told once per day, never twice).
 */
const last = new Map<string, number>();
async function throttled(key: string, everyMinutes: number, fn: () => Promise<void>): Promise<void> {
  const company = (await currentCompanyIdOrNull()) ?? "none";
  const k = `${company}:${key}`;
  const now = Date.now();
  if (now - (last.get(k) ?? 0) < everyMinutes * 60_000) return;
  last.set(k, now);
  try {
    await fn();
  } catch (err) {
    console.error(`[notify] sweep ${key} failed`, err instanceof Error ? err.message : err);
  }
}

export const runFmsSweep = () =>
  throttled("fms", 60, async () => {
    const [overdue, soon, bills] = await Promise.all([overdueInvoices(), invoicesDueWithin(3), overdueBills()]);
    await fmsEvents.receivablesDigest({ ...overdue }, { ...soon });
    await fmsEvents.payablesDigest(bills);
    const todayStr = new Date().toISOString().slice(0, 10);
    const filings = (await listFilings()).map((f) => ({ name: f.form ? `${f.name} (${f.form})` : f.name, state: filingState(f, todayStr) }));
    const pick = (st: string) => filings.filter((f) => f.state === st).map((f) => f.name);
    await fmsEvents.filingsDigest({ count: pick("overdue").length, names: pick("overdue") }, { count: pick("due_soon").length, names: pick("due_soon") });
    // "My work": only once the company has switched the plan on
    if (await getPlan()) {
      const { instances } = await loadWork(istToday());
      const sum = summarise(instances);
      const sorted = sortInstances(instances);
      const titlesOf = (state: string) => sorted.filter((i) => i.state === state).map((i) => i.task.title);
      await fmsEvents.workDigest({ overdue: sum.overdue, dueToday: sum.dueToday, overdueTitles: titlesOf("overdue"), dueTodayTitles: titlesOf("due_today"), day: istToday() });
    }
  });

export const runLmsSweep = () =>
  throttled("lms", 60, async () => {
    const [leads, apps] = await Promise.all([getStaleLeadsSummary(), getStaleApplicationsSummary()]);
    await lmsEvents.staleDigest(
      { count: leads.count, names: leads.items.slice(0, 3).map((l) => String((l as { name?: string }).name ?? "")).filter(Boolean) },
      { count: apps.count, names: apps.items.slice(0, 3).map((a) => String((a as { name?: string }).name ?? "")).filter(Boolean) },
    );
  });

export const runLpmsSweep = () => throttled("lpms", 60, () => lpmsEvents.expiryDigest());

/** Website (CMS): campaigns about to end, coupons about to expire or used up, referrals waiting for a decision. */
export const runCmsSweep = () =>
  throttled("cms", 60, async () => {
    const db = await getDb();
    const now = new Date();
    const in2 = new Date(now.getTime() + 2 * 86_400_000);
    const in3 = new Date(now.getTime() + 3 * 86_400_000);
    const campaigns = await db.collection<{ _id: string; name: string; endDate: Date }>("offer_campaigns").find({ status: "active", deletedAt: null, endDate: { $gte: now, $lte: in2 } } as never).limit(20).toArray();
    for (const c of campaigns) await notifyPanel("cms", { type: "cms_campaign_ending", title: `Offer campaign ending: ${short(c.name, 50)}`, body: `Ends ${day(c.endDate)}. Extend it or let it close.`, link: `/sitecraft-ai/offers/${c._id}`, priority: "high", dedupeKey: `cms-camp-end:${c._id}:${day(c.endDate)}` }, { level: "staff" });
    const coupons = await db.collection<{ _id: string; code: string; endDate: Date; usageLimit?: number; usageCount: number }>("coupons").find({ isActive: true, deletedAt: null, $or: [{ endDate: { $gte: now, $lte: in3 } }, { usageLimit: { $gt: 0 } }] } as never).limit(100).toArray();
    for (const c of coupons) {
      if (c.usageLimit && c.usageCount >= c.usageLimit) await notifyPanel("cms", { type: "cms_coupon_used_up", title: `Coupon ${c.code} is fully used`, body: `All ${c.usageLimit} uses are gone.`, link: "/sitecraft-ai/offers/coupons", dedupeKey: `cms-coupon-full:${c._id}` }, { level: "staff" });
      else if (c.endDate && new Date(c.endDate) <= in3) await notifyPanel("cms", { type: "cms_coupon_expiring", title: `Coupon ${c.code} expires soon`, body: `Valid until ${day(c.endDate)}.`, link: "/sitecraft-ai/offers/coupons", dedupeKey: `cms-coupon-exp:${c._id}:${day(c.endDate)}` }, { level: "staff" });
    }
    const waiting = await db.collection("referrals").countDocuments({ status: { $in: ["QUALIFIED", "FRAUD_HOLD"] } });
    if (waiting > 0) await notifyPanel("cms", { type: "cms_referrals_waiting", title: `${plural(waiting, "referral")} waiting for a decision`, body: "Approve or reject them so rewards are paid correctly.", link: "/sitecraft-ai/wallet/referrals", dedupeKey: `cms-referrals:${today()}` }, { level: "admin" });
  });

/** Everything time-based, for every company — the daily cron. Each sweep dedupes per day, so a repeat run is harmless. */
export async function runAllSweeps() {
  return forEachCompany(async () => {
    const out: Record<string, string> = {};
    const jobs: [string, () => Promise<unknown>][] = [
      ["hrms", runHrmsSweep], ["pms", runPmsSweep], ["prms", runPrmsSweep], ["tms", runTmsSweep],
      ["fms", async () => { const [o, s, b] = await Promise.all([overdueInvoices(), invoicesDueWithin(3), overdueBills()]); await fmsEvents.receivablesDigest(o, s); await fmsEvents.payablesDigest(b); }],
      ["lms", async () => { const [l, a] = await Promise.all([getStaleLeadsSummary(), getStaleApplicationsSummary()]); await lmsEvents.staleDigest({ count: l.count, names: l.items.slice(0, 3).map((x) => String((x as { name?: string }).name ?? "")).filter(Boolean) }, { count: a.count, names: a.items.slice(0, 3).map((x) => String((x as { name?: string }).name ?? "")).filter(Boolean) }); }],
      ["lpms", () => lpmsEvents.expiryDigest()],
      ["announcements", async () => { await (await import("@/lib/notify/center/announcements")).dispatchDue(); }],
    ];
    for (const [name, fn] of jobs) {
      try { await fn(); out[name] = "ok"; } catch (err) { out[name] = err instanceof Error ? err.message.slice(0, 120) : "failed"; }
    }
    try { await runCmsSweepNow(); out.cms = "ok"; } catch (err) { out.cms = err instanceof Error ? err.message.slice(0, 120) : "failed"; }
    return out;
  });
}
const runCmsSweepNow = async () => { last.clear(); await runCmsSweep(); };
