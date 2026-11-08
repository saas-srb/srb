import { PURPOSE_BY_KEY, variablesFor } from "@/lib/products/agentos/calls/purposes";

/**
 * What a caller may tell the agent about a call. Only the variables the purpose declares are accepted; everything else is dropped.
 * Values are plain one-line text: control characters, template braces and angle brackets are removed and the length is capped, so
 * a lead's free-text field can't smuggle instructions or break out of the {{variable}} slot. Pure.
 */

export const CONTEXT_VALUE_MAX = 300;
export const CONTEXT_NOTES_MAX = 500;

export function cleanContextValue(v: unknown, max = CONTEXT_VALUE_MAX): string {
  if (typeof v === "number" && Number.isFinite(v)) v = String(v);
  if (typeof v === "boolean") v = v ? "yes" : "no";
  if (typeof v !== "string") return "";
  return v
    .normalize("NFKC")
    .replace(/[\p{C}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/[{}<>\x60]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** The dynamic variables for a call: every variable the purpose declares (blank when not given), nothing else. */
export function sanitizeContext(purpose: string, raw: unknown, defaults: Record<string, string> = {}): Record<string, string> {
  const src = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  if (!PURPOSE_BY_KEY.has(purpose)) return out;
  for (const v of variablesFor([purpose])) {
    const given = Object.prototype.hasOwnProperty.call(src, v.key) ? cleanContextValue(src[v.key], v.key === "notes" ? CONTEXT_NOTES_MAX : CONTEXT_VALUE_MAX) : "";
    out[v.key] = given || cleanContextValue(defaults[v.key] ?? "");
  }
  return out;
}
