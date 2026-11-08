/**
 * Document number patterns: `{PREFIX}/{FY}/{SEQ}` by default. Pure and client-safe (the settings form previews with it).
 *
 * Tokens: `{PREFIX}` the series prefix, `{FY}` the Indian financial year April to March ("2026-27"), `{YYYY}` the calendar year, `{MM}` the
 * calendar month, `{SEQ}` or `{SEQ:n}` the running number padded to n digits (4 when n is omitted). The counter restarts when the period
 * in the pattern changes: every financial year with `{FY}`, every month with `{MM}`, every calendar year with only `{YYYY}`.
 */

import { indiaDateParts } from "@/lib/products/playbook-ai/variables-registry";

export const DEFAULT_NUMBER_PATTERN = "{PREFIX}/{FY}/{SEQ}";
export const DEFAULT_NUMBER_PREFIX = "DOC";
export const PREFIX_RE = /^[A-Z0-9][A-Z0-9-]{0,15}$/;
export const SERIES_RE = /^[a-z][a-z0-9_.-]{0,39}$/;
const PATTERN_CHARS = /^[A-Za-z0-9/_\-.{}:# ]+$/;
const TOKEN_RE = /\{([A-Z]+)(?::(\d+))?\}/g;
export const MAX_NUMBER_LENGTH = 60;

export function validatePattern(pattern: unknown): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof pattern !== "string" || pattern.trim() === "") return { ok: false, error: "The number pattern is required." };
  const p = pattern.trim();
  if (p.length > 60 || !PATTERN_CHARS.test(p)) return { ok: false, error: "Use letters, digits and / - _ . # in the pattern (up to 60 characters)." };
  const stripped = p.replace(TOKEN_RE, "");
  if (/[{}]/.test(stripped)) return { ok: false, error: "A { or } is not part of a known token." };
  let seq = 0;
  for (const m of p.matchAll(TOKEN_RE)) {
    const [, name, arg] = m;
    if (!["PREFIX", "FY", "YYYY", "MM", "SEQ"].includes(name)) return { ok: false, error: `Unknown token {${name}}. Use {PREFIX}, {FY}, {YYYY}, {MM} and {SEQ}.` };
    if (arg !== undefined && name !== "SEQ") return { ok: false, error: `{${name}} takes no number.` };
    if (name === "SEQ") {
      seq++;
      if (arg !== undefined && (Number(arg) < 1 || Number(arg) > 10)) return { ok: false, error: "{SEQ:n} needs n from 1 to 10." };
    }
  }
  if (seq !== 1) return { ok: false, error: "The pattern needs exactly one {SEQ}." };
  return { ok: true, value: p };
}

/** The period that restarts the counter, e.g. "2026-27", "2026-11", "2026" or "all". */
export function periodKey(pattern: string, now: Date): string {
  const d = indiaDateParts(now);
  if (pattern.includes("{MM}")) return `${d.year}-${String(d.monthIndex + 1).padStart(2, "0")}`;
  if (pattern.includes("{FY}")) return d.financialYear;
  if (pattern.includes("{YYYY}")) return String(d.year);
  return "all";
}

/** Renders a number. `seq` is the running number; the date is read in Indian time. */
export function formatDocNumber(pattern: string, prefix: string, seq: number, now: Date): string {
  const d = indiaDateParts(now);
  return pattern.replace(TOKEN_RE, (_m, name: string, arg?: string) => {
    switch (name) {
      case "PREFIX": return prefix;
      case "FY": return d.financialYear;
      case "YYYY": return String(d.year);
      case "MM": return String(d.monthIndex + 1).padStart(2, "0");
      default: return String(seq).padStart(arg ? Number(arg) : 4, "0");
    }
  });
}
