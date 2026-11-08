import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, type Company } from "@/lib/platform/tenancy/companies";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { loadSubscriptionEvents, planMrr, type SubscriptionEvent } from "@/lib/platform/billing/events";
import type { BillingInterval, CompanySubscription, Plan, SubscriptionStatus } from "@/lib/platform/billing/types";

/**
 * Platform revenue & subscription analytics for the Platform Console
 * (`/console/revenue`, plus the headline cards on `/console`).
 * Cross-company, raw DB, built from `companies` (current state),
 * `subscription_events` (history) and `saas_invoices` (money billed and
 * collected). The platform owner (`internal`) is excluded from every figure.
 *
 * Definitions (all money = paise, pre-tax unless noted):
 * - MRR: companies whose EFFECTIVE status is active, past_due or grace, at the
 *   catalogue price of their plan for their billing cycle, monthly-normalised
 *   (yearly price / 12). Effective = the stored status with time-based
 *   transitions applied (expired trial or expired grace → suspended), exactly
 *   like `getEntitlements()`. A company with no stored subscription is an
 *   implicit trial of the default plan from its creation date.
 * - ARR = 12 × MRR. ARPA = MRR / paying companies.
 * - Movements (per month, from `subscription_events`): new (0 → >0, includes
 *   reactivations), expansion (up), contraction (down, still >0), churn (>0 → 0).
 *   Net new MRR = new + expansion − contraction − churn. A company's first-ever
 *   event that isn't trial_started/activated is taken as its baseline, not a
 *   movement (history started after it was already paying).
 * - Logo churn (range or month) = companies paying at the start and not at the
 *   end ÷ companies paying at the start. Revenue churn (gross) = (churn +
 *   contraction) ÷ MRR at the start; net revenue churn also subtracts expansion.
 * - Trial → paid conversion = trials started in the range that later reached
 *   `activated` (any time up to now) ÷ those trials that have ended (still
 *   running trials are left out of the denominator). Falls back to current
 *   state (companies created in the range) when there are no trial_started
 *   events (`source: "current_state"`).
 * - Billed = `saas_invoices` issued in the range (issuedAt, else createdAt; not
 *   draft/void/canceled), tax-inclusive `amount`. Collected = paid invoices by
 *   paidAt. GST = the invoices' `tax`. Only the platform billing currency.
 * Months are calendar months in India time (UTC+05:30, no DST).
 */

export const PLATFORM_UTC_OFFSET_MIN = 330;
/** Trials ending within this many days count as "ending soon" / at risk. */
export const AT_RISK_TRIAL_DAYS = 7;
export const MAX_RANGE_MONTHS = 36;
const DAY = 86_400_000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const PAYING: ReadonlySet<SubscriptionStatus> = new Set(["active", "past_due", "grace"]);
const NOT_BILLED = new Set(["draft", "void", "voided", "canceled", "cancelled"]);

export type TrackedStatus = Exclude<SubscriptionStatus, "internal">;

// ─── months & ranges (India time) ────────────────────────────────────────────

export interface MonthSpan {
  /** "2026-09" */
  key: string;
  /** "Sep 2026" */
  label: string;
  start: Date;
  end: Date;
}

function monthStart(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 1) - PLATFORM_UTC_OFFSET_MIN * 60_000);
}

function localParts(d: Date): { y: number; m: number } {
  const local = new Date(d.getTime() + PLATFORM_UTC_OFFSET_MIN * 60_000);
  return { y: local.getUTCFullYear(), m: local.getUTCMonth() };
}

function spanOf(y: number, m: number): MonthSpan {
  const start = monthStart(y, m);
  const { y: yy, m: mm } = localParts(start);
  return { key: `${yy}-${String(mm + 1).padStart(2, "0")}`, label: `${MONTH_NAMES[mm]} ${yy}`, start, end: monthStart(y, m + 1) };
}

export function monthKeyOf(d: Date): string {
  const { y, m } = localParts(d);
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

/** Month index (year × 12 + month) of a "YYYY-MM" key, or null when malformed. */
function parseMonthKey(key: string | undefined | null): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key ?? "");
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  if (m < 0 || m > 11 || y < 2000 || y > 2200) return null;
  return y * 12 + m;
}

function monthsBetween(fromIdx: number, toIdx: number): MonthSpan[] {
  const out: MonthSpan[] = [];
  for (let i = fromIdx; i <= toIdx; i++) out.push(spanOf(Math.floor(i / 12), i % 12));
  return out;
}

/** The last `n` calendar months ending with the one containing `now`, oldest first. */
export function lastMonths(now: Date, n = 12): MonthSpan[] {
  const { y, m } = localParts(now);
  const cur = y * 12 + m;
  return monthsBetween(cur - n + 1, cur);
}

export const RANGE_PRESETS = [
  { id: "3m", label: "Last 3 months" },
  { id: "6m", label: "Last 6 months" },
  { id: "12m", label: "Last 12 months" },
  { id: "24m", label: "Last 24 months" },
  { id: "fy", label: "This financial year" },
] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number]["id"] | "custom";
export const DEFAULT_RANGE: RangePreset = "12m";

export interface RevenueRange {
  preset: RangePreset;
  /** "YYYY-MM", inclusive. */
  from: string;
  /** "YYYY-MM", inclusive. */
  to: string;
  label: string;
  months: MonthSpan[];
  start: Date;
  /** Exclusive: the start of the month after `to`, or just after `now` when `to` is the current month. */
  end: Date;
  includesCurrent: boolean;
}

/**
 * Turns `?range=6m` or `?from=2026-01&to=2026-06` into whole calendar months.
 * `to` is clamped to the current month, the order is fixed if reversed, and a
 * range is at most MAX_RANGE_MONTHS long. Unknown input → the default preset.
 */
export function resolveRevenueRange(input: { range?: string | null; from?: string | null; to?: string | null }, now: Date = new Date()): RevenueRange {
  const { y, m } = localParts(now);
  const cur = y * 12 + m;
  let preset: RangePreset = DEFAULT_RANGE;
  let fromIdx: number;
  let toIdx = cur;
  const customFrom = parseMonthKey(input.from);
  const customTo = parseMonthKey(input.to);
  if ((input.range === "custom" || !input.range) && (customFrom !== null || customTo !== null)) {
    preset = "custom";
    toIdx = Math.min(customTo ?? cur, cur);
    fromIdx = Math.min(customFrom ?? toIdx - 11, cur);
    if (fromIdx > toIdx) [fromIdx, toIdx] = [toIdx, fromIdx];
    fromIdx = Math.max(fromIdx, toIdx - MAX_RANGE_MONTHS + 1);
  } else {
    preset = RANGE_PRESETS.some((p) => p.id === input.range) ? (input.range as RangePreset) : DEFAULT_RANGE;
    if (preset === "fy") fromIdx = m >= 3 ? y * 12 + 3 : (y - 1) * 12 + 3; // Indian FY starts in April
    else fromIdx = cur - Number.parseInt(preset, 10) + 1;
  }
  const months = monthsBetween(fromIdx, toIdx);
  const includesCurrent = toIdx === cur;
  const first = months[0];
  const last = months[months.length - 1];
  const label =
    preset === "custom" ? (months.length === 1 ? first.label : `${first.label} – ${last.label}`) : (RANGE_PRESETS.find((p) => p.id === preset)?.label ?? "");
  return {
    preset,
    from: first.key,
    to: last.key,
    label,
    months,
    start: first.start,
    end: includesCurrent ? new Date(now.getTime() + 1) : last.end,
    includesCurrent,
  };
}

// ─── current state ────────────────────────────────────────────────────────────

type CompanyDoc = Company & { subscription?: CompanySubscription };

export interface EffectiveSub {
  companyId: string;
  name: string;
  slug: string;
  createdAt: Date;
  planId: string;
  interval: BillingInterval;
  status: TrackedStatus;
  /** Stored subscription exists (false = implicit trial from creation). */
  stored: boolean;
  trialEndsAt: Date | null;
  graceEndsAt: Date | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
}

export function effectiveSubscription(c: CompanyDoc, defaultPlan: Plan | undefined, defaultTrialDays: number, now: Date): EffectiveSub | null {
  if (c.isPlatformOwner) return null;
  const s = c.subscription;
  if (s?.status === "internal") return null;
  const base = { companyId: c._id, name: c.name, slug: c.slug, createdAt: c.createdAt };
  const trialDays = defaultPlan?.trialDays ?? defaultTrialDays;
  const implicitTrialEnd = new Date(c.createdAt.getTime() + trialDays * DAY);
  if (!s) {
    return {
      ...base,
      planId: defaultPlan?._id ?? "trial",
      interval: "monthly",
      status: implicitTrialEnd <= now ? "suspended" : "trialing",
      stored: false,
      trialEndsAt: implicitTrialEnd,
      graceEndsAt: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };
  }
  const trialEndsAt = s.trialEndsAt ?? (s.status === "trialing" ? implicitTrialEnd : null);
  let status: TrackedStatus = s.status;
  // Same on-read expiry rules as entitlements.
  if (status === "trialing" && trialEndsAt && trialEndsAt <= now) status = "suspended";
  if (status === "grace" && s.graceEndsAt && s.graceEndsAt <= now) status = "suspended";
  return {
    ...base,
    planId: s.planId,
    interval: s.interval ?? "monthly",
    status,
    stored: true,
    trialEndsAt,
    graceEndsAt: s.graceEndsAt ?? null,
    currentPeriodStart: s.currentPeriodStart ?? null,
    currentPeriodEnd: s.currentPeriodEnd ?? null,
  };
}

interface CurrentState {
  plans: Plan[];
  planById: Map<string, Plan>;
  ownerIds: Set<string>;
  subs: EffectiveSub[];
  currency: string;
}

async function loadCurrentState(now: Date): Promise<CurrentState> {
  const db = await getPlatformDb();
  const [plans, settings, companies] = await Promise.all([
    listPlans(),
    getBillingSettings(),
    db
      .collection<CompanyDoc>(COMPANIES_COLLECTION)
      .find({}, { projection: { name: 1, slug: 1, createdAt: 1, isPlatformOwner: 1, subscription: 1 } })
      .toArray(),
  ]);
  const defaultPlan = plans.find((p) => p.isDefault && p.active) ?? plans.find((p) => p.active);
  const subs = companies
    .map((c) => effectiveSubscription(c, defaultPlan, settings.billing.defaultTrialDays, now))
    .filter((s): s is EffectiveSub => s !== null);
  return {
    plans,
    planById: new Map(plans.map((p) => [p._id, p])),
    ownerIds: new Set(companies.filter((c) => c.isPlatformOwner).map((c) => c._id)),
    subs,
    currency: settings.billing.currency || "INR",
  };
}

function emptyCounts(): Record<TrackedStatus, number> {
  return { trialing: 0, active: 0, past_due: 0, grace: 0, suspended: 0, canceled: 0 };
}

/** Live MRR per paying company. */
function liveMrrOf(subs: EffectiveSub[], planById: Map<string, Plan>): Map<string, number> {
  const out = new Map<string, number>();
  for (const s of subs) if (PAYING.has(s.status)) out.set(s.companyId, planMrr(planById.get(s.planId), s.interval));
  return out;
}

export interface TrialEnding {
  id: string;
  name: string;
  slug: string;
  endsAt: string;
  daysLeft: number;
}

function trialsEndingWithin(subs: EffectiveSub[], days: number, now: Date): TrialEnding[] {
  const out: TrialEnding[] = [];
  for (const s of subs) {
    if (s.status !== "trialing" || !s.trialEndsAt) continue;
    const daysLeft = Math.ceil((s.trialEndsAt.getTime() - now.getTime()) / DAY);
    if (daysLeft <= days) out.push({ id: s.companyId, name: s.name, slug: s.slug, endsAt: s.trialEndsAt.toISOString(), daysLeft });
  }
  return out.sort((a, b) => a.daysLeft - b.daysLeft || a.endsAt.localeCompare(b.endsAt));
}

export interface RevenueSnapshot {
  currency: string;
  mrr: number;
  arr: number;
  arpa: number | null;
  paying: number;
  totalCompanies: number;
  counts: Record<TrackedStatus, number>;
  /** Trials ending within AT_RISK_TRIAL_DAYS, soonest first. */
  trialsEndingSoon: TrialEnding[];
}

/** Headline figures for the Platform Console dashboard — current state only, no history. */
export async function getRevenueSnapshot(now: Date = new Date()): Promise<RevenueSnapshot> {
  const { subs, planById, currency } = await loadCurrentState(now);
  const counts = emptyCounts();
  for (const s of subs) counts[s.status]++;
  const live = liveMrrOf(subs, planById);
  const mrr = [...live.values()].reduce((a, b) => a + b, 0);
  return {
    currency,
    mrr,
    arr: mrr * 12,
    arpa: live.size > 0 ? Math.round(mrr / live.size) : null,
    paying: live.size,
    totalCompanies: subs.length,
    counts,
    trialsEndingSoon: trialsEndingWithin(subs, AT_RISK_TRIAL_DAYS, now),
  };
}

export interface CompanyRevenueRow {
  companyId: string;
  name: string;
  slug: string;
  status: TrackedStatus;
  planId: string;
  planName: string;
  interval: BillingInterval;
  /** Live MRR (0 unless active / past_due / grace). */
  mrr: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  createdAt: Date;
}

/** Every customer company's current subscription and MRR, highest MRR first (for the CSV export). */
export async function listCompanyRevenue(now: Date = new Date()): Promise<CompanyRevenueRow[]> {
  const { subs, planById } = await loadCurrentState(now);
  const live = liveMrrOf(subs, planById);
  return subs
    .map((s) => ({
      companyId: s.companyId,
      name: s.name,
      slug: s.slug,
      status: s.status,
      planId: s.planId,
      planName: planById.get(s.planId)?.name ?? s.planId,
      interval: s.interval,
      mrr: live.get(s.companyId) ?? 0,
      trialEndsAt: s.status === "trialing" ? s.trialEndsAt : null,
      currentPeriodEnd: s.currentPeriodEnd,
      graceEndsAt: s.status === "grace" ? s.graceEndsAt : null,
      createdAt: s.createdAt,
    }))
    .sort((a, b) => b.mrr - a.mrr || a.name.localeCompare(b.name));
}

// ─── history from events ─────────────────────────────────────────────────────

type Bucket = "new" | "expansion" | "contraction" | "churn";

export function classifyMovement(prev: number, cur: number): Bucket | null {
  if (prev === cur) return null;
  if (prev === 0) return "new";
  if (cur === 0) return "churn";
  return cur > prev ? "expansion" : "contraction";
}

/** One company's MRR over time: an opening value plus ordered steps. */
interface Timeline {
  opening: number;
  steps: { at: Date; mrr: number }[];
}

function valueBefore(t: Timeline, when: Date): number {
  let v = t.opening;
  for (const s of t.steps) {
    if (s.at >= when) break;
    v = s.mrr;
  }
  return v;
}

// ─── the dashboard ───────────────────────────────────────────────────────────

export interface MonthRow {
  key: string;
  label: string;
  /** MRR at the end of the month (the current month: live MRR now). */
  mrr: number;
  startMrr: number;
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
  /** new + expansion − contraction − churn */
  net: number;
  payingAtStart: number;
  churnedLogos: number;
  logoChurnRate: number | null;
  revenueChurnRate: number | null;
  trialsStarted: number;
  /** Issued invoices, tax-inclusive. */
  billed: number;
  billedTax: number;
  invoicesIssued: number;
  /** Paid invoices (tax-inclusive) by paidAt month. */
  collected: number;
  collectedTax: number;
  invoicesPaid: number;
}

export interface MixRow {
  id: string;
  name: string;
  companies: number;
  mrr: number;
  /** Share of total MRR, 0..1. */
  share: number;
}

export interface AtRiskRow {
  companyId: string;
  name: string;
  slug: string;
  planName: string;
  status: "past_due" | "grace" | "trialing";
  /** MRR at stake (for a trial: what it would be on conversion). */
  mrr: number;
  /** When it tips over: grace end, trial end, or period end for past_due. ISO string. */
  deadline: string | null;
}

export interface TrialConversion {
  started: number;
  converted: number;
  open: number;
  rate: number | null;
  source: "events" | "current_state";
}

export interface RangeSummary {
  startMrr: number;
  endMrr: number;
  new: number;
  expansion: number;
  contraction: number;
  churn: number;
  net: number;
  payingAtStart: number;
  payingAtEnd: number;
  churnedLogos: number;
  logoChurnRate: number | null;
  revenueChurnRate: number | null;
  netRevenueChurnRate: number | null;
  billed: number;
  billedTaxable: number;
  billedTax: number;
  invoicesIssued: number;
  collected: number;
  collectedTax: number;
  invoicesPaid: number;
  /** collected ÷ billed (tax-inclusive), null when nothing was billed. */
  collectionRate: number | null;
}

export interface RevenueDashboard {
  generatedAt: string;
  currency: string;
  range: Omit<RevenueRange, "months" | "start" | "end"> & { start: string; end: string };
  // Current state.
  mrr: number;
  arr: number;
  arpa: number | null;
  paying: number;
  totalCompanies: number;
  counts: Record<TrackedStatus, number>;
  trialsEndingSoon: number;
  planMix: MixRow[];
  cycleMix: MixRow[];
  atRisk: AtRiskRow[];
  // The selected range.
  summary: RangeSummary;
  trialConversion: TrialConversion;
  /** One row per month of the range, oldest first. */
  months: MonthRow[];
  history: { hasEvents: boolean; untrackedPaying: number };
}

interface InvoiceDoc {
  companyId: string;
  amount?: number;
  taxable?: number;
  tax?: number;
  currency?: string;
  status?: string;
  issuedAt?: Date | null;
  createdAt?: Date | null;
  paidAt?: Date | null;
}

const CYCLE_LABEL: Record<BillingInterval, string> = { monthly: "Monthly", yearly: "Yearly" };

function withShares(rows: MixRow[], total: number): MixRow[] {
  return rows.map((r) => ({ ...r, share: total > 0 ? r.mrr / total : 0 }));
}

export async function getRevenueDashboard(opts: { now?: Date; range?: string | null; from?: string | null; to?: string | null } = {}): Promise<RevenueDashboard> {
  const now = opts.now ?? new Date();
  const range = resolveRevenueRange(opts, now);
  const db = await getPlatformDb();
  const invoicesCol = db.collection<InvoiceDoc>("saas_invoices");
  const inRange = { $gte: range.start, $lt: range.end };
  const invoiceProjection = { projection: { companyId: 1, amount: 1, taxable: 1, tax: 1, currency: 1, status: 1, issuedAt: 1, createdAt: 1, paidAt: 1 } };

  const [state, events, issued, paid] = await Promise.all([
    loadCurrentState(now),
    loadSubscriptionEvents(range.start),
    invoicesCol
      .find({ $or: [{ issuedAt: inRange }, { issuedAt: { $in: [null] }, createdAt: inRange }] }, invoiceProjection)
      .toArray()
      .catch(() => [] as InvoiceDoc[]),
    invoicesCol
      .find({ status: "paid", paidAt: inRange }, invoiceProjection)
      .toArray()
      .catch(() => [] as InvoiceDoc[]),
  ]);
  const { plans, planById, ownerIds, subs, currency } = state;

  // ── Current state ──
  const counts = emptyCounts();
  for (const s of subs) counts[s.status]++;
  const liveMrr = liveMrrOf(subs, planById);
  const mrr = [...liveMrr.values()].reduce((a, b) => a + b, 0);
  const paying = liveMrr.size;
  const planMixMap = new Map<string, MixRow>();
  const cycleMixMap = new Map<string, MixRow>();
  for (const s of subs) {
    if (!liveMrr.has(s.companyId)) continue;
    const v = liveMrr.get(s.companyId) ?? 0;
    const plan = planById.get(s.planId);
    const p = planMixMap.get(s.planId) ?? { id: s.planId, name: plan?.name ?? s.planId, companies: 0, mrr: 0, share: 0 };
    p.companies++;
    p.mrr += v;
    planMixMap.set(s.planId, p);
    const c = cycleMixMap.get(s.interval) ?? { id: s.interval, name: CYCLE_LABEL[s.interval] ?? s.interval, companies: 0, mrr: 0, share: 0 };
    c.companies++;
    c.mrr += v;
    cycleMixMap.set(s.interval, c);
  }
  const planOrder = new Map(plans.map((p) => [p._id, p.sortOrder]));
  const planMix = withShares([...planMixMap.values()], mrr).sort(
    (a, b) => (planOrder.get(a.id) ?? 1e9) - (planOrder.get(b.id) ?? 1e9) || a.name.localeCompare(b.name),
  );
  const cycleMix = withShares([...cycleMixMap.values()], mrr).sort((a, b) => (a.id === "monthly" ? -1 : b.id === "monthly" ? 1 : 0));

  // ── Timelines + movements ──
  const isTracked = (e: SubscriptionEvent) => !ownerIds.has(e.companyId) && e.at <= now;
  const openingEvents = events.opening.filter(isTracked);
  const afterStart = events.inWindow.filter(isTracked);
  const timelines = new Map<string, Timeline>();
  for (const e of openingEvents) timelines.set(e.companyId, { opening: e.mrr, steps: [] });
  const zero = () => ({ new: 0, expansion: 0, contraction: 0, churn: 0, trialsStarted: 0 });
  const perMonth = new Map(range.months.map((m) => [m.key, zero()]));
  for (const e of afterStart) {
    let t = timelines.get(e.companyId);
    const firstEver = !t;
    if (!t) {
      t = { opening: 0, steps: [] };
      timelines.set(e.companyId, t);
    }
    const inSelected = e.at < range.end;
    const bucketRow = inSelected ? perMonth.get(monthKeyOf(e.at)) : undefined;
    if (e.type === "trial_started" && bucketRow) bucketRow.trialsStarted++;
    const prev = t.steps.length ? t.steps[t.steps.length - 1].mrr : t.opening;
    if (firstEver && e.type !== "trial_started" && e.type !== "activated") {
      // History began after this company was already subscribed: baseline, not a movement.
      t.opening = e.mrr;
      continue;
    }
    t.steps.push({ at: e.at, mrr: e.mrr });
    const bucket = classifyMovement(prev, e.mrr);
    if (bucket && bucketRow) bucketRow[bucket] += Math.abs(e.mrr - prev);
  }
  // Paying companies with no history at all: shown flat at their live MRR from sign-up.
  const untracked = subs.filter((s) => liveMrr.has(s.companyId) && !timelines.has(s.companyId));

  const valueAt = (when: Date) => {
    let total = 0;
    let logos = 0;
    const payingIds = new Set<string>();
    for (const [id, t] of timelines) {
      const v = valueBefore(t, when);
      total += v;
      if (v > 0) {
        logos++;
        payingIds.add(id);
      }
    }
    for (const s of untracked) {
      if (s.createdAt < when) {
        total += liveMrr.get(s.companyId) ?? 0;
        logos++;
        payingIds.add(s.companyId);
      }
    }
    return { total, logos, payingIds };
  };
  /** MRR state at a boundary; "now" when the boundary is the end of the current month. */
  const closingAt = (end: Date, isNow: boolean) => (isNow ? { total: mrr, logos: paying, payingIds: new Set(liveMrr.keys()) } : valueAt(end));
  const churnedBetween = (startIds: Set<string>, endIds: Set<string>) => [...startIds].filter((id) => !endIds.has(id)).length;

  // ── Invoices ──
  const sameCurrency = (inv: InvoiceDoc) => !inv.currency || inv.currency === currency;
  const billedBy = new Map<string, { amount: number; tax: number; taxable: number; count: number }>();
  for (const inv of issued) {
    if (ownerIds.has(inv.companyId) || !sameCurrency(inv) || NOT_BILLED.has(String(inv.status ?? "").toLowerCase())) continue;
    const when = inv.issuedAt ?? inv.createdAt;
    if (!when) continue;
    const key = monthKeyOf(when);
    const amount = Number(inv.amount) || 0;
    const tax = Number(inv.tax) || 0;
    const b = billedBy.get(key) ?? { amount: 0, tax: 0, taxable: 0, count: 0 };
    b.amount += amount;
    b.tax += tax;
    b.taxable += inv.taxable !== undefined && inv.taxable !== null ? Number(inv.taxable) || 0 : amount - tax;
    b.count++;
    billedBy.set(key, b);
  }
  const collectedBy = new Map<string, { amount: number; tax: number; count: number }>();
  for (const inv of paid) {
    if (!inv.paidAt || ownerIds.has(inv.companyId) || !sameCurrency(inv)) continue;
    const key = monthKeyOf(inv.paidAt);
    const c = collectedBy.get(key) ?? { amount: 0, tax: 0, count: 0 };
    c.amount += Number(inv.amount) || 0;
    c.tax += Number(inv.tax) || 0;
    c.count++;
    collectedBy.set(key, c);
  }

  // ── Months ──
  const monthRows: MonthRow[] = range.months.map((m, i) => {
    const isNow = range.includesCurrent && i === range.months.length - 1;
    const start = valueAt(m.start);
    const end = closingAt(m.end, isNow);
    const mv = perMonth.get(m.key)!;
    const churnedLogos = churnedBetween(start.payingIds, end.payingIds);
    const b = billedBy.get(m.key);
    const c = collectedBy.get(m.key);
    return {
      key: m.key,
      label: m.label,
      mrr: end.total,
      startMrr: start.total,
      new: mv.new,
      expansion: mv.expansion,
      contraction: mv.contraction,
      churn: mv.churn,
      net: mv.new + mv.expansion - mv.contraction - mv.churn,
      payingAtStart: start.logos,
      churnedLogos,
      logoChurnRate: start.logos > 0 ? churnedLogos / start.logos : null,
      revenueChurnRate: start.total > 0 ? (mv.churn + mv.contraction) / start.total : null,
      trialsStarted: mv.trialsStarted,
      billed: b?.amount ?? 0,
      billedTax: b?.tax ?? 0,
      invoicesIssued: b?.count ?? 0,
      collected: c?.amount ?? 0,
      collectedTax: c?.tax ?? 0,
      invoicesPaid: c?.count ?? 0,
    };
  });

  // ── Range summary ──
  const sum = (f: (r: MonthRow) => number) => monthRows.reduce((a, r) => a + f(r), 0);
  const rangeStart = valueAt(range.start);
  const rangeEnd = closingAt(range.end, range.includesCurrent);
  const rangeChurnedLogos = churnedBetween(rangeStart.payingIds, rangeEnd.payingIds);
  const totals = { new: sum((r) => r.new), expansion: sum((r) => r.expansion), contraction: sum((r) => r.contraction), churn: sum((r) => r.churn) };
  const billed = sum((r) => r.billed);
  const collected = sum((r) => r.collected);
  const summary: RangeSummary = {
    startMrr: rangeStart.total,
    endMrr: rangeEnd.total,
    ...totals,
    net: totals.new + totals.expansion - totals.contraction - totals.churn,
    payingAtStart: rangeStart.logos,
    payingAtEnd: rangeEnd.logos,
    churnedLogos: rangeChurnedLogos,
    logoChurnRate: rangeStart.logos > 0 ? rangeChurnedLogos / rangeStart.logos : null,
    revenueChurnRate: rangeStart.total > 0 ? (totals.churn + totals.contraction) / rangeStart.total : null,
    netRevenueChurnRate: rangeStart.total > 0 ? (totals.churn + totals.contraction - totals.expansion) / rangeStart.total : null,
    billed,
    billedTaxable: [...billedBy.values()].reduce((a, b) => a + b.taxable, 0),
    billedTax: sum((r) => r.billedTax),
    invoicesIssued: sum((r) => r.invoicesIssued),
    collected,
    collectedTax: sum((r) => r.collectedTax),
    invoicesPaid: sum((r) => r.invoicesPaid),
    collectionRate: billed > 0 ? collected / billed : null,
  };

  // ── Trial → paid conversion ──
  const statusById = new Map(subs.map((s) => [s.companyId, s]));
  const trialStarts = new Map<string, Date>();
  const activations = new Map<string, Date[]>();
  for (const e of afterStart) {
    if (e.type === "trial_started" && e.at < range.end && !trialStarts.has(e.companyId)) trialStarts.set(e.companyId, e.at);
    if (e.type === "activated") activations.set(e.companyId, [...(activations.get(e.companyId) ?? []), e.at]);
  }
  let trialConversion: TrialConversion;
  if (trialStarts.size > 0) {
    let converted = 0;
    let open = 0;
    for (const [companyId, startedAt] of trialStarts) {
      if ((activations.get(companyId) ?? []).some((at) => at >= startedAt)) converted++;
      else if (statusById.get(companyId)?.status === "trialing") open++;
    }
    const decided = trialStarts.size - open;
    trialConversion = { started: trialStarts.size, converted, open, rate: decided > 0 ? converted / decided : null, source: "events" };
  } else {
    const cohort = subs.filter((s) => s.createdAt >= range.start && s.createdAt < range.end);
    const converted = cohort.filter((s) => PAYING.has(s.status) || ((s.status === "canceled" || s.status === "suspended") && s.currentPeriodStart !== null)).length;
    const open = cohort.filter((s) => s.status === "trialing").length;
    const decided = cohort.length - open;
    trialConversion = { started: cohort.length, converted, open, rate: decided > 0 ? converted / decided : null, source: "current_state" };
  }

  // ── At risk (current) ──
  const soon = new Date(now.getTime() + AT_RISK_TRIAL_DAYS * DAY);
  const atRisk: AtRiskRow[] = [];
  let trialsEndingSoon = 0;
  for (const s of subs) {
    const plan = planById.get(s.planId);
    const planName = plan?.name ?? s.planId;
    if (s.status === "past_due" || s.status === "grace") {
      const deadline = s.status === "grace" ? s.graceEndsAt : s.currentPeriodEnd;
      atRisk.push({ companyId: s.companyId, name: s.name, slug: s.slug, planName, status: s.status, mrr: liveMrr.get(s.companyId) ?? 0, deadline: deadline?.toISOString() ?? null });
    } else if (s.status === "trialing" && s.trialEndsAt && s.trialEndsAt > now && s.trialEndsAt <= soon) {
      trialsEndingSoon++;
      atRisk.push({ companyId: s.companyId, name: s.name, slug: s.slug, planName, status: "trialing", mrr: planMrr(plan, s.interval), deadline: s.trialEndsAt.toISOString() });
    }
  }
  const rank = { grace: 0, past_due: 1, trialing: 2 } as const;
  atRisk.sort((a, b) => rank[a.status] - rank[b.status] || (a.deadline ?? "9").localeCompare(b.deadline ?? "9"));

  const { months: _months, start, end, ...rangeInfo } = range;
  void _months;
  return {
    generatedAt: now.toISOString(),
    currency,
    range: { ...rangeInfo, start: start.toISOString(), end: end.toISOString() },
    mrr,
    arr: mrr * 12,
    arpa: paying > 0 ? Math.round(mrr / paying) : null,
    paying,
    totalCompanies: subs.length,
    counts,
    trialsEndingSoon,
    planMix,
    cycleMix,
    atRisk,
    summary,
    trialConversion,
    months: monthRows,
    history: { hasEvents: timelines.size > 0, untrackedPaying: untracked.length },
  };
}
