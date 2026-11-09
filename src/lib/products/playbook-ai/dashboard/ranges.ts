/** Date ranges for the dashboard, in Indian Standard Time (UTC+5:30, no daylight saving). Pure. */
import type { DateRange, RangeKey } from "@/lib/products/playbook-ai/dashboard/types";

export const IST_OFFSET_MS = 19_800_000;
export const DAY_MS = 86_400_000;

/** Start (00:00 IST) of the IST day that contains `ms`. */
export const istDayStart = (ms: number): number => Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;

/** Start of the Indian financial year (1 April, 00:00 IST) that contains `ms`. */
export function fyStart(ms: number): number {
  const d = new Date(ms + IST_OFFSET_MS);
  const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  return Date.UTC(y, 3, 1) - IST_OFFSET_MS;
}
export const fyLabel = (ms: number): string => { const y = new Date(fyStart(ms) + IST_OFFSET_MS).getUTCFullYear(); return `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`; };

/** Start of the IST week (Monday) that contains `ms`. */
export function weekStart(ms: number): number {
  const day = istDayStart(ms);
  const dow = new Date(day + IST_OFFSET_MS).getUTCDay(); // 0 = Sunday
  return day - ((dow + 6) % 7) * DAY_MS;
}

const parseDay = (s: string | undefined): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return null;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - IST_OFFSET_MS;
  return Number.isFinite(t) ? t : null;
};

export const RANGE_KEYS: readonly RangeKey[] = ["today", "7", "30", "90", "month", "fy", "custom"];
export const MAX_CUSTOM_DAYS = 366;

/**
 * The range to report on and the equally long period before it (for the change figures). "Last N days" ends now and includes today; "This FY"
 * runs from 1 April to now; a custom range is whole IST days (from the start of `from` to the end of `to`), at most 366 days, and falls back to
 * the last 30 days when the dates are missing or wrong.
 */
export function resolveRange(key: string | undefined, now: number, custom?: { from?: string; to?: string }): DateRange {
  const today = istDayStart(now);
  const mk = (k: RangeKey, from: number, to: number, label: string): DateRange => {
    const len = to - from;
    return { key: k, from, to, prevFrom: from - len, prevTo: from, label, days: Math.max(Math.ceil(len / DAY_MS - 1e-6), 1) };
  };
  if (key === "today") return mk("today", today, now, "Today");
  if (key === "month") {
    const d = new Date(now + IST_OFFSET_MS);
    return mk("month", Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - IST_OFFSET_MS, now, "This month");
  }
  if (key === "7" || key === "30" || key === "90") {
    const n = Number(key);
    return mk(key, today - (n - 1) * DAY_MS, now, `Last ${n} days`);
  }
  if (key === "fy") return mk("fy", fyStart(now), now, `This financial year (${fyLabel(now)})`);
  if (key === "custom") {
    const a = parseDay(custom?.from), b = parseDay(custom?.to);
    if (a !== null && b !== null && b >= a && (b - a) / DAY_MS < MAX_CUSTOM_DAYS) {
      const to = Math.min(b + DAY_MS, now);
      if (to > a) return mk("custom", a, to, `${custom!.from} to ${custom!.to}`);
    }
  }
  return mk("30", today - 29 * DAY_MS, now, "Last 30 days");
}
