import { M } from "./types";

/** Pure metric math. No invented numbers: when a denominator is missing or zero the answer is `null`, never 0 and never a guess. */

export type MetricMap = Record<string, number>;

export const safeDiv = (n: number, d: number): number | null => (Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : null);
export const round = (v: number | null, dp = 2): number | null => (v === null ? null : Math.round(v * 10 ** dp) / 10 ** dp);

const COMPONENTS = [M.likes, M.comments, M.shares, M.saves, M.reposts, M.quotes, M.bookmarks] as const;

/**
 * Engagements = the platform's own total when it reports one (Instagram total_interactions, Facebook post engagements), otherwise
 * likes + comments + shares + saves + reposts + quotes + bookmarks (whichever the platform reports). Clicks are not counted.
 * `null` = the platform reported none of these for the post.
 */
export function engagementsOf(m: MetricMap): number | null {
  if (typeof m[M.interactions] === "number") return m[M.interactions];
  const have = COMPONENTS.filter((k) => typeof m[k] === "number");
  return have.length ? have.reduce((s, k) => s + m[k], 0) : null;
}

export const RATE_FORMULA = "The headline engagement rate = engagements ÷ reach × 100 over posts that report reach (posts without reach are left out and counted). A post row without reach shows its own rate and names the figure it used (views, then impressions). Engagements = the platform's total interactions, or likes + comments + shares + saves (+ reposts, quotes, bookmarks where reported).";

export interface Rate {
  /** Percent. */
  value: number;
  denominator: "reach" | "views" | "impressions";
}

/**
 * engagements / denominator x 100. Without `only` it uses the first figure the platform reports (reach, then views, then impressions) and
 * says which; with `only` it uses that one figure or returns null - no fallback.
 */
export function engagementRate(m: MetricMap, only?: Rate["denominator"]): Rate | null {
  const e = engagementsOf(m);
  if (e === null) return null;
  for (const d of only ? [only] : (["reach", "views", "impressions"] as const)) {
    const key = d === "reach" ? M.reach : d === "views" ? M.views : M.impressions;
    const r = safeDiv(e, m[key] ?? 0);
    if (r !== null) return { value: r * 100, denominator: d };
  }
  return null;
}

export interface PaidSums {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number | null;
  /** Spend-weighted purchase ROAS inputs: sum(roas_i * spend_i) over days that reported a roas. */
  roasValue: number;
  roasSpend: number;
}

export interface PaidMath {
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
}

export function paidMath(s: PaidSums): PaidMath {
  return {
    ctr: round(safeDiv(s.clicks * 100, s.impressions)),
    cpc: round(safeDiv(s.spend, s.clicks)),
    cpm: round(safeDiv(s.spend * 1000, s.impressions)),
    cpa: s.conversions === null ? null : round(safeDiv(s.spend, s.conversions)),
    // ROAS only exists when the platform reported conversion value; otherwise we do not compute it.
    roas: s.roasSpend > 0 ? round(s.roasValue / s.roasSpend) : null,
  };
}

/** The conversion count of an insight row: the FIRST of these action types that is present (they overlap, so they are never added up). */
export const CONVERSION_ACTIONS = ["purchase", "omni_purchase", "lead", "onsite_conversion.lead_grouped", "complete_registration", "offsite_conversion.fb_pixel_purchase", "offsite_conversion.fb_pixel_lead"];
export function pickConversions(actions: Record<string, number>): { action: string; value: number } | null {
  for (const a of CONVERSION_ACTIONS) if (typeof actions[a] === "number") return { action: a, value: actions[a] };
  return null;
}

// ── best time to post ────────────────────────────────────────────────────────────────────────────────

export const BEST_TIME_MIN_POSTS = 10;
export const BEST_TIME_MIN_PER_CELL = 3;
const IST_MIN = 330;

export interface TimedSample {
  publishedAt: Date;
  /** Engagement rate in percent for the post (null samples are not used). */
  rate: number | null;
}
export interface Slot {
  weekday: number; // 0 = Sunday
  hour: number;
  posts: number;
  avgRate: number;
}
export type BestTimeResult = { ok: true; used: number; slots: Slot[]; best: Slot[] } | { ok: false; used: number; reason: string };

/** Weekday and hour are read in IST (the product is India-only). */
export function istParts(d: Date): { weekday: number; hour: number } {
  const t = new Date(d.getTime() + IST_MIN * 60_000);
  return { weekday: t.getUTCDay(), hour: t.getUTCHours() };
}

export function bestTimeSlots(samples: TimedSample[]): BestTimeResult {
  const used = samples.filter((s): s is TimedSample & { rate: number } => s.rate !== null && Number.isFinite(s.rate) && !Number.isNaN(s.publishedAt.getTime()));
  if (used.length < BEST_TIME_MIN_POSTS) return { ok: false, used: used.length, reason: `Not enough data yet: ${used.length} published post${used.length === 1 ? "" : "s"} with synced results (at least ${BEST_TIME_MIN_POSTS} are needed).` };
  const cells = new Map<string, { weekday: number; hour: number; sum: number; n: number }>();
  for (const s of used) {
    const { weekday, hour } = istParts(s.publishedAt);
    const k = `${weekday}:${hour}`;
    const c = cells.get(k) ?? { weekday, hour, sum: 0, n: 0 };
    c.sum += s.rate;
    c.n++;
    cells.set(k, c);
  }
  const slots: Slot[] = [...cells.values()].map((c) => ({ weekday: c.weekday, hour: c.hour, posts: c.n, avgRate: round(c.sum / c.n, 2) ?? 0 }));
  const reliable = slots.filter((s) => s.posts >= BEST_TIME_MIN_PER_CELL).sort((a, b) => b.avgRate - a.avgRate || b.posts - a.posts || a.weekday - b.weekday || a.hour - b.hour);
  if (!reliable.length) return { ok: false, used: used.length, reason: `Your posts are spread too thinly across days and hours: no weekday and hour has ${BEST_TIME_MIN_PER_CELL} posts yet.` };
  return { ok: true, used: used.length, slots, best: reliable.slice(0, 3) };
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
