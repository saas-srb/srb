import "server-only";
import { COLLECTIONS, smmsCollection } from "@/lib/products/viralpulse-ai/db";
import { currencyDigits } from "./types";
import type { MetaCampaignDraft, MinorMoney } from "./meta/draft";

/**
 * Spend guard. Money is in the ad account's currency minor unit. Nothing starts spending unless the company has set a limit for that
 * currency (or an admin has explicitly allowed uncapped launches), the launch fits inside it, and the kill switch is off.
 * Meta can spend up to 25% above a daily budget on a single day; the guard therefore counts 125% of every daily budget against the daily cap
 * (Meta's help centre statement; the Marketing API reference does not repeat it, so this is a conservative assumption, stated to the approver).
 */

export const GUARD_DAILY_OVERSHOOT = 1.25;

/** "1,500.50 USD" / "1,500 JPY": a minor amount in the currency's own number of decimals (not always 2). */
export function formatMinorPlain(minor: number, currency: string): string {
  const d = currencyDigits(currency);
  return `${(minor / 10 ** d).toLocaleString("en", { minimumFractionDigits: d, maximumFractionDigits: d })} ${currency}`;
}
const DAY_MS = 86_400_000;

export interface CurrencyCaps {
  /** Largest daily budget one launch may have. */
  maxDailyPerLaunchMinor: number | null;
  /** Largest total (lifetime or daily x days) one launch may commit. */
  maxTotalPerLaunchMinor: number | null;
  /** Sum of daily budgets of everything active at once. */
  companyDailyCapMinor: number | null;
  /** Sum of 30-day commitments of everything active. */
  companyMonthlyCapMinor: number | null;
  /** A launch above this needs an approver who did not create it (when `requireSecondApprover`). null = NO threshold: every launch needs a different approver. A company relaxes this on purpose, by setting a threshold or switching `requireSecondApprover` off; both are limits changes (audit-logged, MANAGE_AD_LIMITS). */
  approvalThresholdMinor: number | null;
}
export interface GuardSettings {
  _id: "ads-guard";
  perCurrency: Record<string, CurrencyCaps>;
  requireSecondApprover: boolean;
  /** Admin choice: allow activation in a currency that has no caps. */
  allowUncapped: boolean;
  killSwitch: boolean;
  killSwitchBy: string | null;
  killSwitchAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export const defaultGuard = (): GuardSettings => ({ _id: "ads-guard", perCurrency: {}, requireSecondApprover: true, allowUncapped: false, killSwitch: false, killSwitchBy: null, killSwitchAt: null, updatedAt: new Date(0), updatedBy: null });
const col = () => smmsCollection<GuardSettings>(COLLECTIONS.settings);
const pos = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);

export async function getGuard(): Promise<GuardSettings> {
  const d = await (await col()).findOne({ _id: "ads-guard" });
  return d ? { ...defaultGuard(), ...d } : defaultGuard();
}

export function normalizeCaps(v: Partial<CurrencyCaps> | undefined): CurrencyCaps {
  return { maxDailyPerLaunchMinor: pos(v?.maxDailyPerLaunchMinor), maxTotalPerLaunchMinor: pos(v?.maxTotalPerLaunchMinor), companyDailyCapMinor: pos(v?.companyDailyCapMinor), companyMonthlyCapMinor: pos(v?.companyMonthlyCapMinor), approvalThresholdMinor: pos(v?.approvalThresholdMinor) };
}

export async function saveGuard(patch: { perCurrency?: Record<string, Partial<CurrencyCaps>>; requireSecondApprover?: boolean; allowUncapped?: boolean }, actorId: string): Promise<GuardSettings> {
  const cur = await getGuard();
  const per = { ...cur.perCurrency };
  for (const [c, caps] of Object.entries(patch.perCurrency ?? {})) if (/^[A-Z]{3}$/.test(c)) per[c] = normalizeCaps(caps);
  const next: GuardSettings = { ...cur, perCurrency: per, requireSecondApprover: patch.requireSecondApprover ?? cur.requireSecondApprover, allowUncapped: patch.allowUncapped ?? cur.allowUncapped, updatedAt: new Date(), updatedBy: actorId };
  await (await col()).replaceOne({ _id: "ads-guard" }, next, { upsert: true });
  return next;
}

export async function setKillSwitch(on: boolean, actorId: string): Promise<GuardSettings> {
  const cur = await getGuard();
  const next: GuardSettings = { ...cur, killSwitch: on, killSwitchBy: on ? actorId : null, killSwitchAt: on ? new Date() : null, updatedAt: new Date(), updatedBy: actorId };
  await (await col()).replaceOne({ _id: "ads-guard" }, next, { upsert: true });
  return next;
}

export interface Commitment {
  /** Sum of daily budgets (the number the daily cap and per-launch daily cap use). */
  dailyMinor: number;
  /** Total the launch can spend over its life, or null when a daily budget has no end date. */
  totalMinor: number | null;
  /** What the company cap counts: the total when it fits in 30 days, else 30 days of spend. */
  monthlyMinor: number;
}

const daysBetween = (a: string | null, b: string | null, now: Date): number | null => {
  if (!b) return null;
  const start = a ? Math.max(new Date(a).getTime(), now.getTime()) : now.getTime();
  return Math.max(1, Math.ceil((new Date(b).getTime() - start) / DAY_MS));
};

function add(m: MinorMoney, start: string | null, end: string | null, now: Date, acc: { daily: number; total: number; open: boolean; lifetime: number }) {
  if (m.type === "daily") {
    acc.daily += m.amountMinor;
    const d = daysBetween(start, end, now);
    if (d === null) acc.open = true;
    else acc.total += m.amountMinor * d;
  } else {
    acc.total += m.amountMinor;
    acc.lifetime += m.amountMinor;
  }
}

export function commitmentOf(c: MetaCampaignDraft, now: Date = new Date()): Commitment {
  const acc = { daily: 0, total: 0, open: false, lifetime: 0 };
  if (c.campaignBudget) add(c.campaignBudget, c.startTime, c.stopTime, now, acc);
  else for (const s of c.adSets) if (s.budget) add(s.budget, s.startTime ?? c.startTime, s.endTime ?? c.stopTime, now, acc);
  const daily = acc.daily;
  // 30-day exposure: daily budgets run 30 days (or until their end), lifetime budgets count in full.
  const spreadDays = 30;
  const monthly = acc.open ? daily * spreadDays + acc.lifetime : Math.min(acc.total, daily * spreadDays + acc.lifetime);
  return { dailyMinor: daily, totalMinor: acc.open ? null : acc.total, monthlyMinor: monthly };
}

export interface GuardVerdict {
  ok: boolean;
  reasons: string[];
  needsSecondApprover: boolean;
}

/** Pure check; `others` are the commitments of other launches that are currently delivering in the same currency. */
export function evaluateGuard(g: GuardSettings, currency: string, c: Commitment, others: Commitment[]): GuardVerdict {
  const reasons: string[] = [];
  const caps = g.perCurrency[currency];
  if (g.killSwitch) reasons.push("The ads kill switch is on. Turn it off in the spending limits before anything can run.");
  if (!caps && !g.allowUncapped) reasons.push(`No spending limit is set for ${currency}. Set one in the spending limits (or explicitly allow uncapped launches) first.`);
  const fmt = (n: number) => formatMinorPlain(n, currency);
  if (caps) {
    if (caps.maxDailyPerLaunchMinor && c.dailyMinor > caps.maxDailyPerLaunchMinor) reasons.push(`The daily budget (${fmt(c.dailyMinor)}) is above the per-launch limit of ${fmt(caps.maxDailyPerLaunchMinor)}.`);
    if (caps.maxTotalPerLaunchMinor) {
      if (c.totalMinor === null) reasons.push(`This launch has no end date so its total is unlimited; the per-launch total limit is ${fmt(caps.maxTotalPerLaunchMinor)}. Set an end date.`);
      else if (c.totalMinor > caps.maxTotalPerLaunchMinor) reasons.push(`The total (${fmt(c.totalMinor)}) is above the per-launch limit of ${fmt(caps.maxTotalPerLaunchMinor)}.`);
    }
    if (caps.companyDailyCapMinor) {
      const used = others.reduce((s, o) => s + o.dailyMinor, 0) + c.dailyMinor;
      if (used * GUARD_DAILY_OVERSHOOT > caps.companyDailyCapMinor) reasons.push(`Together with running ads the daily spend (up to ${fmt(Math.round(used * GUARD_DAILY_OVERSHOOT))} counting Meta's 25% daily overshoot) would pass the company daily limit of ${fmt(caps.companyDailyCapMinor)}.`);
    }
    if (caps.companyMonthlyCapMinor) {
      const used = others.reduce((s, o) => s + o.monthlyMinor, 0) + c.monthlyMinor;
      if (used > caps.companyMonthlyCapMinor) reasons.push(`Together with running ads the 30-day spend (${fmt(used)}) would pass the company monthly limit of ${fmt(caps.companyMonthlyCapMinor)}.`);
    }
  }
  // No threshold set means no relaxation was chosen: any spend needs an approver other than the creator.
  const threshold = caps?.approvalThresholdMinor ?? null;
  const needsSecond = g.requireSecondApprover && (threshold === null || c.dailyMinor > threshold || (c.totalMinor ?? Infinity) > threshold);
  return { ok: reasons.length === 0, reasons, needsSecondApprover: needsSecond };
}
