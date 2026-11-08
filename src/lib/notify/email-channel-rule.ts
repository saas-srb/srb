import { PUSH_CATEGORY_META, type PushCategory, type PushPreferences } from "@/lib/push/categories";

/** Rules of the notification EMAIL channel (pure: shared by the sender and the tests). */

/** Whether this person's saved choices (or the defaults) let a notification of `category` reach their inbox. */
export function wantsEmail(prefs: Pick<PushPreferences, "email"> | null | undefined, category: PushCategory): boolean {
  const e = prefs?.email;
  if (!e) return false;
  return e.enabled && e.categories[category] === true;
}

/** Emails one person can get from notifications per hour / per day. Alerts get more room (a failing payment must not be silenced by a busy hour). */
export function emailCaps(category: PushCategory): { perHour: number; perDay: number } {
  return PUSH_CATEGORY_META[category].urgent ? { perHour: 40, perDay: 150 } : { perHour: 15, perDay: 60 };
}

/** The hour a counter belongs to (UTC): `2026102507`. */
export const hourKey = (d: Date) => d.toISOString().slice(0, 13).replace(/\D/g, "");
export const dayKey = (d: Date) => d.toISOString().slice(0, 10).replace(/\D/g, "");

/** `[Acme] Leave approved`, one line, no control characters, at most 150 characters. */
export function emailSubject(brand: string, title: string): string {
  const clean = (s: string) => s.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const subject = `${brand ? `[${clean(brand)}] ` : ""}${clean(title)}`.trim();
  return subject.length > 150 ? `${subject.slice(0, 147)}…` : subject || "Notification";
}

/** A same-site path only (never an off-site link in an email we send under the company's name). */
export function safeEmailPath(url: string | null | undefined, fallback: string): string {
  const u = (url ?? "").trim();
  return u.startsWith("/") && !u.startsWith("//") && !u.includes("\\") && !/[\r\n]/.test(u) && u.length <= 500 ? u : fallback;
}
