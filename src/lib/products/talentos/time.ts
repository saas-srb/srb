/**
 * Pure date/time helpers for the HRMS time & attendance layer. No I/O — safe to
 * import from client components. All logic runs on `"yyyy-mm-dd"` date strings
 * and `"HH:mm"` clock strings (the org runs a single timezone).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isDateString(v: unknown): v is string {
  return typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}
export function isTimeString(v: unknown): v is string {
  return typeof v === "string" && TIME_RE.test(v);
}

/** Minutes since midnight for a "HH:mm" string. */
export function parseHHmm(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function formatMinutesAsDuration(mins: number): string {
  const sign = mins < 0 ? "-" : "";
  const abs = Math.abs(Math.round(mins));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** UTC-noon Date for a date string — avoids any local-tz date rollover. */
export function dateStringToUtc(date: string): Date {
  return new Date(`${date}T12:00:00Z`);
}

export function utcToDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function todayDateString(): string {
  return utcToDateString(new Date());
}

/** Day of week (0=Sun) for a date string. */
export function dayOfWeek(date: string): number {
  return dateStringToUtc(date).getUTCDay();
}

/** Inclusive list of date strings from `from` to `to`. */
export function eachDateString(from: string, to: string): string[] {
  const out: string[] = [];
  const start = dateStringToUtc(from);
  const end = dateStringToUtc(to);
  for (let t = start.getTime(); t <= end.getTime(); t += 86400000) {
    out.push(utcToDateString(new Date(t)));
  }
  return out;
}

export function addDays(date: string, days: number): string {
  return utcToDateString(new Date(dateStringToUtc(date).getTime() + days * 86400000));
}

/** First and last date string of a "yyyy-mm" month. */
export function monthBounds(month: string): { from: string; to: string; year: number; monthIndex: number } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from, to: `${month}-${String(last).padStart(2, "0")}`, year: y, monthIndex: m - 1 };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/**
 * Wall-clock date + time *right now* in the org's timezone. Used for
 * employee clock-in/out — the one place we need a real timezone. Falls back to
 * UTC if the timezone string is invalid.
 */
export function nowInOrgTz(timezone: string): { date: string; time: string } {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
    const hour = parts.hour === "24" ? "00" : parts.hour;
    return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${hour}:${parts.minute}` };
  } catch {
    const d = new Date();
    return { date: d.toISOString().slice(0, 10), time: d.toISOString().slice(11, 16) };
  }
}
