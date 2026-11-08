import type { FieldDef } from "@/lib/products/viralpulse-ai/ai-field/registry";
import type { FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";

/**
 * Strict per-field validation of what the model returned. Nothing is "fixed up" beyond harmless tidying (trim, bullets,
 * `#`, case of a choice): a value that breaks its rule is rejected, and the caller asks once more with the reason.
 */

export type Checked = { ok: true; value: FieldValue; warnings: string[] } | { ok: false; reason: string };

export interface CheckEnv {
  /** Resolved maximum characters (per item for lists). */
  maxChars: number;
  /** Allowed values for enum / multi-choice fields. */
  options?: readonly string[];
}

const BULLET = /^\s*(?:[-*•–·]|\d{1,2}[.)])\s+/;

export function tidyText(s: string, multiline: boolean): string {
  let t = s.replace(/\r\n?/g, "\n").trim();
  t = t.replace(/^```[a-z]*\n?|\n?```$/gi, "").trim();
  // A model often wraps its answer in quotes; a field value never starts and ends with the same quote mark.
  if (t.length > 1 && ((t[0] === t[t.length - 1] && `"'`.includes(t[0])) || (t[0] === "“" && t[t.length - 1] === "”") || (t[0] === "‘" && t[t.length - 1] === "’"))) t = t.slice(1, -1).trim();
  if (!multiline) t = t.replace(/\s*\n+\s*/g, " ");
  else t = t.replace(/\n{3,}/g, "\n\n");
  return t;
}

export function normalizeHashtag(h: string): string {
  const core = h.trim().replace(/^#+/, "").replace(/[\s!-\/:-@[-^`{-~]/g, "");
  return core ? `#${core}` : "";
}

function dedupe(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = i.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(i);
    }
  }
  return out;
}

function matchOption(v: string, options: readonly string[]): string | null {
  const t = v.trim().toLowerCase();
  return options.find((o) => o.toLowerCase() === t) ?? null;
}

function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function validDateTime(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return false;
  return validDate(s.slice(0, 10)) && Number(s.slice(11, 13)) < 24 && Number(s.slice(14, 16)) < 60;
}

export function validateUrl(s: string): string | null {
  try {
    const u = new URL(s);
    if (u.protocol !== "https:") return null;
    if (!u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Validates one proposed value for a field. `raw` is the model's value for the field (string, string[] or number). */
export function checkValue(def: FieldDef, raw: unknown, env: CheckEnv): Checked {
  const warnings: string[] = [];
  switch (def.kind) {
    case "text":
    case "longtext": {
      if (typeof raw !== "string") return { ok: false, reason: "The value must be text." };
      const v = tidyText(raw, def.kind === "longtext");
      if (!v) return { ok: false, reason: "The value was empty." };
      if (v.length > env.maxChars) return { ok: false, reason: `The text is ${v.length} characters; the limit is ${env.maxChars}. Write it shorter.` };
      return { ok: true, value: v, warnings };
    }
    case "url": {
      if (typeof raw !== "string") return { ok: false, reason: "The value must be a web address." };
      const u = validateUrl(raw.trim());
      if (!u) return { ok: false, reason: "The value must be a full https:// address." };
      if (u.length > env.maxChars) return { ok: false, reason: `The address is longer than ${env.maxChars} characters.` };
      return { ok: true, value: u, warnings };
    }
    case "date": {
      if (typeof raw !== "string" || !validDate(raw.trim())) return { ok: false, reason: "The value must be a date written YYYY-MM-DD." };
      return { ok: true, value: raw.trim(), warnings };
    }
    case "datetime": {
      if (typeof raw !== "string" || !validDateTime(raw.trim())) return { ok: false, reason: "The value must be a date and time written YYYY-MM-DDTHH:mm." };
      return { ok: true, value: raw.trim(), warnings };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(n)) return { ok: false, reason: "The value must be a number." };
      const min = def.min ?? 0;
      const max = def.max ?? 1_000_000_000;
      if (n < min || n > max) return { ok: false, reason: `The number must be between ${min} and ${max}.` };
      return { ok: true, value: Math.round(n * 100) / 100, warnings };
    }
    case "enum": {
      if (typeof raw !== "string") return { ok: false, reason: "The value must be one of the allowed choices." };
      const options = env.options ?? [];
      const hit = options.length ? matchOption(raw, options) : null;
      if (!hit) return { ok: false, reason: `"${raw.slice(0, 60)}" is not one of the allowed choices.` };
      return { ok: true, value: hit, warnings };
    }
    case "multienum": {
      if (!Array.isArray(raw)) return { ok: false, reason: "The value must be a list of choices." };
      const options = env.options ?? [];
      const picked: string[] = [];
      for (const r of raw) {
        const hit = typeof r === "string" ? matchOption(r, options) : null;
        if (!hit) return { ok: false, reason: `"${String(r).slice(0, 60)}" is not one of the allowed choices.` };
        if (!picked.includes(hit)) picked.push(hit);
      }
      if (picked.length === 0) return { ok: false, reason: "Choose at least one." };
      const cap = def.maxItems ?? picked.length;
      if (picked.length > cap) warnings.push(`Only the first ${cap} choices were kept.`);
      return { ok: true, value: picked.slice(0, cap), warnings };
    }
    case "list": {
      if (!Array.isArray(raw)) return { ok: false, reason: "The value must be a list." };
      let items = raw.filter((x): x is string => typeof x === "string").map((x) => tidyText(x.replace(BULLET, ""), false));
      if (def.hashtags) items = items.map(normalizeHashtag);
      items = dedupe(items.filter(Boolean));
      if (items.length === 0) return { ok: false, reason: "The list was empty." };
      const tooLong = items.find((i) => i.length > env.maxChars);
      if (tooLong) return { ok: false, reason: `One item is ${tooLong.length} characters; the limit per item is ${env.maxChars}.` };
      const cap = def.maxItems ?? 50;
      if (items.length > cap) {
        warnings.push(`Only the first ${cap} items were kept.`);
        items = items.slice(0, cap);
      }
      return { ok: true, value: items, warnings };
    }
  }
}

/** Validates the 3-5 alternatives of mode `options`. Each must pass the field's own rules; duplicates are dropped. */
export function checkOptions(def: FieldDef, raw: unknown, env: CheckEnv): { ok: true; options: FieldValue[]; warnings: string[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) return { ok: false, reason: "The options must be a list." };
  const good: FieldValue[] = [];
  const seen = new Set<string>();
  let lastReason = "";
  for (const r of raw) {
    const c = checkValue(def, r, env);
    if (!c.ok) {
      lastReason = c.reason;
      continue;
    }
    const k = JSON.stringify(c.value).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    good.push(c.value);
  }
  if (good.length < 2) return { ok: false, reason: lastReason || "At least two different options are needed." };
  return { ok: true, options: good.slice(0, 5), warnings: [] };
}

export function valueToText(v: FieldValue | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (Array.isArray(v)) return v.join("\n");
  return String(v);
}

export function isBlank(v: FieldValue | null | undefined): boolean {
  return valueToText(v).trim() === "";
}
