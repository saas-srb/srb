import "server-only";
import { getPrompt } from "@/lib/prompts/store";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import { aiBlockReason } from "@/lib/platform/billing/enforce";
import { languageOf } from "@/lib/ai/policy";
import { getOpenAI, isUnsupportedParamError } from "@/lib/openai";
import { sanitizeUserMessage } from "@/lib/prompt-safety";
import type OpenAI from "openai";
import { botHasKnowledge, platformInstructions } from "@/lib/products/agentos/engine";
import { getBot } from "@/lib/products/agentos/bots";
import { getSettings } from "@/lib/products/agentos/settings";
import { LIMITS } from "@/lib/products/agentos/constants";
import { AibotsInputError } from "@/lib/products/agentos/viewer";
import { buildPreviewRequest, type PreviewDraft, type PreviewTurn } from "@/lib/products/agentos/preview-shared";

/**
 * "Try it" for TEXT agents: runs the DRAFT instructions / model / temperature before they are saved. Stateless - nothing is written to
 * the chats collection, no OpenAI conversation or run row is created, the transcript lives only in the browser. Knowledge: when the
 * agent already exists and has indexed files, its own vector store is searched (knowledge is managed on its own tab, not in this form).
 * AI usage is still metered by the shared OpenAI client like every other AI call (feature label "AI Bots preview").
 */

export interface TextPreviewDeps {
  openai?: () => Promise<Pick<OpenAI, "responses">>;
  gate?: () => Promise<string | null>;
}

export async function runTextPreview(botId: string | null, draft: unknown, history: unknown, deps: TextPreviewDeps = {}): Promise<{ reply: string; usedKnowledge: boolean }> {
  const d = draft as Partial<PreviewDraft> | null;
  const settings = await getSettings();
  const turns = parseHistory(history);
  if (turns.length === 0 || turns[turns.length - 1].role !== "user") throw new AibotsInputError("Type a message to try the agent.");
  const instructions = typeof d?.instructions === "string" ? d.instructions.trim().slice(0, LIMITS.instructionsMax) : "";
  if (!instructions) throw new AibotsInputError("Write the instructions first - the preview runs exactly what is in that box.");
  const model = typeof d?.model === "string" ? d.model : "";
  if (!settings.models.some((m) => m.id === model)) throw new AibotsInputError("Pick one of the allowed OpenAI models.");
  const blocked = await (deps.gate ?? aiBlockReason)();
  if (blocked) throw new AibotsInputError(blocked);

  const bot = botId ? await getBot(botId) : null;
  const useKnowledge = Boolean(bot && bot.kind === "text" && (await botHasKnowledge(bot)));
  const lastText = turns[turns.length - 1].text;
  const req = buildPreviewRequest({
    draft: { instructions, model, temperature: d?.temperature ?? null },
    turns,
    maxOutputTokens: Math.min(settings.maxOutputTokens, 2000),
    vectorStoreId: useKnowledge ? bot!.vectorStoreId : null,
    systemInstructions: await getPrompt("agentos.instructions", { bot_instructions: instructions, platform_rules: await platformInstructions(useKnowledge, languageOf(lastText)) }),
  });
  setAiFeature("AI Bots preview");
  const openai = await (deps.openai ?? getOpenAI)();
  let res: OpenAI.Responses.Response;
  try {
    res = (await openai.responses.create(req)) as OpenAI.Responses.Response;
  } catch (err) {
    if ("temperature" in req && isUnsupportedParamError(err, "temperature")) {
      const { temperature: _t, ...rest } = req as typeof req & { temperature?: number };
      void _t;
      res = (await openai.responses.create(rest)) as OpenAI.Responses.Response;
    } else {
      console.error("[agentos preview] text failed", err instanceof Error ? err.message : err);
      throw new AibotsInputError("The preview couldn't get an answer from OpenAI. Try again in a moment.");
    }
  }
  const reply = (res.output_text ?? "").trim();
  return { reply: reply || "(The agent returned an empty reply.)", usedKnowledge: useKnowledge };
}

function parseHistory(raw: unknown): PreviewTurn[] {
  if (!Array.isArray(raw)) return [];
  const out: PreviewTurn[] = [];
  for (const t of raw.slice(-20)) {
    const r = t as { role?: unknown; text?: unknown };
    if (r.role !== "user" && r.role !== "assistant") continue;
    if (r.role === "user") {
      const s = sanitizeUserMessage(r.text, LIMITS.messageMax);
      if (!s.ok) continue;
      out.push({ role: "user", text: s.text });
    } else if (typeof r.text === "string" && r.text.trim()) out.push({ role: "assistant", text: r.text.slice(0, 20000) });
  }
  return out;
}
