import type { SopStatus } from "@/lib/products/playbook-ai/constants";

/**
 * Pure lifecycle helpers. The stored `status` moves Draft → Published →
 * Active → Archived on user actions; two transitions are date-driven and are
 * derived on read (and persisted by `sweepStatuses`):
 *   published → active   when the effective date arrives
 *   published/active → expired   when the expiry date passes
 */

interface DateFields {
  effectiveDate: string | null;
  expiryDate: string | null;
}

export function deriveStatus(stored: SopStatus, d: DateFields, today: string): SopStatus {
  if (stored === "draft" || stored === "archived") return stored;
  if (d.expiryDate && d.expiryDate < today) return "expired";
  if (stored === "expired") return "expired";
  if (stored === "published") return !d.effectiveDate || d.effectiveDate <= today ? "active" : "published";
  return stored;
}

/** Live = has a published version that readers can open. */
export function isLive(status: SopStatus): boolean {
  return status === "published" || status === "active" || status === "expired";
}

export function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T00:00:00`).getTime();
  const b = new Date(`${toIso}T00:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Review date is in the past (and the SOP is live). */
export function isReviewOverdue(s: { status: SopStatus; reviewDate: string | null }, today: string): boolean {
  return isLive(s.status) && s.status !== "expired" && !!s.reviewDate && s.reviewDate < today;
}

/** Expiry within the next `withinDays` days (not yet expired). */
export function isExpiringSoon(s: { status: SopStatus; expiryDate: string | null }, today: string, withinDays: number): boolean {
  if (!s.expiryDate || (s.status !== "active" && s.status !== "published")) return false;
  const left = daysBetween(today, s.expiryDate);
  return left >= 0 && left <= withinDays;
}
