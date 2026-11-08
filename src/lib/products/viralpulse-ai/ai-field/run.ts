import { createHash } from "node:crypto";
import { PLATFORM_META, isPlatform } from "@/lib/products/viralpulse-ai/constants";
import { REGISTRY, isFieldKey, modesFor, type FieldDef, type ResolverId } from "@/lib/products/viralpulse-ai/ai-field/registry";
import { FIELD_MODES, type AiFieldErrorCode, type AiFieldRequest, type AiFieldResult, type AiFieldSource, type AiFieldUsage, type FieldMode, type FieldValue } from "@/lib/products/viralpulse-ai/ai-field/types";
import { allowedCorpus, coerceCurrent, sanitizeContext, type CleanContext } from "@/lib/products/viralpulse-ai/ai-field/context";
import { describeFindings, unsupportedFacts } from "@/lib/products/viralpulse-ai/ai-field/facts";
import { maxCharsFor } from "@/lib/products/viralpulse-ai/ai-field/limits";
import { buildFieldPrompt, FIELD_RETRY_KEY, FIELD_SYSTEM_KEY, MODE_KEY, outputSchema, readAnswer } from "@/lib/products/viralpulse-ai/ai-field/prompt";
import { defaultPromptAsync, type PromptFn } from "@/lib/prompts/defaults";
import { checkOptions, checkValue, isBlank, valueToText, type CheckEnv } from "@/lib/products/viralpulse-ai/ai-field/validate";

/**
 * Runs one AI field request end to end. Every outside thing (the model, the database, the clock) comes in through `RunDeps`,
 * so the rules - what a field may read, fact guard, validation, retry, limits - are exercised by tests with a fake model.
 */

export interface FieldLlmRequest {
  system: string;
  input: string;
  schema: Record<string, unknown>;
  schemaName: string;
}
export interface FieldLlmResponse {
  parsed: unknown;
  usage: AiFieldUsage;
}
export type FieldLlm = (req: FieldLlmRequest) => Promise<FieldLlmResponse>;

export interface TrustedData {
  /** Stored brand voice, company identity, live offers (read from the database, never from the browser). */
  text: string;
  sources: AiFieldSource[];
  /** The site's service catalogue (values), for `options: "catalogue"` fields. */
  catalogue: string[];
}

export type ResolveResult = { ok: true; value: FieldValue; note: string; sources: AiFieldSource[] } | { ok: false; error: string };

export interface RunHandle {
  runId: string;
  finish(r: { status: "ok" | "error"; usage: AiFieldUsage | null; code?: string }): Promise<void>;
}

export interface RunDeps {
  llm: FieldLlm;
  trusted(ids: { clientId: string; offerId: string }): Promise<TrustedData>;
  resolve(id: ResolverId, input: { ctx: CleanContext; now: Date }): Promise<ResolveResult>;
  reserve(input: { fieldKey: string; mode: FieldMode; hash: string }): Promise<{ ok: true; handle: RunHandle } | { ok: false; code: "RATE" | "LIMIT"; error: string }>;
  classifyError(err: unknown): { code: AiFieldErrorCode; error: string };
  now(): Date;
  /** Where the instructions come from: the registry through `getPrompt` in production; the built-in text when omitted (tests). */
  prompt?: PromptFn;
}

const fail = (code: AiFieldErrorCode, error: string): AiFieldResult => ({ ok: false, code, error });

function platformGuide(platform: unknown): string | undefined {
  if (typeof platform !== "string" || !isPlatform(platform)) return undefined;
  const m = PLATFORM_META[platform];
  return `${m.label}: body/caption limit ${m.captionLimit} characters${m.headlineLimit ? `, headline/title limit ${m.headlineLimit}` : ""}; hashtags: ${m.hashtagAdvice}`;
}

const LANG_RE = /^[^\d;:<>{}()$\\/\n"'`]{2,40}$/;

/** The language to write in: the one asked for when translating, otherwise the form's language field if any. */
export function resolveLanguage(mode: FieldMode, targetLanguage: string | undefined, ctx: CleanContext): { language: string | null; error?: string } {
  if (mode === "translate") {
    const t = (targetLanguage ?? "").trim();
    if (!t) return { language: null, error: "Choose the language to translate into." };
    if (!LANG_RE.test(t)) return { language: null, error: "That language name isn't valid." };
    return { language: t };
  }
  const l = ctx.language;
  return { language: typeof l === "string" && LANG_RE.test(l.trim()) ? l.trim() : null };
}

export function cleanEnumOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter((x) => x && x.length <= 80))].slice(0, 120);
}

function optionsFor(def: FieldDef, req: AiFieldRequest, trusted: TrustedData | null): readonly string[] | undefined {
  if (Array.isArray(def.options)) return def.options;
  if (def.options === "client") return cleanEnumOptions(req.enumOptions);
  if (def.options === "catalogue") return trusted?.catalogue;
  return undefined;
}

function textsOf(v: FieldValue): string {
  return valueToText(v);
}

export async function runAiField(req: AiFieldRequest, deps: RunDeps): Promise<AiFieldResult> {
  if (!isFieldKey(req.fieldKey)) return fail("UNKNOWN_FIELD", "That field doesn't support AI.");
  const def: FieldDef = REGISTRY[req.fieldKey];
  const mode: FieldMode = (FIELD_MODES as readonly string[]).includes(req.mode) ? req.mode : "generate";
  if (!modesFor(def).includes(mode)) return fail("INVALID", def.factField ? "For this field the AI can only tidy, shorten or translate what you wrote." : "That action isn't available for this field.");

  const ctx = sanitizeContext(def, req.context);
  const current = coerceCurrent(def, req.current);
  const now = deps.now();
  const instruction = typeof req.instruction === "string" ? req.instruction.trim().slice(0, 300) : "";
  const tone = typeof req.tone === "string" ? req.tone.trim().slice(0, 60) : "";

  // ── deterministic fields: real data, no model, no quota ──
  if (def.resolver) {
    const r = await deps.resolve(def.resolver, { ctx, now });
    if (!r.ok) return fail("NEEDS_INPUT", r.error);
    return { ok: true, runId: `det_${createHash("sha256").update(`${req.fieldKey}${now.getTime()}`).digest("hex").slice(0, 12)}`, fieldKey: req.fieldKey, value: r.value, notes: [r.note], warnings: def.estimate ? ["This is a suggestion from your own data. Check it before using it."] : [], sources: r.sources, estimate: Boolean(def.estimate), usage: null };
  }

  // ── what is there to work from? ──
  const hasCurrent = !isBlank(current);
  if (mode !== "generate" && mode !== "options" && !hasCurrent) return fail("NEEDS_INPUT", `There is nothing to ${mode} yet. Write something first${modesFor(def).includes("generate") ? ", or use Write with AI" : ""}.`);
  if (mode === "generate" && def.factField && (def.factSource ?? "own") === "own" && !hasCurrent) return fail("NEEDS_INPUT", `Write ${def.label.toLowerCase()} yourself first. The AI only tidies facts you provide.`);
  if (mode === "generate" && def.factField && def.factSource === "context" && Object.keys(ctx).length === 0 && !hasCurrent) return fail("NEEDS_INPUT", "Fill in the key points or the offer first. The video can only say what you wrote.");

  const lang = resolveLanguage(mode, req.targetLanguage, ctx);
  if (lang.error) return fail("INVALID", lang.error);

  const hash = createHash("sha256").update(JSON.stringify([req.fieldKey, mode, current, ctx, instruction, tone, lang.language])).digest("hex").slice(0, 24);
  const reserved = await deps.reserve({ fieldKey: req.fieldKey, mode, hash });
  if (!reserved.ok) return fail(reserved.code, reserved.error);
  const { handle } = reserved;

  let usage: AiFieldUsage | null = null;
  const addUsage = (u: AiFieldUsage) => {
    usage = usage ? { model: u.model, inputTokens: usage.inputTokens + u.inputTokens, outputTokens: usage.outputTokens + u.outputTokens, costUsd: Math.round((usage.costUsd + u.costUsd) * 1e6) / 1e6 } : u;
  };

  try {
    const trusted = await deps.trusted({ clientId: typeof ctx.clientId === "string" ? ctx.clientId : "", offerId: typeof ctx.offerId === "string" ? ctx.offerId : "" });
    if (def.factField && def.factSource === "stored" && mode === "generate" && !hasCurrent && Object.keys(ctx).length === 0 && !trusted.text.trim()) {
      await handle.finish({ status: "error", usage: null, code: "NEEDS_INPUT" });
      return fail("NEEDS_INPUT", "There is no stored company or brand data to draft from yet. Add it first, or write this yourself.");
    }
    const options = optionsFor(def, req, trusted);
    if ((def.kind === "enum" || def.kind === "multienum") && (!options || options.length === 0)) {
      await handle.finish({ status: "error", usage: null, code: "INVALID" });
      return fail("INVALID", "There are no choices to pick from for this field.");
    }
    const env: CheckEnv = { maxChars: maxCharsFor(req.fieldKey, def, ctx), options };
    const schema = outputSchema(def, mode, options);
    const allowed = allowedCorpus(ctx, current, [trusted.text]);
    const scan = def.kind === "text" || def.kind === "longtext" || def.kind === "list";

    const ask = deps.prompt ?? defaultPromptAsync;
    const system = await ask(FIELD_SYSTEM_KEY);
    const modeText = await ask(MODE_KEY[mode]);
    let retryReason: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const input = buildFieldPrompt({ def, mode, maxChars: env.maxChars, current, context: ctx, trusted: trusted.text, instruction: instruction || undefined, tone: tone || undefined, language: lang.language, options, retryReason, platformGuide: platformGuide(ctx.platform), texts: { mode: modeText, ...(retryReason ? { retry: await ask(FIELD_RETRY_KEY, { reason: retryReason }) } : {}) } });
      const res = await deps.llm({ system, input, schema, schemaName: `smms_field_${def.kind}${mode === "options" ? "_options" : ""}` });
      addUsage(res.usage);
      const ans = readAnswer(def, mode, res.parsed);

      let value: FieldValue | undefined;
      let alts: FieldValue[] | undefined;
      let warnings: string[] = [];
      let reason: string | null = null;

      if (mode === "options") {
        const c = checkOptions(def, ans.options, env);
        if (c.ok) alts = c.options;
        else reason = c.reason;
      } else {
        const c = checkValue(def, ans.value, env);
        if (c.ok) {
          value = c.value;
          warnings = c.warnings;
        } else reason = c.reason;
      }

      if (!reason && scan) {
        const candidates = alts ?? (value !== undefined ? [value] : []);
        const keep: FieldValue[] = [];
        const dropped: string[] = [];
        for (const cand of candidates) {
          const found = unsupportedFacts(textsOf(cand), allowed);
          if (found.length === 0) keep.push(cand);
          else if (def.factField) dropped.push(describeFindings(found));
          else {
            keep.push(cand);
            warnings.push(`Check before using: it mentions ${describeFindings(found)}, which is not in your other fields.`);
          }
        }
        if (def.factField && dropped.length) {
          if (alts) {
            if (keep.length >= 2) alts = keep;
            else reason = `It added details that are not in the text you were given (${dropped[0]}). Remove them.`;
          } else reason = `It added details that are not in the text you were given (${dropped[0]}). Remove them.`;
        }
      }

      if (reason) {
        retryReason = reason;
        continue;
      }

      const notes = [...ans.notes];
      if (def.factField) notes.unshift((def.factSource ?? "own") === "own" ? "Only your own text was used; nothing was added." : "Drafted only from your stored brand data and the other fields. Please check it.");
      if (value !== undefined && current !== null && JSON.stringify(value) === JSON.stringify(current)) notes.push("The AI left this unchanged.");
      if (def.estimate) warnings.push("This is an estimate. Check it before using it.");
      const sources: AiFieldSource[] = [...trusted.sources];
      if (Object.keys(ctx).length || hasCurrent) sources.push({ kind: "user", ref: "Your other fields" });
      await handle.finish({ status: "ok", usage });
      return { ok: true, runId: handle.runId, fieldKey: req.fieldKey, ...(alts ? { options: alts } : { value }), notes: [...new Set(notes)].slice(0, 6), warnings: [...new Set(warnings)].slice(0, 6), sources, estimate: Boolean(def.estimate), usage };
    }

    await handle.finish({ status: "error", usage, code: "INVALID" });
    return fail("INVALID", def.factField ? "The AI kept adding details that aren't in your text, so nothing was changed. Try again with a clearer instruction, or write it yourself." : `The AI's answer didn't fit this field (${retryReason ?? "invalid"}). Please try again.`);
  } catch (err) {
    const c = deps.classifyError(err);
    await handle.finish({ status: "error", usage, code: c.code }).catch(() => {});
    return fail(c.code, c.error);
  }
}
