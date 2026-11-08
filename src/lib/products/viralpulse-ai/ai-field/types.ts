/**
 * Types shared by the AI field button (browser) and its server side. Plain module: no server imports, safe in client bundles.
 */

/** A field's value: text, a list (one item per line in the UI) or a number. */
export type FieldValue = string | string[] | number;

/** What the person asked for. `options` returns several alternatives to choose from; `translate` needs `targetLanguage`. */
export const FIELD_MODES = ["generate", "improve", "shorten", "expand", "translate", "options"] as const;
export type FieldMode = (typeof FIELD_MODES)[number];

export const MODE_LABEL: Record<FieldMode, { label: string; hint: string }> = {
  generate: { label: "Write with AI", hint: "Write it from the other fields" },
  improve: { label: "Improve what I wrote", hint: "Fix wording and structure, keep the meaning" },
  shorten: { label: "Shorten", hint: "Same meaning, fewer words" },
  expand: { label: "Expand", hint: "Add detail the other fields support" },
  translate: { label: "Translate", hint: "Same text in another language" },
  options: { label: "Give me options", hint: "Show several alternatives" },
};

export type FieldKind = "text" | "longtext" | "list" | "enum" | "multienum" | "number" | "date" | "datetime" | "url";

export type AiFieldErrorCode = "NO_KEY" | "LIMIT" | "RATE" | "BLOCKED" | "INVALID" | "PROVIDER" | "FORBIDDEN" | "UNKNOWN_FIELD" | "NEEDS_INPUT";

export interface AiFieldRequest {
  fieldKey: string;
  /** Sibling form values. The server reads only the keys the field's registry entry lists in `readsFrom`. */
  context: Record<string, unknown>;
  /** The field's current value (what "improve", "shorten", "expand" and "translate" work from). */
  current: FieldValue | null;
  mode: FieldMode;
  /** Optional free-text steer, e.g. "make it more playful". */
  instruction?: string;
  tone?: string;
  /** For `translate`: the language to write in. For other modes the language comes from the context or the current text. */
  targetLanguage?: string;
  /** For enum / multi-choice fields whose choices live in the form (not in the registry). */
  enumOptions?: string[];
}

export interface AiFieldSource {
  kind: "brand" | "offer" | "company" | "user" | "analytics";
  ref: string;
}

export interface AiFieldUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type AiFieldResult =
  | {
      ok: true;
      runId: string;
      fieldKey: string;
      /** The proposed value (absent when `options` is returned). */
      value?: FieldValue;
      /** Alternatives to choose from (mode `options`). */
      options?: FieldValue[];
      /** Plain-language remarks, e.g. "Drafted only from the text you wrote". */
      notes: string[];
      /** Things to double-check, e.g. a figure that is not in the other fields. */
      warnings: string[];
      sources: AiFieldSource[];
      /** True for suggestions the person must confirm (a budget range, for example). */
      estimate: boolean;
      usage: AiFieldUsage | null;
    }
  | { ok: false; error: string; code: AiFieldErrorCode };
