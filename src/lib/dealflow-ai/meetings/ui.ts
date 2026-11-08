import type { MeetingView } from "@/lib/dealflow-ai/meetings/types";

/** Pure helpers for the meetings screens (client-safe). */

export type Bucket = "live" | "upcoming" | "past";

export function endOf(m: Pick<MeetingView, "scheduledAt" | "durationMinutes">): number {
  return new Date(m.scheduledAt).getTime() + m.durationMinutes * 60_000;
}

/** Live now / upcoming / past. A scheduled meeting whose time has gone by without being started is "past" (missed). */
export function bucketOf(m: Pick<MeetingView, "status" | "scheduledAt" | "durationMinutes">, now = Date.now()): Bucket {
  if (m.status === "live") return "live";
  if (m.status === "scheduled" && endOf(m) >= now) return "upcoming";
  return "past";
}

export function formatWhen(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}
export function formatTime(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}
export function formatLong(iso: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short", timeZone }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** yyyy-mm-dd of the instant in a time zone. */
export function dayKey(iso: string | number | Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone }).format(new Date(iso));
  return parts;
}

export function initials(name: string): string {
  const w = name.trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w.length > 1 ? (w[w.length - 1][0] ?? "") : "")).toUpperCase() || "?";
}

function offsetMinutes(utcMs: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p = Object.fromEntries(dtf.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return (asUtc - Math.floor(utcMs / 1000) * 1000) / 60_000;
}

/** "2026-12-01" + "15:30" in a time zone -> the UTC instant. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m || !t) return null;
  const naive = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2]));
  let guess = naive - offsetMinutes(naive, timeZone) * 60_000;
  guess = naive - offsetMinutes(guess, timeZone) * 60_000;
  const d = new Date(guess);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The instant as date/time inputs in a time zone. */
export function utcToZoned(iso: string, timeZone: string): { date: string; time: string } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

export interface GuestDraft {
  name: string;
  email: string;
  phone: string;
  company: string;
}

const EMAIL_IN_TEXT = /[^\s<>,;"']+@[^\s<>,;"']+\.[^\s<>,;"']+/;
const PHONE_IN_TEXT = /\+?\d[\d\s().-]{6,}\d/;

/**
 * Turns a pasted list into guests. One person per line; fields separated by commas, tabs or semicolons, or "Name <email>".
 * Recognises an email and a phone number wherever they are; the first other text is the name and the next is the company.
 */
export function parseGuestList(text: string): GuestDraft[] {
  const out: GuestDraft[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const angle = /^(.*?)<([^>]+@[^>]+)>(.*)$/.exec(line);
    let name = "", email = "", phone = "", company = "";
    const parts = (angle ? [angle[1], angle[2], ...angle[3].split(/[,;\t]/)] : line.split(/[,;\t]/)).map((s) => s.trim()).filter(Boolean);
    const rest: string[] = [];
    for (const part of parts) {
      const e = EMAIL_IN_TEXT.exec(part);
      if (e && !email) { email = e[0].toLowerCase(); const left = part.replace(e[0], "").trim(); if (left) rest.push(left); continue; }
      if (!phone && PHONE_IN_TEXT.test(part) && part.replace(/[\d\s().+-]/g, "") === "") { phone = part; continue; }
      rest.push(part);
    }
    name = rest[0] ?? "";
    company = rest[1] ?? "";
    if (!name && email) name = email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    if (name || email) out.push({ name, email, phone, company });
  }
  return out;
}

/** Month grid starting Monday: 6 weeks of day cells for `year`/`month` (0-based). */
export function monthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(year, month, 1 - lead + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

export function weekDays(anchor: Date): Date[] {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
}

export const localDayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const STATUS_STYLE: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-sky-500/12 text-sky-700 dark:text-sky-300 ring-sky-500/25" },
  live: { label: "Live now", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30" },
  ended: { label: "Ended", className: "bg-muted text-muted-foreground ring-border" },
  cancelled: { label: "Cancelled", className: "bg-rose-500/12 text-rose-700 dark:text-rose-300 ring-rose-500/25" },
};
