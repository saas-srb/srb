import { PURPOSE_BY_KEY } from "@/lib/products/agentos/calls/purposes";
import { cleanContextValue } from "@/lib/products/agentos/calls/context";
import { normalizeE164 } from "@/lib/products/agentos/calls/phone";
import type { CallDoc } from "@/lib/products/agentos/calls/types";

/**
 * What a product stores about a settled AI call, and how it builds the values it passes to the call dialog. Pure (client-safe),
 * shared by TalentOS and SprintOS. The entry is a plain snapshot kept in its own field next to the record: it never touches
 * anything a person typed, and the call record in AgentOS stays the source of truth.
 */

export interface AiCallField {
  key: string;
  label: string;
  value: string;
}

export interface AiCallEntry {
  callId: string;
  at: string;
  purpose: string;
  purposeLabel: string;
  status: string;
  outcome: string | null;
  title: string | null;
  summary: string | null;
  durationSecs: number | null;
  calledBy: string | null;
  fields: AiCallField[];
}

const FIELDS_MAX = 25;
const SUMMARY_MAX = 2000;

const text = (v: unknown, max: number) => (typeof v === "string" ? v.normalize("NFKC").replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The write-back snapshot for a settled call. Values come from the agent's own data fields, labelled as the company named them. */
export function buildAiCallEntry(call: Pick<CallDoc, "_id" | "purpose" | "status" | "outcome" | "summary" | "summaryTitle" | "durationSecs" | "endedAt" | "updatedAt" | "initiatedBy" | "collected">): AiCallEntry {
  const at = call.endedAt ?? call.updatedAt ?? new Date();
  const fields: AiCallField[] = [];
  for (const c of Array.isArray(call.collected) ? call.collected : []) {
    const value = text(c?.value, 500);
    const key = text(c?.key, 40);
    if (!key || !value) continue; // empty answers are not written
    fields.push({ key, label: text(c.label, 80) || key, value });
    if (fields.length >= FIELDS_MAX) break;
  }
  return {
    callId: call._id,
    at: at.toISOString(),
    purpose: call.purpose,
    purposeLabel: PURPOSE_BY_KEY.get(call.purpose)?.label ?? call.purpose,
    status: call.status,
    outcome: call.outcome ?? null,
    title: text(call.summaryTitle, 120) || null,
    summary: text(call.summary, SUMMARY_MAX) || null,
    durationSecs: typeof call.durationSecs === "number" ? call.durationSecs : null,
    calledBy: call.initiatedBy?.email ?? null,
    fields,
  };
}

/** Keeps only the named keys with a non-empty cleaned value. Anything not listed (money, notes, addresses…) can never get through. */
export function pickContext(source: Record<string, unknown>, allowed: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of allowed) {
    const v = cleanContextValue(source[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** True when two phone numbers are the same full international number. Numbers that are not valid E.164 never match. */
export function samePhone(a: unknown, b: unknown): boolean {
  const x = normalizeE164(a);
  return Boolean(x) && x === normalizeE164(b);
}

/**
 * A regex that finds a number however it was typed on a record ("+91 98765-43210", "098765 43210", "9876543210"): the last ten digits of the
 * full number with any separators between them. It never misses a stored number that `phonesMatch` would accept, so a query that uses it and
 * then verifies each hit with `phonesMatch` is exact at any table size (no row cap, no scan of the whole flagged list in memory).
 */
export function loosePhoneRegex(e164: string): RegExp | null {
  const full = normalizeE164(e164);
  if (!full) return null;
  const tail = full.slice(1).slice(-10);
  return new RegExp(tail.split("").join("[^0-9]*"));
}

const digitsOf = (s: string) => s.replace(/\D/g, "");

/** True when a number as stored on a record ("+91 98765-43210", "098765 43210", "9876543210") is the same line as the E.164 number. */
export function phonesMatch(stored: unknown, e164: string): boolean {
  if (typeof stored !== "string") return false;
  const full = normalizeE164(stored);
  if (full) return full === e164;
  let d = digitsOf(stored);
  if (stored.trim().startsWith("+")) return false; // a different, malformed international number
  d = d.replace(/^0+/, "");
  return d.length >= 10 && digitsOf(e164).endsWith(d);
}
