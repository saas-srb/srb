"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import type { HistoryRow } from "@/components/platform/prompts/PromptManager";
import { setCompanyPromptAllowed, setSectionEnabled, type ControlResult } from "@/lib/platform/feature-controls";
import { getOpenAI } from "@/lib/openai";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { PROMPT_BY_KEY } from "@/lib/prompts/registry";
import { renderPrompt, validatePromptText } from "@/lib/prompts/types";
import { promptHistory, resetPrompt, restorePromptVersion, savePrompt, setPromptEnabled, type PromptResult } from "@/lib/prompts/store";

const done = (res: PromptResult) => {
  revalidatePath("/console/prompts");
  return res;
};
const actor = (u: { id: string; email: string }) => ({ id: u.id, email: u.email });


export async function savePromptAction(key: string, text: string, note: string): Promise<PromptResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await savePrompt(String(key ?? ""), String(text ?? ""), String(note ?? ""), actor(user)));
}
export async function setPromptEnabledAction(key: string, enabled: boolean): Promise<PromptResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await setPromptEnabled(String(key ?? ""), enabled === true, actor(user)));
}
export async function resetPromptAction(key: string): Promise<PromptResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await resetPrompt(String(key ?? ""), actor(user)));
}
export async function restorePromptAction(key: string, versionId: string): Promise<PromptResult> {
  const user = await requirePlatformPermission("settings.manage");
  return done(await restorePromptVersion(String(key ?? ""), String(versionId ?? ""), actor(user)));
}
export async function promptHistoryAction(key: string): Promise<HistoryRow[]> {
  await requirePlatformPermission("settings.read");
  return (await promptHistory(String(key ?? ""))).map((v) => ({ id: v._id, version: v.version, action: v.action, text: v.text, note: v.note, at: v.at.toISOString(), by: v.by }));
}

const recent = new Map<string, number[]>();

/** Tries a draft with the platform's own OpenAI key: the text (with example values filled in) is the instructions, the sample message is the input. Nothing is saved. */
export async function testPromptAction(key: string, text: string, sample: string): Promise<{ ok: true; output: string; ms: number } | { ok: false; error: string }> {
  const user = await requirePlatformPermission("settings.manage");
  const def = PROMPT_BY_KEY.get(String(key ?? ""));
  if (!def) return { ok: false, error: "Unknown prompt." };
  if (def.kind === "image") return { ok: false, error: "Image prompts can't be test-run here (each run would create a paid image)." };
  const problem = validatePromptText(def, String(text ?? ""));
  if (problem) return { ok: false, error: problem };
  const now = Date.now();
  const mine = (recent.get(user.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= 8) return { ok: false, error: "Too many test runs: wait a minute." };
  recent.set(user.id, [...mine, now]);
  try {
    setAiFeature("Prompt test run");
    const openai = await getOpenAI();
    const started = Date.now();
    const res = await openai.responses.create(
      { model: def.model ?? "gpt-4.1-mini", instructions: renderPrompt(String(text), Object.fromEntries(def.vars.map((v) => [v.name, v.example])), def.vars.map((v) => v.name)), input: String(sample ?? "").trim().slice(0, 2000) || "Hello", max_output_tokens: 900, store: false },
      { signal: AbortSignal.timeout(45_000) },
    );
    return { ok: true, output: res.output_text ?? "", ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The test run failed." };
  }
}

/** Let companies change prompts at all (Settings → AI prompts in their workspace), or not. */
export async function setCompanyPromptsEnabledAction(enabled: boolean): Promise<ControlResult> {
  const user = await requirePlatformPermission("settings.manage");
  const res = await setSectionEnabled("companyPrompts", enabled === true, { id: user.id, email: user.email });
  revalidatePath("/console/prompts");
  return res;
}

/** Let companies change this one prompt, or not. */
export async function setCompanyPromptAllowedAction(key: string, allowed: boolean): Promise<PromptResult> {
  const user = await requirePlatformPermission("settings.manage");
  const res = await setCompanyPromptAllowed(String(key ?? ""), allowed === true, { id: user.id, email: user.email }, !!PROMPT_BY_KEY.get(String(key ?? ""))?.companyEditable);
  revalidatePath("/console/prompts");
  return res.ok ? { ok: true, version: 0 } : res;
}
