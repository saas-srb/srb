import { diffScopes, type AccountProvider, type AccountStatus } from "./types";

/** Days of warning before a login that cannot renew itself stops working. Notifications go out at each of these marks. */
export const EXPIRY_WARN_DAYS = [14, 7, 3, 1] as const;
export const EXPIRY_WARN_WINDOW_DAYS = EXPIRY_WARN_DAYS[0];
const DAY = 86_400_000;

export interface StatusInput {
  provider: AccountProvider;
  now: Date;
  connectionStatus: "active" | "expired" | "revoked";
  tokenExpiresAt: Date | null;
  dataAccessExpiresAt: Date | null;
  refreshable: boolean;
  scopes: string[];
  disconnected?: boolean;
}

/** The date after which the person has to log in again (the earlier of token expiry and Meta's data-access expiry), or null. */
export function effectiveExpiry(i: Pick<StatusInput, "tokenExpiresAt" | "dataAccessExpiresAt" | "refreshable">): Date | null {
  // A login that renews itself is never "about to expire" from the person's point of view; only its refresh token can lapse (shown as revoked).
  const dates = [i.refreshable ? null : i.tokenExpiresAt, i.dataAccessExpiresAt].filter((d): d is Date => d instanceof Date);
  return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
}

export function daysUntil(date: Date | null, now: Date): number | null {
  return date ? Math.floor((date.getTime() - now.getTime()) / DAY) : null;
}

/** Revoked > expired > missing scope > expiring > healthy. Pure, so the sweep, the pages and the tests agree. */
export function computeStatus(i: StatusInput): AccountStatus {
  if (i.disconnected || i.connectionStatus === "revoked") return "revoked";
  const exp = effectiveExpiry(i);
  if (i.connectionStatus === "expired" || (exp && exp.getTime() <= i.now.getTime())) return "expired";
  if (diffScopes(i.provider, i.scopes).missingRequired.length) return "missing_scope";
  if (exp && exp.getTime() - i.now.getTime() <= EXPIRY_WARN_WINDOW_DAYS * DAY) return "expiring";
  return "healthy";
}

/** The warning mark (14, 7, 3 or 1) the remaining time has reached, or null when none. */
export function warnBucket(daysLeft: number | null): number | null {
  if (daysLeft === null || daysLeft < 0) return null;
  const hit = [...EXPIRY_WARN_DAYS].reverse().find((d) => daysLeft <= d);
  return hit ?? null;
}

export const STATUS_LABEL: Record<AccountStatus, string> = { healthy: "Healthy", expiring: "Expiring soon", expired: "Expired", revoked: "Revoked", missing_scope: "Missing permission" };
