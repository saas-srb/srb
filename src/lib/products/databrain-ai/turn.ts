import "server-only";
import { isOpenAIConfigured } from "@/lib/openai";
import { sanitizeUserMessage } from "@/lib/prompt-safety";
import { intelligenceCan } from "@/lib/intelligence-roles";
import type { CurrentIntelligenceUser } from "@/lib/intelligence-auth";
import { aiBlockReason } from "@/lib/platform/billing/enforce";
import { emitEvent } from "@/lib/platform/events";
import type { IntelMessage } from "@/lib/products/databrain-ai/blocks";
import { addMessage, consumeQuestion, createConversation, getConversation, historyForModel, MAX_QUESTION_CHARS, QUESTIONS_PER_HOUR, toView, type ConversationDoc } from "@/lib/products/databrain-ai/conversations";
import { detectLanguage } from "@/lib/ai/policy";
import { answerQuestion, friendlyTurnError } from "@/lib/products/databrain-ai/engine";

/**
 * A question's whole life apart from HTTP: preflight checks (product access,
 * AI limit / read-only, rate limit, conversation ownership), then the
 * answer, its persistence and its audit event. The route streams around it;
 * tests call it directly.
 */

export type PreparedTurn =
  | { ok: false; status: number; error: string }
  | { ok: true; conversation: ConversationDoc; isNew: boolean; question: string; history: { role: "user" | "assistant"; text: string }[] };

export async function prepareTurn(user: CurrentIntelligenceUser, body: { message?: unknown; conversationId?: unknown }): Promise<PreparedTurn> {
  if (!intelligenceCan(user, "USE")) return { ok: false, status: 403, error: "You don't have permission to use DataBrain." };
  if (!(await isOpenAIConfigured())) return { ok: false, status: 503, error: "The AI assistant isn't set up for this workspace yet. Ask your platform administrator to add an OpenAI key." };

  const q = sanitizeUserMessage(body.message, MAX_QUESTION_CHARS);
  if (!q.ok) return { ok: false, status: 400, error: q.error ?? "Type a question first." };

  // Plan limit / read-only: the same AI check the Ask box and AI Bots use (a suspended workspace cannot call the AI).
  const planBlock = await aiBlockReason();
  if (planBlock) return { ok: false, status: 402, error: planBlock };

  const conversationId = typeof body.conversationId === "string" && body.conversationId ? body.conversationId : null;
  const existing = conversationId ? await getConversation(user.id, conversationId) : null;
  if (conversationId && !existing) return { ok: false, status: 404, error: "That conversation isn't available to you." };

  const rate = await consumeQuestion(user.id);
  if (!rate.ok) return { ok: false, status: 429, error: `You've reached the limit of ${QUESTIONS_PER_HOUR} questions per hour. Try again in about ${rate.retryInMinutes} minute${rate.retryInMinutes === 1 ? "" : "s"}.` };

  const history = existing ? await historyForModel(user.id, existing._id) : [];
  const conversation = existing ?? (await createConversation(user.id, q.text));
  await addMessage({ conversationId: conversation._id, userId: user.id, role: "user", text: q.text });
  return { ok: true, conversation, isNew: !existing, question: q.text, history };
}

export type TurnResult = { ok: true; message: IntelMessage } | { ok: false; stopped: boolean; error: string };

export async function executeTurn(user: CurrentIntelligenceUser, prep: Extract<PreparedTurn, { ok: true }>, hooks: { signal?: AbortSignal; onStatus?: (s: string) => void } = {}): Promise<TurnResult> {
  const { conversation, question, history } = prep;
  let outcome = "failed";
  let entities: string[] = [];
  let queryCount = 0;
  let rows = 0;
  try {
    const turn = await answerQuestion({ user, question, history, signal: hooks.signal, onStatus: hooks.onStatus });
    const saved = await addMessage({ conversationId: conversation._id, userId: user.id, role: "assistant", text: turn.text, blocks: turn.blocks, queries: turn.queries, tokens: turn.tokens, error: null });
    outcome = turn.outcome;
    entities = turn.entities;
    queryCount = turn.queries.length;
    rows = turn.rows;
    return { ok: true, message: toView(saved) };
  } catch (err) {
    const stopped = hooks.signal?.aborted === true;
    const error = stopped ? "stopped" : friendlyTurnError(err, detectLanguage([...history.filter((h) => h.role === "user").map((h) => h.text), question]));
    if (!stopped) console.error("[intelligence] turn failed", err instanceof Error ? err.message : err);
    await addMessage({ conversationId: conversation._id, userId: user.id, role: "assistant", text: "", error }).catch(() => {});
    outcome = stopped ? "stopped" : "failed";
    return { ok: false, stopped, error };
  } finally {
    // One small, secret-free audit event per question: the question (capped), what was touched and how much — never any result rows.
    await emitEvent("intelligence.question", {
      actorId: user.id,
      entity: { type: "conversation", id: conversation._id, label: question.slice(0, 200), url: `/databrain-ai/c/${conversation._id}` },
      data: { question: question.slice(0, 300), entities: entities.join(", "), queries: queryCount, rows, outcome },
    });
  }
}
