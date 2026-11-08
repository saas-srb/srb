/** Pure date helpers of the posts calendar. Days are `YYYY-MM-DD` keys read on the wall clock of the company's time zone. */
import { localInZone } from "./helpers";
import { zonedToUtc } from "@/lib/products/viralpulse-ai/publishers/schedule";

const pad = (n: number) => String(n).padStart(2, "0");
const keyOf = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const parse = (key: string) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const isDayKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(parse(v).getTime());
export const isMonthKey = (v: unknown): v is string => typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export const addDays = (key: string, n: number) => keyOf(new Date(parse(key).getTime() + n * 86_400_000));

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const dow = (parse(key).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}
export const weekDays = (key: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(weekStart(key), i));

/** The 42 days (6 Monday-first weeks) shown for a month. */
export function monthDays(month: string): string[] {
  const first = `${month}-01`;
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}
export const monthOf = (dayKey: string) => dayKey.slice(0, 7);

/** The day (in `tz`) an instant falls on. */
export const dayKeyIn = (d: Date, tz: string) => localInZone(d, tz).slice(0, 10);

/** The UTC instants that bound a list of day keys (start of the first day, start of the day after the last). */
export function rangeOf(days: string[], tz: string): { from: Date; to: Date } {
  return { from: zonedToUtc(`${days[0]}T00:00`, tz), to: zonedToUtc(`${addDays(days[days.length - 1], 1)}T00:00`, tz) };
}

export function timeIn(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
}
