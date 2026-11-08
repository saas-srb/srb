import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import { getOpenAI, isOpenAIConfigured } from "@/lib/openai";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { checkScope, detectLanguage, languageBlock, refusalText, say, scopeBlock } from "@/lib/ai/policy";
import { getPrompt } from "@/lib/prompts/store";
import { sanitizeUserMessage } from "@/lib/prompt-safety";
import type { AccessUser } from "@/lib/platform/access";
import { getCompanyKpis, getRecentActivity } from "@/lib/platform/dashboard";
import { globalSearch } from "@/lib/platform/search";
import { eventLabel } from "@/lib/platform/events/catalog";

/**
 * "Ask about your business" on the Staff Hub. One question, one short answer:
 * the model may call three read-only tools — company KPIs, global search and
 * recent activity — and each runs with the ASKING user's own permissions, so
 * it can never surface something they couldn't open themselves. Nothing is
 * stored (no chat history) and there are no write tools.
 */

/** The text model the rest of the app defaults to (SMMS, AI Bots). */
export const ASSISTANT_MODEL = "gpt-4.1-mini";
const MAX_QUESTION_CHARS = 500;
const MAX_TOOL_ROUNDS = 3;

export type AssistantReply = { ok: true; answer: string } | { ok: false; error: string };


const TOOLS = [
  { type: "function" as const, name: "get_company_kpis", description: "Current company numbers the user may see: open leads, active projects, tasks due this week, unpaid invoice amount, employees, pending leave requests.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
  {
    type: "function" as const,
    name: "search_records",
    description: "Find leads, clients, projects, tasks, employees and invoices by name, code, email or number. Returns at most 5 per type, each with a url.",
    parameters: { type: "object", properties: { query: { type: "string", description: "Name, code, email or number to look for (2+ characters)." } }, required: ["query"], additionalProperties: false },
    strict: true,
  },
  { type: "function" as const, name: "get_recent_activity", description: "The latest things that happened in the company (new leads, invoices paid, tasks completed …), newest first.", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true },
];

/** Runs one tool as `user`. Always returns JSON text; errors become data, not exceptions. */
export async function runAssistantTool(user: AccessUser, name: string, rawArgs: string): Promise<string> {
  try {
    if (name === "get_company_kpis") {
      const kpis = await getCompanyKpis(user);
      return JSON.stringify({ kpis: kpis.map((k) => ({ label: k.label, value: k.value, unit: k.format === "currency" ? "INR" : "count", url: k.href })), note: kpis.length === 0 ? "This user has no access to company-wide numbers." : undefined });
    }
    if (name === "search_records") {
      let query = "";
      try {
        query = String((JSON.parse(rawArgs || "{}") as { query?: unknown }).query ?? "");
      } catch {
        query = "";
      }
      const hits = await globalSearch(user, query);
      return JSON.stringify({ results: hits.map((h) => ({ type: h.type, name: h.title, detail: h.subtitle, url: h.url })) });
    }
    if (name === "get_recent_activity") {
      const events = await getRecentActivity(user, 10);
      return JSON.stringify({ activity: events.map((e) => ({ what: eventLabel(e.type), record: e.label, by: e.actorEmail, at: e.at, url: e.url })) });
    }
    return JSON.stringify({ error: "Unknown tool." });
  } catch (err) {
    console.error(`[assistant] tool ${name} failed`, err);
    return JSON.stringify({ error: "That lookup failed." });
  }
}

interface OutputItem {
  type: string;
  name?: string;
  arguments?: string;
  call_id?: string;
  content?: { type: string; text?: string }[];
}

function textOf(output: OutputItem[]): string {
  return output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("")
    .trim();
}

export async function askBusiness(user: AccessUser, rawQuestion: unknown): Promise<AssistantReply> {
  const q = sanitizeUserMessage(rawQuestion, MAX_QUESTION_CHARS);
  if (!q.ok) return { ok: false, error: q.error ?? "Type a question first." };
  const lang = detectLanguage([q.text]);
  if (!(await isOpenAIConfigured())) return { ok: false, error: say("analystNotSetUp", lang) };
  if (!(await checkScope({ text: q.text, kind: "workspace" }))) return { ok: true, answer: refusalText(lang, "workspace") };

  try {
    setAiFeature("Workspace assistant");
    const openai = await getOpenAI();
    // The conversation lives only in this array for the length of the request.
    const input: unknown[] = [{ role: "user", content: q.text }];
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const lastRound = round === MAX_TOOL_ROUNDS;
      const res = await openai.responses.create({
        model: ASSISTANT_MODEL,
        instructions: await getPrompt("assistant.business", { scope_block: await scopeBlock("workspace"), language_block: await languageBlock(lang) }),
        input: input as never,
        tools: TOOLS,
        tool_choice: lastRound ? "none" : "auto",
        max_output_tokens: 400,
        store: false,
      });
      const output = (res.output ?? []) as unknown as OutputItem[];
      const calls = output.filter((o) => o.type === "function_call" && o.call_id && o.name);
      if (calls.length === 0 || lastRound) {
        const answer = textOf(output);
        return answer ? { ok: true, answer: answer.slice(0, 2000) } : { ok: false, error: say("analystNoAnswer", lang) };
      }
      for (const call of calls) {
        input.push({ type: "function_call", call_id: call.call_id, name: call.name, arguments: call.arguments ?? "{}" });
        input.push({ type: "function_call_output", call_id: call.call_id, output: await runAssistantTool(user, call.name!, call.arguments ?? "{}") });
      }
    }
    return { ok: false, error: say("analystNoAnswer", lang) };
  } catch (err) {
    if (isBillingLimitError(err)) return { ok: false, error: err.message };
    console.error("[assistant] request failed", err);
    return { ok: false, error: say("analystDown", lang) };
  }
}
