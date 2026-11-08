/**
 * Input hardening for the public chatbot. This is defence-in-depth on top of a
 * hardened system prompt - it is not a substitute for it. The model is also
 * instructed (in the system prompt) to treat retrieved documents and user text
 * as untrusted and to never reveal its instructions.
 */

export interface SanitizedMessage {
  ok: boolean;
  /** Cleaned message text (only meaningful when `ok`). */
  text: string;
  /** Present when `ok` is false. */
  error?: string;
  /** True when the message pattern-matches a prompt-injection attempt. The
   * caller still forwards it to the model (which is instructed to refuse), but
   * flags it for analytics/moderation. */
  flaggedInjection: boolean;
}

// Strip C0/C1 control chars (keeping tab and newline), zero-width characters,
// and BiDi-override marks sometimes used to smuggle hidden instructions.
const CONTROL_CHARS = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F" +
    "\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]",
  "g",
);

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all |any |your |previous |above |prior )*(instructions|prompts?|rules|context)/i,
  /disregard (all |any |the |your |previous |above )*(instructions|prompts?|rules)/i,
  /forget (everything|all|your|the) (you|instructions|rules|prompt)/i,
  /(reveal|show|print|repeat|display|output|tell me) (your |the )?(system )?(prompt|instructions|rules|configuration)/i,
  /what (is|are) your (system )?(prompt|instructions|initial instructions)/i,
  /you are now (a|an|the)\b/i,
  /(act|behave|respond|roleplay|pretend) as (if you are |though you are )?(a |an |the )?(dan|developer mode|jailbreak|unrestricted)/i,
  /(developer|admin|root|sudo) mode/i,
  /\bbypass (your |the )?(safety|guard|filter|restriction)/i,
];

export function sanitizeUserMessage(raw: unknown, maxChars: number): SanitizedMessage {
  if (typeof raw !== "string") {
    return { ok: false, text: "", error: "Message must be text.", flaggedInjection: false };
  }

  const cleaned = raw.replace(/\r\n/g, "\n").replace(CONTROL_CHARS, "").trim();

  if (!cleaned) {
    return { ok: false, text: "", error: "Message cannot be empty.", flaggedInjection: false };
  }
  if (cleaned.length > maxChars) {
    return {
      ok: false,
      text: "",
      error: `Message must be ${maxChars.toLocaleString()} characters or fewer.`,
      flaggedInjection: false,
    };
  }

  const flaggedInjection = INJECTION_PATTERNS.some((re) => re.test(cleaned));
  return { ok: true, text: cleaned, flaggedInjection };
}
