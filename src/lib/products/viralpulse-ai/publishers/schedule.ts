/**
 * Pure time helpers. `scheduledAt` is always stored as a UTC instant; the zone the person picked is stored next to it only to display it back.
 * No dependencies: DST is handled with Intl.
 */

export const DEFAULT_TIMEZONE = "Asia/Kolkata";

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Offset (ms) of `tz` from UTC at the instant `utc`. */
function offsetAt(utc: number, tz: string): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(new Date(utc));
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - Math.floor(utc / 1000) * 1000;
}

export class LocalTimeError extends Error {}

/**
 * "2026-03-29T01:30" in Europe/Berlin -> the UTC instant. A wall-clock time that doesn't exist (spring-forward gap) is rejected;
 * one that happens twice (fall-back) resolves to the first occurrence, which is what calendars do.
 */
export function zonedToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(local.trim());
  if (!m) throw new LocalTimeError("Use the format YYYY-MM-DDTHH:mm.");
  if (!isValidTimezone(tz)) throw new LocalTimeError(`"${tz}" isn't a known time zone.`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0));
  const asUtc = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  const candidates = new Set<number>();
  for (const guess of [asUtc - offsetAt(asUtc, tz), asUtc - offsetAt(asUtc - 86_400_000, tz), asUtc - offsetAt(asUtc + 86_400_000, tz)]) {
    if (asUtc === guess + offsetAt(guess, tz)) candidates.add(guess);
  }
  if (candidates.size === 0) throw new LocalTimeError(`${local} doesn't exist in ${tz} (clocks skip forward at that time). Pick a time after the change.`);
  return new Date(Math.min(...candidates));
}

export function formatInZone(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: tz, dateStyle: "medium", timeStyle: "short" }).format(date) + ` (${tz})`;
}

export interface ScheduleCheck {
  ok: boolean;
  message?: string;
  fix?: string;
  nativeOk: boolean;
}

/** Our scheduler runs every 5 minutes, so a time less than a minute ahead is refused; native holds need 10 minutes .. 29 days (Facebook, YouTube publishAt). */
export function checkSchedule(at: Date, now: Date): ScheduleCheck {
  const ahead = at.getTime() - now.getTime();
  if (Number.isNaN(at.getTime())) return { ok: false, message: "That isn't a valid date and time.", fix: "Pick a date and time.", nativeOk: false };
  if (ahead < 60_000) return { ok: false, message: "The time is in the past or less than a minute away.", fix: "Pick a later time, or use Publish now.", nativeOk: false };
  if (ahead > 365 * 86_400_000) return { ok: false, message: "That's more than a year ahead.", fix: "Pick a date within a year.", nativeOk: false };
  return { ok: true, nativeOk: ahead > 10 * 60_000 && ahead < 29 * 86_400_000 };
}

const LANG: Record<string, string> = { english: "en", hindi: "hi", hinglish: "hi", marathi: "mr", gujarati: "gu", bengali: "bn", tamil: "ta", telugu: "te", kannada: "kn", malayalam: "ml", punjabi: "pa", urdu: "ur", odia: "or", assamese: "as" };
export function languageCodeFor(language: string): string {
  const k = language.trim().toLowerCase();
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(k)) return k;
  return LANG[k.split(/[\s(,]/)[0]] ?? "en";
}
