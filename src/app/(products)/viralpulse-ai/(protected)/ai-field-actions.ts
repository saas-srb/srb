"use server";

import { run } from "@/lib/products/viralpulse-ai/run";
import { runAiField } from "@/lib/products/viralpulse-ai/ai-field/run";
import { makeRunDeps, markFieldRun } from "@/lib/products/viralpulse-ai/ai-field/deps-default";
import { FIELD_MODES, type AiFieldRequest, type AiFieldResult } from "@/lib/products/viralpulse-ai/ai-field/types";

/**
 * The one server action behind every AI field button. Permission (GENERATE_AI_CONTENT), the read-only block for suspended
 * workspaces and the viewer all come from `run()`; the rest (what the field may read, limits, plan metering, validation) lives
 * in `ai-field/run.ts` so it can be tested without a browser.
 */
export async function aiFieldAction(input: AiFieldRequest): Promise<AiFieldResult> {
  const bad = (error: string): AiFieldResult => ({ ok: false, code: "INVALID", error });
  if (!input || typeof input !== "object" || typeof input.fieldKey !== "string" || input.fieldKey.length > 80) return bad("That request isn't valid.");
  if (!(FIELD_MODES as readonly string[]).includes(input.mode)) return bad("That request isn't valid.");
  if (!input.context || typeof input.context !== "object" || Array.isArray(input.context)) return bad("That request isn't valid.");
  let size = 0;
  try {
    size = JSON.stringify([input.context, input.current ?? null]).length;
  } catch {
    return bad("That request isn't valid.");
  }
  if (size > 60_000) return bad("The form is too large to send to the AI.");
  const req: AiFieldRequest = {
    fieldKey: input.fieldKey,
    context: input.context,
    current: input.current ?? null,
    mode: input.mode,
    instruction: typeof input.instruction === "string" ? input.instruction : undefined,
    tone: typeof input.tone === "string" ? input.tone : undefined,
    targetLanguage: typeof input.targetLanguage === "string" ? input.targetLanguage : undefined,
    enumOptions: Array.isArray(input.enumOptions) ? input.enumOptions.slice(0, 120) : undefined,
  };
  const out = await run(["GENERATE_AI_CONTENT"], async (v) => runAiField(req, makeRunDeps({ id: v.userId })), { revalidate: false });
  if (!out.ok && !("code" in out)) return { ok: false, error: out.error, code: "FORBIDDEN" };
  return out as AiFieldResult;
}

/** Tells the ledger whether a result was kept or undone (quality signal only). */
export async function aiFieldOutcomeAction(runId: string, outcome: "applied" | "reverted"): Promise<{ ok: boolean }> {
  if (typeof runId !== "string" || (outcome !== "applied" && outcome !== "reverted")) return { ok: false };
  const out = await run(["GENERATE_AI_CONTENT"], async (v) => {
    await markFieldRun(v.userId, runId, outcome);
    return {};
  }, { revalidate: false });
  return { ok: out.ok };
}
