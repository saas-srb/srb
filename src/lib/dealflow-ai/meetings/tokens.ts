import { createHash, randomBytes } from "node:crypto";

/** A guest's personal join token: 32 random bytes. Shown or mailed once; only its SHA-256 is stored. */
export function generateJoinToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashJoinToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A token as the join page / API accepts it: base64url of 32 bytes (43 chars). Anything else is rejected before any database lookup. */
export function looksLikeJoinToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export const TOKEN_GRACE_MS = 2 * 60 * 60 * 1000;

/** Scheduled end of the meeting. */
export function meetingEndsAt(scheduledAt: string, durationMinutes: number): Date {
  return new Date(new Date(scheduledAt).getTime() + durationMinutes * 60_000);
}

/** A guest link works until the scheduled end plus two hours. */
export function tokenExpiry(scheduledAt: string, durationMinutes: number): Date {
  return new Date(meetingEndsAt(scheduledAt, durationMinutes).getTime() + TOKEN_GRACE_MS);
}

export type LinkState = "none" | "active" | "revoked" | "expired";

export function linkState(p: { joinTokenHash?: string | null; joinTokenExpiresAt?: string | null; joinTokenRevokedAt?: string | null }, now = new Date()): LinkState {
  if (p.joinTokenRevokedAt) return "revoked";
  if (!p.joinTokenHash) return "none";
  if (p.joinTokenExpiresAt && new Date(p.joinTokenExpiresAt).getTime() <= now.getTime()) return "expired";
  return "active";
}

export function guestLink(origin: string, roomId: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/meeting/${encodeURIComponent(roomId)}?t=${token}`;
}
