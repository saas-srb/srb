import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

/** Company-timezone date helpers shared by the catalog and the query translator. */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The company's time zone: the one chosen in setup (profile), else the platform default it was created with, else Asia/Kolkata. Reads the company's own registry row only. */
export async function companyTimezone(): Promise<string> {
  try {
    const doc = await (await getPlatformDb()).collection<{ _id: string; timezone?: string; profile?: { timezone?: string } }>("companies").findOne({ _id: await currentCompanyId() }, { projection: { timezone: 1, "profile.timezone": 1 } });
    const tz = doc?.profile?.timezone || doc?.timezone;
    return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/** yyyy-mm-dd of an instant in a time zone. */
export function isoDay(d: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** True when `s` is a real calendar date (rejects 2026-02-31). */
export function isRealDay(s: string): boolean {
  if (!ISO_DAY.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** The instant a calendar day starts in a time zone. */
export function zonedDayStart(day: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const utcGuess = Date.UTC(y, m - 1, d);
  const offsetAt = (t: number) => {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(t));
    const g = (type: string) => Number(p.find((x) => x.type === type)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - t;
  };
  let t = utcGuess - offsetAt(utcGuess);
  t = utcGuess - offsetAt(t); // second pass settles zones whose offset changes that day
  return new Date(t);
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
