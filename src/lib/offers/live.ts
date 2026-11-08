/**
 * Client-safe live-clock helpers for every offer countdown / status chip.
 * NEVER import `server-only` here.
 *
 * Countdowns must not trust the visitor's device clock: a wrong laptop clock
 * would show a running timer for an offer the server already considers
 * expired. The active-campaign / public-offers responses carry `serverTime`,
 * and `setServerTime` stores the offset once so `nowMs()` is server-accurate.
 */

let offsetMs = 0;

export function setServerTime(serverNowMs: number): void {
  if (Number.isFinite(serverNowMs)) offsetMs = serverNowMs - Date.now();
}

export function nowMs(): number {
  return Date.now() + offsetMs;
}

export type UrgencyLevel = "upcoming" | "calm" | "soon" | "urgent" | "critical" | "ended";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

export interface Urgency {
  level: UrgencyLevel;
  /** Short label for chips, e.g. "Ending soon". Empty for calm. */
  label: string;
  /** Longer copy for banners. */
  message: string;
}

export function getUrgency(remainingMs: number): Urgency {
  if (remainingMs <= 0) return { level: "ended", label: "Ended", message: "This offer has ended." };
  if (remainingMs <= HOUR) return { level: "critical", label: "Final hour", message: "Final hour — this offer is about to expire." };
  if (remainingMs <= 6 * HOUR) return { level: "critical", label: "Last few hours", message: "Last few hours — claim it before it's gone." };
  if (remainingMs <= DAY) return { level: "urgent", label: "Expires today", message: "Offer expires today." };
  if (remainingMs <= 3 * DAY) return { level: "soon", label: "Ending soon", message: "Ending soon — claim before it's gone." };
  return { level: "calm", label: "", message: "" };
}

/** Tailwind classes per urgency level, using the design system's semantic colors. */
export const URGENCY_STYLES: Record<UrgencyLevel, { chip: string; text: string; bar: string; box: string }> = {
  upcoming: { chip: "bg-blue-500/15 text-blue-600 dark:text-blue-400", text: "text-blue-600 dark:text-blue-400", bar: "bg-blue-500", box: "border-blue-500/30" },
  calm: { chip: "bg-muted text-muted-foreground", text: "text-foreground", bar: "bg-primary", box: "border-border/50" },
  soon: { chip: "bg-amber-500/15 text-amber-600 dark:text-amber-400", text: "text-amber-600 dark:text-amber-400", bar: "bg-amber-500", box: "border-amber-500/40" },
  urgent: { chip: "bg-orange-500/15 text-orange-600 dark:text-orange-400", text: "text-orange-600 dark:text-orange-400", bar: "bg-orange-500", box: "border-orange-500/50" },
  critical: { chip: "bg-destructive/15 text-destructive", text: "text-destructive", bar: "bg-destructive", box: "border-destructive/50" },
  ended: { chip: "bg-muted text-muted-foreground", text: "text-muted-foreground", bar: "bg-muted-foreground/40", box: "border-border/50" },
};

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitDuration(ms: number): DurationParts {
  const total = Math.max(ms, 0);
  return {
    days: Math.floor(total / DAY),
    hours: Math.floor((total / HOUR) % 24),
    minutes: Math.floor((total / 60_000) % 60),
    seconds: Math.floor((total / 1000) % 60),
  };
}

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** Offer lifecycle relative to "now", evaluated with the server-accurate clock. */
export type OfferLifecycle = "upcoming" | "live" | "ended";

export function offerLifecycle(validFrom: string, validUntil: string, now: number = nowMs()): OfferLifecycle {
  if (now < new Date(validFrom).getTime()) return "upcoming";
  if (now > new Date(validUntil).getTime()) return "ended";
  return "live";
}

export interface ClaimProgress {
  claimed: number;
  limit: number | null;
  /** 0-100 when a limit exists, otherwise null. */
  percent: number | null;
  remaining: number | null;
  soldOut: boolean;
  almostGone: boolean;
}

/** Real scarcity only: progress exists solely when the admin set a `claimLimit`. */
export function claimProgress(claimed: number | undefined, limit: number | null | undefined): ClaimProgress {
  const c = Math.max(claimed ?? 0, 0);
  if (!limit || limit <= 0) return { claimed: c, limit: null, percent: null, remaining: null, soldOut: false, almostGone: false };
  const percent = Math.min(Math.round((c / limit) * 100), 100);
  const remaining = Math.max(limit - c, 0);
  return { claimed: c, limit, percent, remaining, soldOut: remaining === 0, almostGone: remaining > 0 && percent >= 80 };
}
