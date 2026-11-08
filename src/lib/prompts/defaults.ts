import { PROMPT_BY_KEY } from "@/lib/prompts/registry";
import { renderPrompt, withPinned } from "@/lib/prompts/types";

/**
 * The built-in text of a prompt, filled in, with its pinned rules: synchronous and free of the database (no overrides are read).
 * For pure builders and tests that must work without a database; real calls use `getPrompt` (`store.ts`), which gives the same
 * text unless a platform admin or a company has changed the editable part.
 */
export function defaultPrompt(key: string, vars: Record<string, string | number | null | undefined> = {}): string {
  const def = PROMPT_BY_KEY.get(key);
  if (!def) throw new Error(`Unknown prompt "${key}"`);
  return renderPrompt(withPinned(def, def.text), vars, def.vars.map((v) => v.name));
}

export type PromptVars = Record<string, string | number | null | undefined>;
/** How a pure builder asks for a prompt: `getPrompt` in production, `defaultPromptAsync` where no database is wanted (tests). */
export type PromptFn = (key: string, vars?: PromptVars) => Promise<string>;
export const defaultPromptAsync: PromptFn = async (key, vars) => defaultPrompt(key, vars);
