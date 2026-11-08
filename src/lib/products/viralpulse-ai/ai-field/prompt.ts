import type { FieldDef } from "@/lib/products/viralpulse-ai/ai-field/registry";
import type { FieldMode, FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";
import type { CleanContext } from "@/lib/products/viralpulse-ai/ai-field/context";
import { valueToText } from "@/lib/products/viralpulse-ai/ai-field/validate";
import { defaultPrompt } from "@/lib/prompts/defaults";

/** The prompt and the strict JSON schema for one field request. Pure: no database, no network. */

/** The registry prompts behind a field request ("viralpulse.aifield.*"); the code asks for them with `getPrompt`, and pure callers use the built-in text. */
export const FIELD_SYSTEM_KEY = "viralpulse.aifield.system";
export const FIELD_RETRY_KEY = "viralpulse.aifield.retry";
export const MODE_KEY: Record<FieldMode, string> = {
  generate: "viralpulse.aifield.mode.generate",
  improve: "viralpulse.aifield.mode.improve",
  shorten: "viralpulse.aifield.mode.shorten",
  expand: "viralpulse.aifield.mode.expand",
  translate: "viralpulse.aifield.mode.translate",
  options: "viralpulse.aifield.mode.options",
};
/** The built-in instructions (the registry text plus its pinned rules). */
export const FIELD_SYSTEM_PROMPT = defaultPrompt(FIELD_SYSTEM_KEY);

/** Wording a caller already fetched from the registry; anything left out uses the built-in text. */
export interface FieldTexts {
  mode?: string;
  retry?: string;
}

export function languageLine(language: string | null): string {
  return language ? `Language: write in ${language}.` : "Language: write in the same language as the CURRENT value; if there is none, use the language field if present, otherwise English.";
}

export function buildFieldPrompt(p: {
  def: FieldDef;
  mode: FieldMode;
  maxChars: number;
  current: FieldValue | null;
  context: CleanContext;
  trusted: string;
  instruction?: string;
  tone?: string;
  language: string | null;
  options?: readonly string[];
  retryReason?: string;
  platformGuide?: string;
  texts?: FieldTexts;
}): string {
  const { def } = p;
  const ctxLines = Object.entries(p.context).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(" | ") : String(v)}`);
  const lines: string[] = [
    `FIELD: ${def.label} (${def.about})`,
    `TASK: ${p.texts?.mode ?? defaultPrompt(MODE_KEY[p.mode])}`,
    `HOW: ${def.instructions}`,
    languageLine(p.language),
    def.kind === "list" || def.kind === "multienum" ? `FORMAT: a list of up to ${def.maxItems ?? 20} items, each at most ${p.maxChars} characters.` : def.kind === "number" ? `FORMAT: one number${def.min !== undefined ? ` from ${def.min}` : ""}${def.max !== undefined ? ` to ${def.max}` : ""}.` : def.kind === "date" ? "FORMAT: a date written YYYY-MM-DD." : def.kind === "datetime" ? "FORMAT: a date and time written YYYY-MM-DDTHH:mm." : def.kind === "url" ? "FORMAT: a full https:// address." : `FORMAT: at most ${p.maxChars} characters${def.kind === "text" ? ", one line" : ""}.`,
  ];
  if (def.hashtags) lines.push("Each hashtag starts with # and has no spaces.");
  if (def.suggestions?.length) lines.push(`Usual choices (prefer one, or write another if none fits): ${def.suggestions.join(", ")}.`);
  if (p.options?.length) lines.push(`Allowed values (use exactly one of these${def.kind === "multienum" ? " or several" : ""}): ${p.options.join(" | ")}.`);
  if (def.estimate) lines.push("This is an ESTIMATE. State your assumptions in notes.");
  if (p.tone || def.usesTone) lines.push(`Tone: ${p.tone ?? "match the brand tone"}.`);
  if (p.instruction) lines.push(`Extra direction from the person: <data>${p.instruction}</data>`);
  if (p.platformGuide) lines.push(`Platform limits:\n${p.platformGuide}`);
  if (def.factField) lines.push("THIS FIELD HOLDS FACTS. Restructure, tidy, shorten or translate only what the person wrote or what the allowed facts state. Do not add any figure, date, price, claim or name.");
  lines.push(`ALLOWED FACTS (stored brand and company data):\n<data>${p.trusted || "none stored"}</data>`);
  lines.push(`OTHER FIELDS:\n<data>${ctxLines.length ? ctxLines.join("\n") : "none filled in"}</data>`);
  const cur = valueToText(p.current);
  if (cur.trim()) lines.push(`CURRENT value:\n<data>${cur}</data>`);
  if (p.retryReason) lines.push(p.texts?.retry ?? defaultPrompt(FIELD_RETRY_KEY, { reason: p.retryReason }));
  return lines.join("\n\n");
}

type Schema = Record<string, unknown>;
const notes: Schema = { type: "array", items: { type: "string" } };

/** Strict JSON schema (every property required) for the answer to one field request. */
export function outputSchema(def: FieldDef, mode: FieldMode, options?: readonly string[]): Schema {
  const enumItem: Schema = options?.length && options.length <= 120 ? { type: "string", enum: [...options] } : { type: "string" };
  let valueSchema: Schema;
  let key = "value";
  if (mode === "options") {
    key = "options";
    valueSchema = { type: "array", items: def.kind === "enum" ? enumItem : { type: "string" } };
  } else if (def.kind === "list") {
    key = "items";
    valueSchema = { type: "array", items: { type: "string" } };
  } else if (def.kind === "multienum") {
    key = "items";
    valueSchema = { type: "array", items: enumItem };
  } else if (def.kind === "number") {
    valueSchema = { type: "number" };
  } else if (def.kind === "enum") {
    valueSchema = enumItem;
  } else {
    valueSchema = { type: "string" };
  }
  return { type: "object", properties: { [key]: valueSchema, notes }, required: [key, "notes"], additionalProperties: false };
}

/** Pulls the proposed value(s) and notes out of the parsed model answer. */
export function readAnswer(def: FieldDef, mode: FieldMode, parsed: unknown): { value?: unknown; options?: unknown; notes: string[] } {
  const o = (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>;
  const n = Array.isArray(o.notes) ? o.notes.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 240)).filter(Boolean).slice(0, 5) : [];
  if (mode === "options") return { options: o.options, notes: n };
  if (def.kind === "list" || def.kind === "multienum") return { value: o.items, notes: n };
  return { value: o.value, notes: n };
}
