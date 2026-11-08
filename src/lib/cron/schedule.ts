/**
 * Five-field cron expressions in UTC (minute hour day-of-month month day-of-week), as Vercel Cron reads them (pure; no dependencies).
 * Supports `*`, lists (`1,15`), ranges (`1-5`) and steps (a star, slash and number such as every 5 minutes, or `10-50/10`); day-of-week 0–6 (Sunday = 0, 7 also Sunday). When both day
 * fields are restricted a time matches if either does, as in standard cron.
 */

interface Parsed {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

const LIMITS: [name: string, min: number, max: number][] = [["minute", 0, 59], ["hour", 0, 23], ["day of month", 1, 31], ["month", 1, 12], ["day of week", 0, 7]];

function field(text: string, [name, min, max]: (typeof LIMITS)[number]): Set<number> {
  const out = new Set<number>();
  for (const part of text.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`Invalid ${name} field "${text}"`);
    const step = m[2] ? Number(m[2]) : 1;
    if (step < 1) throw new Error(`Invalid step in ${name} field "${text}"`);
    let lo = min;
    let hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1].split("-").map(Number);
      lo = a;
      hi = b ?? (m[2] ? max : a);
    }
    if (lo < min || hi > max || lo > hi) throw new Error(`${name} out of range in "${text}"`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expr: string): Parsed {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`A cron expression has five fields, got ${parts.length}: "${expr}"`);
  const [minute, hour, dom, month, dow] = parts.map((p, i) => field(p, LIMITS[i]));
  if (dow.has(7)) dow.add(0);
  dow.delete(7);
  return { minute, hour, dom, month, dow, domAny: parts[2] === "*", dowAny: parts[4] === "*" };
}

export function isValidCron(expr: string): boolean {
  try {
    parseCron(expr);
    return true;
  } catch {
    return false;
  }
}

function matches(p: Parsed, d: Date): boolean {
  if (!p.minute.has(d.getUTCMinutes()) || !p.hour.has(d.getUTCHours()) || !p.month.has(d.getUTCMonth() + 1)) return false;
  const dom = p.dom.has(d.getUTCDate());
  const dow = p.dow.has(d.getUTCDay());
  return p.domAny && p.dowAny ? true : p.domAny ? dow : p.dowAny ? dom : dom || dow;
}

/** Whether the minute containing `at` is one the expression fires in. */
export function firesAt(expr: string, at: Date): boolean {
  const d = new Date(at);
  d.setUTCSeconds(0, 0);
  return matches(parseCron(expr), d);
}

const MINUTE = 60_000;
const YEAR_MINUTES = 366 * 24 * 60;

/** The first fire time strictly after `from` (UTC, whole minutes), or null if none within a year. */
export function nextRun(expr: string, from: Date = new Date()): Date | null {
  const p = parseCron(expr);
  let t = Math.floor(from.getTime() / MINUTE) * MINUTE + MINUTE;
  for (let i = 0; i < YEAR_MINUTES; i++, t += MINUTE) if (matches(p, new Date(t))) return new Date(t);
  return null;
}

/** The latest fire time at or before `from`, or null if none within a year. */
export function previousRun(expr: string, from: Date = new Date()): Date | null {
  const p = parseCron(expr);
  let t = Math.floor(from.getTime() / MINUTE) * MINUTE;
  for (let i = 0; i < YEAR_MINUTES; i++, t -= MINUTE) if (matches(p, new Date(t))) return new Date(t);
  return null;
}

/** A plain-language reading for the common shapes; falls back to the expression itself. */
export function describeCron(expr: string): string {
  const [min, hour, dom, month, dow] = expr.trim().split(/\s+/);
  const pad = (n: string) => n.padStart(2, "0");
  if (dom === "*" && month === "*" && dow === "*") {
    const every = /^\*\/(\d+)$/.exec(min);
    if (every && hour === "*") return `Every ${every[1]} minutes`;
    if (/^\d+$/.test(min) && hour === "*") return min === "0" ? "Every hour" : `Every hour at minute ${min}`;
    if (/^\d+$/.test(min) && /^\d+$/.test(hour)) return `Every day at ${pad(hour)}:${pad(min)} UTC`;
  }
  return `${expr} (UTC)`;
}

/** The gap between two consecutive runs, in milliseconds (taken after `from`), or null if the job never fires. */
export function intervalMs(expr: string, from: Date = new Date()): number | null {
  const a = nextRun(expr, from);
  const b = a && nextRun(expr, a);
  return a && b ? b.getTime() - a.getTime() : null;
}
