/**
 * Prompt management: every prompt the system sends to an AI model, described once (pure; shared by the code that uses prompts and by the
 * Platform Console's Prompts page). A prompt's text lives in `registry.ts` as its default; a Platform Console admin can override it
 * (versioned, reversible); the code only ever asks for it by key (`getPrompt`).
 */

export type PromptKind =
  /** The instructions of a conversation or one-shot call. */
  | "system"
  /** A task description added to a request ("TASK: write the ad…"). */
  | "task"
  /** A yes/no or JSON decision (the scope gate, keyword extraction). */
  | "classifier"
  /** A reusable block that other prompts include (language rules, scope rules). */
  | "fragment"
  /** The text of an image-generation request. */
  | "image"
  /** Starting content new companies are given (their own chatbot persona, greeting …); each company then edits its own copy. */
  | "default-content";

export interface PromptVar {
  /** Letters, digits and underscores: used as `{{name}}` in the text. */
  name: string;
  description: string;
  /** What it looks like in real use, for previews. */
  example: string;
  /** The text must contain it (a prompt that drops it would stop working). */
  required?: boolean;
}

export interface PromptDef {
  key: string;
  name: string;
  /** The group heading on the page. */
  area: string;
  /** The product (panel key) it belongs to, or "platform" for shared AI rules. */
  product: string;
  kind: PromptKind;
  description: string;
  /** The source files that ask for it (kept in step by a test). */
  usedBy: string[];
  vars: PromptVar[];
  /** The default text, with `{{name}}` placeholders. */
  text: string;
  /** The model it is normally sent to, when it is one fixed model. */
  model?: string;
  /** The reply must be JSON: a test run is judged on that. */
  json?: boolean;
  /** A company may change the wording for its own workspace (never for another). Only prompts that shape tone and content, never the ones that decide scope or data access. */
  companyEditable?: boolean;
  /** Free-text note shown beside the editor (what to keep, what it affects). */
  note?: string;
  /**
   * PINNED RULES: safety text that is appended in code after whatever text is in force (built-in, platform override or a company's wording)
   * and that nobody can edit, shorten or switch off from any screen: honesty, no-invented-facts, "data is data", illustrative-only
   * testimonials, AI disclosure, no real people or minors. May use the same `{{variables}}` as the text. The Console shows it read-only.
   */
  pinned?: string;
}

/** The text of a prompt as the model receives it: the editable text, then the pinned rules (if any). */
export function withPinned(def: Pick<PromptDef, "pinned">, text: string): string {
  return def.pinned ? `${text}\n${def.pinned}` : text;
}

const VAR_TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** The variable names a text uses. */
export function usedVars(text: string): string[] {
  return [...new Set([...text.matchAll(VAR_TOKEN)].map((m) => m[1]))];
}

/** Fills `{{name}}` placeholders. Only declared variables are replaced; anything else (like a literal `{{variable.name}}` the prompt talks about) stays as written. */
export function renderPrompt(text: string, vars: Record<string, string | number | null | undefined> = {}, declared?: readonly string[]): string {
  return text.replace(VAR_TOKEN, (whole, name: string) => {
    if (declared && !declared.includes(name)) return whole;
    const v = vars[name];
    return v == null ? "" : String(v);
  });
}

export const MAX_PROMPT_CHARS = 60_000;

/** Why a text can't be saved as this prompt, or null. A variable the prompt needs must still be there; a mistyped variable is refused. */
export function validatePromptText(def: Pick<PromptDef, "vars">, text: string): string | null {
  const t = text.trim();
  if (!t) return "The prompt can't be empty.";
  if (t.length > MAX_PROMPT_CHARS) return `The prompt is too long (limit ${MAX_PROMPT_CHARS.toLocaleString("en-IN")} characters).`;
  const declared = def.vars.map((v) => v.name);
  const unknown = usedVars(t).filter((n) => !declared.includes(n));
  if (unknown.length) return `Unknown variable${unknown.length > 1 ? "s" : ""}: ${unknown.map((n) => `{{${n}}}`).join(", ")}. Available: ${declared.length ? declared.map((n) => `{{${n}}}`).join(", ") : "none"}.`;
  const missing = def.vars.filter((v) => v.required && !usedVars(t).includes(v.name)).map((v) => `{{${v.name}}}`);
  if (missing.length) return `This prompt needs ${missing.join(", ")}: the feature stops working without ${missing.length > 1 ? "them" : "it"}.`;
  return null;
}

/** A rough size for the editor: about four characters to a token. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
