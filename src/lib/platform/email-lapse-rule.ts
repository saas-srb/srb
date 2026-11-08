/** The 30-day email-verification deadline (pure; see `email-lapse.ts` for where it is read and enforced). */

export const VERIFY_WINDOW_DAYS = 30;
/**
 * Companies registered before this rule existed get the full window counted from here, not from their (older) registration date,
 * so switching it on never locks anyone out the same day.
 */
export const VERIFY_ENFORCED_FROM = new Date("2026-10-25T00:00:00Z");

const DAY_MS = 86_400_000;

/** When the company's email must be verified by: 30 days after registration (or after the rule began, whichever is later). */
export function verifyDeadline(createdAt: Date, dueAt?: Date | null): Date {
  if (dueAt) return dueAt; // set by hand on the company (Platform Console / scripts): wins over the rule
  return new Date(Math.max(createdAt.getTime(), VERIFY_ENFORCED_FROM.getTime()) + VERIFY_WINDOW_DAYS * DAY_MS);
}

/** Whole days left, rounded up (0 once the deadline has passed). */
export function verifyDaysLeft(createdAt: Date, now: Date, dueAt?: Date | null): number {
  return Math.max(0, Math.ceil((verifyDeadline(createdAt, dueAt).getTime() - now.getTime()) / DAY_MS));
}

export interface LapseInput {
  createdAt: Date;
  dueAt?: Date | null;
  now: Date;
  /** At least one Director has a verified address. A company with nobody unverified counts as verified. */
  verified: boolean;
  /** The platform owner and the public demo company are never put on hold. */
  exempt: boolean;
}

export function isEmailLapsed(i: LapseInput): boolean {
  return !i.exempt && !i.verified && i.now.getTime() >= verifyDeadline(i.createdAt, i.dueAt).getTime();
}

export interface EmailLapse {
  /** Unverified and the deadline has passed: the workspace is on hold. */
  lapsed: boolean;
  /** Unverified but still inside the window. */
  pending: boolean;
  daysLeft: number;
  deadline: Date;
}

/** Paths that stay open while on hold: the page that explains it, verification, sign-in/out and the relay they use. */
export const LAPSE_OPEN_PATH = /^\/(commandos\/(verify-required|verify-email|login|logout|change-password|forgot-password|reset-password)|api\/(secure|account\/session|client-error)|_next)(\/|$)/i;
