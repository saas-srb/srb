/** Shared "pending/stale" threshold: an open lead or application that hasn't
 * moved in this many days shows up in Pending Tasks and the notifications bell. */
export const STALE_DAYS = 3;

export function staleThresholdDate(now: Date = new Date()): Date {
  return new Date(now.getTime() - STALE_DAYS * 24 * 60 * 60 * 1000);
}
