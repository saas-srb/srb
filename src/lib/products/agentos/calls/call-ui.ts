import { inAllowedCodes, normalizeE164 } from "@/lib/products/agentos/calls/phone";
import type { CallDirection, CallStatus } from "@/lib/products/agentos/calls/types";

/** Pure helpers behind the call dialog and the Calls pages (client-safe; unit-tested in scripts/test-voice-ui-data.ts). */

// ---------------------------------------------------------------------------
// Phone field
// ---------------------------------------------------------------------------

export interface PhoneCheck {
  /** The number as it will be dialed, or null. */
  e164: string | null;
  /** Shown under the field. */
  error: string | null;
  /** True when we added the country code from the settings (so the person confirms it). */
  prefixed: boolean;
}

/**
 * Reads what the person typed. A number typed without a country code gets the company's code ONLY when the company allows exactly
 * one country (then it is unambiguous); with several, the person must type the code. Never guesses beyond that.
 */
export function checkPhoneInput(raw: string, allowedCodes: readonly string[]): PhoneCheck {
  const typed = raw.trim();
  if (!typed) return { e164: null, error: null, prefixed: false };
  let candidate = typed;
  let prefixed = false;
  if (!/^\s*(\+|00)/.test(typed) && allowedCodes.length === 1 && /^[\d\s().-]+$/.test(typed)) {
    const national = typed.replace(/[\s().-]/g, "").replace(/^0+/, "");
    if (national) {
      candidate = `${allowedCodes[0]}${national}`;
      prefixed = true;
    }
  }
  const e164 = normalizeE164(candidate);
  if (!e164) return { e164: null, error: "Enter the full number with its country code, for example +91 98765 43210.", prefixed: false };
  if (allowedCodes.length > 0 && !inAllowedCodes(e164, allowedCodes)) {
    return { e164: null, error: `Calls are allowed only to numbers starting with ${allowedCodes.join(", ")}.`, prefixed: false };
  }
  return { e164, error: null, prefixed };
}

/** "+919876543210" -> "+91 98765 43210" given the calling code; falls back to the plain number. */
export function formatPhone(e164: string, codes: readonly string[] = []): string {
  const code = [...codes].sort((a, b) => b.length - a.length).find((c) => e164.startsWith(c));
  if (!code) return e164;
  const rest = e164.slice(code.length);
  return `${code} ${rest.replace(/(\d{5})(?=\d)/g, "$1 ")}`.trim();
}

// ---------------------------------------------------------------------------
// Company time zone
// ---------------------------------------------------------------------------

const PARTS = (date: Date, timeZone: string) => {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o;
};

/** The `YYYY-MM-DDTHH:mm` a `datetime-local` input shows for `date` as seen in `timeZone`. */
export function toZonedLocal(date: Date, timeZone: string): string {
  const p = PARTS(date, timeZone);
  const z = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${z(p.year, 4)}-${z(p.month)}-${z(p.day)}T${z(p.hour)}:${z(p.minute)}`;
}

/** Turns a wall-clock `YYYY-MM-DDTHH:mm` in `timeZone` into the real instant. Null when it isn't a valid date or the zone is unknown. */
export function zonedLocalToUtc(local: string, timeZone: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  if (Number.isNaN(asUtc)) return null;
  try {
    // Two passes settle the offset across a daylight-saving change.
    let guess = asUtc;
    for (let i = 0; i < 2; i++) {
      const p = PARTS(new Date(guess), timeZone);
      const seen = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
      guess += asUtc - seen;
    }
    const back = toZonedLocal(new Date(guess), timeZone);
    return back === local ? new Date(guess) : null;
  } catch {
    return null;
  }
}

/** Date and time in the company's zone, with the zone named so nobody reads it in their own. */
export function formatInZone(iso: string | Date, timeZone: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" };
  try {
    return `${d.toLocaleString("en-IN", { ...opts, ...(timeZone ? { timeZone } : {}) })}${timeZone ? ` (${timeZone})` : ""}`;
  } catch {
    return d.toLocaleString("en-IN", opts);
  }
}

export type ScheduleCheck = { ok: true; at: Date } | { ok: false; error: string };

/** A date-time typed in the company zone must be a real moment, in the future, and no more than 90 days away (the engine's limit). */
export function checkScheduleInput(local: string, timeZone: string, now: Date = new Date()): ScheduleCheck {
  if (!local) return { ok: false, error: "Pick the date and time for the call." };
  const at = zonedLocalToUtc(local, timeZone);
  if (!at) return { ok: false, error: "That date and time isn't valid." };
  if (at.getTime() < now.getTime() + 60_000) return { ok: false, error: "Pick a time in the future." };
  if (at.getTime() - now.getTime() > 90 * 24 * 60 * 60 * 1000) return { ok: false, error: "Calls can be scheduled up to 90 days ahead." };
  return { ok: true, at };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  scheduled: "Scheduled",
  dialing: "Dialing",
  in_progress: "In progress",
  completed: "Completed",
  failed: "Failed",
  no_answer: "No answer",
  busy: "Busy",
  cancelled: "Cancelled",
};

export type StatusTone = "neutral" | "info" | "ok" | "warn" | "bad";
export const CALL_STATUS_TONE: Record<CallStatus, StatusTone> = {
  scheduled: "info",
  dialing: "warn",
  in_progress: "warn",
  completed: "ok",
  failed: "bad",
  no_answer: "warn",
  busy: "warn",
  cancelled: "neutral",
};

export type CallTab = "all" | "upcoming" | "attention";
export const CALL_TABS: { key: CallTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "upcoming", label: "Upcoming" },
  { key: "attention", label: "Needs attention" },
];
export const isCallTab = (v: unknown): v is CallTab => v === "all" || v === "upcoming" || v === "attention";

export const ATTENTION_STATUSES: readonly CallStatus[] = ["failed", "no_answer", "busy"];

/** Which tabs a call belongs to. Only phone calls we placed can need a retry. */
export function tabsOf(c: { status: CallStatus; direction: CallDirection }): CallTab[] {
  const tabs: CallTab[] = ["all"];
  if (c.status === "scheduled") tabs.push("upcoming");
  if (c.direction === "outbound" && ATTENTION_STATUSES.includes(c.status)) tabs.push("attention");
  return tabs;
}

/** What a person can do to a call from the list. The server re-checks all of it. */
export function callActions(c: { status: CallStatus; direction: CallDirection; mine: boolean }, viewer: { canCall: boolean; isManager: boolean }) {
  const own = c.mine || viewer.isManager;
  return {
    cancel: viewer.canCall && own && c.status === "scheduled",
    reschedule: viewer.canCall && own && c.status === "scheduled",
    retry: viewer.canCall && own && c.direction === "outbound" && ATTENTION_STATUSES.includes(c.status),
  };
}

// ---------------------------------------------------------------------------
// Collected data
// ---------------------------------------------------------------------------

const humanize = (key: string) => key.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/^./, (s) => s.toUpperCase());

/** Labels for what a call collected: the agent's own field labels first, then the label stored with the value, then the key made readable. */
export function labelCollected(collected: readonly { key: string; label: string; value: string }[], fields: readonly { key: string; label: string }[] | null | undefined): { key: string; label: string; value: string }[] {
  const byKey = new Map((fields ?? []).map((f) => [f.key, f.label]));
  return collected.map((c) => ({ key: c.key, value: c.value, label: byKey.get(c.key) || (c.label && c.label !== c.key ? c.label : humanize(c.key)) }));
}

/** Short wording for the control history. */
export function describeControlStep(step: { from: "ai" | "human"; to: "ai" | "human" }): string {
  if (step.from === "ai" && step.to === "human") return "A person took over from the AI";
  if (step.from === "human" && step.to === "ai") return "Handed back to the AI";
  return `Changed from ${step.from} to ${step.to}`;
}
