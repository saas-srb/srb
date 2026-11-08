"use server";

import { revalidatePath } from "next/cache";
import type { HistoryRow } from "@/components/platform/prompts/PromptManager";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getOpenAI } from "@/lib/openai";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { PROMPT_BY_KEY } from "@/lib/prompts/registry";
import { checkCompanyPrompt, withSecurity } from "@/lib/prompts/guard";
import { renderPrompt } from "@/lib/prompts/types";
import { promptText } from "@/lib/prompts/store";
import { companyPromptHistory, resetCompanyPrompt, restoreCompanyPromptVersion, saveCompanyPrompt, setCompanyPromptEnabled, type CompanyPromptResult } from "@/lib/prompts/company-store";

const NAV_KEY = "company.prompts";
const done = (res: CompanyPromptResult) => {
  revalidatePath("/commandos/settings/prompts");
  return res;
};
/** The standard text now in force for everyone (the platform's version, else the built-in one): what this company's wording is compared with and returns to. */
const standard = async (key: string) => (await promptText(key)).text;
const who = (u: { id: string; email: string }) => ({ id: u.id, email: u.email });

export async function saveCompanyPromptAction(key: string, text: string, note: string): Promise<CompanyPromptResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const k = String(key ?? "");
  if (!PROMPT_BY_KEY.get(k)?.companyEditable) return { ok: false, error: "This prompt is managed by SelfRun." };
  return done(await saveCompanyPrompt(k, String(text ?? ""), await standard(k), String(note ?? ""), who(user)));
}
export async function setCompanyPromptEnabledAction(key: string, enabled: boolean): Promise<CompanyPromptResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  return done(await setCompanyPromptEnabled(String(key ?? ""), enabled === true, who(user)));
}
export async function resetCompanyPromptAction(key: string): Promise<CompanyPromptResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const k = String(key ?? "");
  if (!PROMPT_BY_KEY.get(k)?.companyEditable) return { ok: false, error: "This prompt is managed by SelfRun." };
  return done(await resetCompanyPrompt(k, await standard(k), who(user)));
}
export async function restoreCompanyPromptAction(key: string, versionId: string): Promise<CompanyPromptResult> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const k = String(key ?? "");
  if (!PROMPT_BY_KEY.get(k)?.companyEditable) return { ok: false, error: "This prompt is managed by SelfRun." };
  return done(await restoreCompanyPromptVersion(k, String(versionId ?? ""), await standard(k), who(user)));
}
export async function companyPromptHistoryAction(key: string): Promise<HistoryRow[]> {
  await requireWorkspaceAction(NAV_KEY);
  return (await companyPromptHistory(String(key ?? ""))).map((v) => ({ id: v._id, version: v.version, action: v.action, text: v.text, note: v.note, at: v.at.toISOString(), by: v.by }));
}

const recent = new Map<string, number[]>();

/** Tries a draft against this company's own AI allowance. The fixed security rules are added exactly as they are on a real request. Nothing is saved. */
export async function testCompanyPromptAction(key: string, text: string, sample: string): Promise<{ ok: true; output: string; ms: number } | { ok: false; error: string }> {
  const user = await requireWorkspaceAction(NAV_KEY);
  const def = PROMPT_BY_KEY.get(String(key ?? ""));
  if (!def?.companyEditable) return { ok: false, error: "This prompt is managed by SelfRun." };
  const problem = checkCompanyPrompt(def, String(text ?? ""), await standard(def.key));
  if (problem) return { ok: false, error: problem };
  const id = `${await currentCompanyId()}:${user.id}`;
  const now = Date.now();
  const mine = (recent.get(id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= 6) return { ok: false, error: "Too many test runs: wait a minute." };
  recent.set(id, [...mine, now]);
  try {
    setAiFeature("Prompt test run");
    const openai = await getOpenAI();
    const started = Date.now();
    const res = await openai.responses.create(
      { model: def.model ?? "gpt-4.1-mini", instructions: withSecurity(renderPrompt(String(text), Object.fromEntries(def.vars.map((v) => [v.name, v.example])), def.vars.map((v) => v.name))), input: String(sample ?? "").trim().slice(0, 2000) || "Hello", max_output_tokens: 700, store: false },
      { signal: AbortSignal.timeout(45_000) },
    );
    return { ok: true, output: res.output_text ?? "", ms: Date.now() - started };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "The test run failed." };
  }
}
