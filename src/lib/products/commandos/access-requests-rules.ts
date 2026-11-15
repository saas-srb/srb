/**
 * Requests for access (pure rules). A person who opens something locked can ask the company's Directors for it. The rules keep that
 * polite: one open request per person and item, a few per hour in total, a short message.
 */

export const REQUEST_LIMITS = { perHour: 5, messageMax: 300, repeatHours: 24 } as const;

export type RequestDecision =
  | { ok: true }
  | { ok: false; reason: "too_many" | "already_open"; message: string };

export function decideRequest(input: { openForItemAt: Date | null; recentCount: number; now?: Date }): RequestDecision {
  const now = input.now ?? new Date();
  if (input.openForItemAt && now.getTime() - input.openForItemAt.getTime() < REQUEST_LIMITS.repeatHours * 3_600_000) {
    return { ok: false, reason: "already_open", message: "You already asked for this. The Directors have been told; you will be notified when it is handled." };
  }
  if (input.recentCount >= REQUEST_LIMITS.perHour) {
    return { ok: false, reason: "too_many", message: "You have sent several requests in the last hour. Please wait a little before asking again." };
  }
  return { ok: true };
}

export const cleanMessage = (v: unknown): string => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, REQUEST_LIMITS.messageMax) : "");
export const cleanLabel = (v: unknown, max = 80): string => (typeof v === "string" ? v.replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

export interface LockedTarget {
  /** A Workspace item key, or "" for a product's own sidebar item. */
  itemKey: string;
  /** What the person tried to open, in plain words ("Payroll runs"). */
  label: string;
  /** The product's catalogue key (talentos, sprintos ...) or null for a Workspace item. */
  product: string | null;
  description: string | null;
}
