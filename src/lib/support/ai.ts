import { getPrompt } from "@/lib/prompts/store";
import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import type OpenAI from "openai";
import { getOpenAI, isOpenAIConfigured, isUnsupportedParamError } from "@/lib/openai";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { checkScope, detectLanguage, englishSearchQuery, languageBlock, refusalText, say, scopeBlock } from "@/lib/ai/policy";
import { sanitizeUserMessage } from "@/lib/prompt-safety";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { ASSISTANT_MODEL } from "@/lib/platform/ai/assistant";
import { searchArticles, type ArticleView } from "@/lib/support/articles";
import { getSupportConfig } from "@/lib/support/config";
import { findSimilar, type RequestView } from "@/lib/support/requests";
import type { AiAnalysis, ChatTurn, HelpSource, RequestContext } from "@/lib/support/types";

/**
 * AI for the Help & Support Center. It is SelfRun AI's service, so every model call runs with the platform's own OpenAI
 * connection (the platform-owner company's), never the asking company's key — and the answers are grounded ONLY in
 * the help articles SelfRun AI publishes (retrieved per question). With nothing relevant to ground on, the assistant
 * says so and offers to open a request instead of guessing.
 */

const MAX_QUESTION = 1000;
const NO_ANSWER = "[[NO_ANSWER]]";

type Out = { type: string; content?: { type: string; text?: string }[] };
const textOf = (output: Out[]) =>
  output
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content ?? [])
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("")
    .trim();

/** Runs `fn` with the platform's OpenAI client. `null` = AI isn't available (no key); throws are left to the caller. */
async function withPlatformAi<T>(fn: (call: (params: Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "model" | "store">) => Promise<string>) => Promise<T>): Promise<T | null> {
  const ownerId = await getPlatformOwnerCompanyId();
  if (!ownerId) return null;
  return runAsCompany(ownerId, async () => {
    if (!(await isOpenAIConfigured())) return null;
    setAiFeature("Help assistant");
    const openai = await getOpenAI();
    const call = async (params: Omit<OpenAI.Responses.ResponseCreateParamsNonStreaming, "model" | "store">) => {
      const base = { model: ASSISTANT_MODEL, store: false, ...params } as OpenAI.Responses.ResponseCreateParamsNonStreaming;
      try {
        const res = await openai.responses.create({ ...base, temperature: 0.2 }, { signal: AbortSignal.timeout(45_000) });
        return textOf(res.output as unknown as Out[]);
      } catch (err) {
        if (!isUnsupportedParamError(err, "temperature")) throw err;
        const res = await openai.responses.create(base, { signal: AbortSignal.timeout(45_000) });
        return textOf(res.output as unknown as Out[]);
      }
    };
    return fn(call);
  });
}

function parseJson<T>(raw: string): T | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
}

const ctxLine = (c: Partial<RequestContext> | null | undefined) =>
  c ? [c.panel && `product: ${c.panel}`, c.page && `page: ${c.page}`, c.route && `route: ${c.route}`, c.feature && `feature: ${c.feature}`].filter(Boolean).join(", ") : "";

const articleBlock = (articles: ArticleView[]) =>
  articles.map((a, i) => `<article n="${i + 1}" slug="${a.slug}" title="${a.title.replace(/"/g, "'")}">\n${a.body.slice(0, 2500)}\n</article>`).join("\n");

// ── 1. The help chatbot ─────────────────────────────────────────────────────────────────────────────────────────────
export type HelpAnswer = { ok: true; answer: string; sources: HelpSource[]; needsRequest: boolean; ai: boolean } | { ok: false; error: string };


export async function askHelp(input: { messages: ChatTurn[]; context?: Partial<RequestContext> | null }): Promise<HelpAnswer> {
  const turns = (Array.isArray(input.messages) ? input.messages : []).filter((t) => (t?.role === "user" || t?.role === "assistant") && typeof t.text === "string").slice(-10);
  const last = [...turns].reverse().find((t) => t.role === "user");
  const q = sanitizeUserMessage(last?.text, MAX_QUESTION);
  if (!q.ok) return { ok: false, error: q.error ?? "Type a question first." };

  const lang = detectLanguage(turns.filter((t) => t.role === "user").map((t) => t.text));
  if (!(await checkScope({ text: q.text, previousAssistant: [...turns].reverse().find((t) => t.role === "assistant")?.text, kind: "support" }))) return { ok: true, answer: refusalText(lang, "support"), sources: [], needsRequest: false, ai: true };

  const panel = input.context?.panel ?? null;
  const articles = await searchArticles(`${await englishSearchQuery(q.text, lang)} ${input.context?.feature ?? ""}`, { limit: 5, panel });
  const noInfo = say("helpNoInfo", lang);
  if (articles.length === 0) return { ok: true, answer: noInfo, sources: [], needsRequest: true, ai: false };

  const sources = articles.slice(0, 3).map((a) => ({ slug: a.slug, title: a.title }));
  try {
    const answer = await withPlatformAi(async (call) =>
      call({
        instructions: await getPrompt("support.help.system", { rules: await getPrompt("support.help.rules", { no_answer: NO_ANSWER }), scope_block: await scopeBlock("support"), language_block: await languageBlock(lang), location: ctxLine(input.context) || "unknown", articles: articleBlock(articles) }),
        input: turns.map((t, i) => ({ role: t.role, content: i === turns.lastIndexOf(last!) ? q.text : sanitizeUserMessage(t.text, 2000).text })) as never,
        max_output_tokens: 500,
      }),
    );
    if (answer === null) {
      // No AI connection: still useful — point at the best-matching articles.
      return { ok: true, answer: say("helpFound", lang).replace("{titles}", articles.slice(0, 3).map((a) => `“${a.title}”`).join(", ")), sources, needsRequest: false, ai: false };
    }
    if (!answer || answer.includes(NO_ANSWER)) return { ok: true, answer: noInfo, sources: [], needsRequest: true, ai: true };
    return { ok: true, answer: answer.slice(0, 2500), sources, needsRequest: false, ai: true };
  } catch (err) {
    if (isBillingLimitError(err)) return { ok: false, error: say("helpAiLimit", lang) };
    console.error("[support] help answer failed", err);
    return { ok: false, error: say("helpDown", lang) };
  }
}

// ── 2. Turn a conversation into a request draft ─────────────────────────────────────────────────────────────────────
export interface RequestDraft {
  title: string;
  description: string;
  type: string;
  priority: string;
  category: string | null;
}

export async function draftRequestFromChat(input: { messages: ChatTurn[]; context?: Partial<RequestContext> | null }): Promise<RequestDraft> {
  const cfg = await getSupportConfig();
  const types = cfg.types.filter((t) => t.active);
  const priorities = cfg.priorities.filter((p) => p.active);
  const turns = (Array.isArray(input.messages) ? input.messages : []).filter((t) => t?.text).slice(-12);
  const firstUser = turns.find((t) => t.role === "user")?.text ?? "";
  const fallback: RequestDraft = {
    title: firstUser.replace(/\s+/g, " ").slice(0, 100) || "Help needed",
    description: turns.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n\n").slice(0, 6000),
    type: types.find((t) => t.key === "help")?.key ?? types[0].key,
    priority: priorities.find((p) => p.key === "normal")?.key ?? priorities[0].key,
    category: null,
  };
  try {
    const raw = await withPlatformAi(async (call) =>
      call({
        instructions: await getPrompt("support.draft", { types: types.map((t) => t.key).join(", "), priorities: priorities.map((p) => p.key).join(", "), categories: cfg.categories.filter((c) => c.active).map((c) => c.key).join(", "), location: ctxLine(input.context) || "unknown" }),
        input: turns.map((t) => `${t.role}: ${t.text.slice(0, 1500)}`).join("\n") as never,
        max_output_tokens: 700,
      }),
    );
    const j = raw ? parseJson<Partial<RequestDraft>>(raw) : null;
    if (!j) return fallback;
    return {
      title: String(j.title ?? "").trim().slice(0, 160) || fallback.title,
      description: String(j.description ?? "").trim().slice(0, 8000) || fallback.description,
      type: types.some((t) => t.key === j.type) ? String(j.type) : fallback.type,
      priority: priorities.some((p) => p.key === j.priority) ? String(j.priority) : fallback.priority,
      category: cfg.categories.some((c) => c.active && c.key === j.category) ? String(j.category) : null,
    };
  } catch (err) {
    console.error("[support] draft failed", err);
    return fallback;
  }
}

// ── 3. Request intelligence for SelfRun AI staff (suggestions only — a person reviews and applies them) ─────────────
export async function analyzeRequest(req: RequestView): Promise<AiAnalysis> {
  const cfg = await getSupportConfig();
  const [similar, articles] = await Promise.all([findSimilar(req), searchArticles(`${req.title} ${req.description}`.slice(0, 400), { limit: 4, panel: req.context?.panel ?? null })]);
  const base: AiAnalysis = {
    at: new Date().toISOString(),
    summary: req.description.replace(/\s+/g, " ").slice(0, 240),
    category: null,
    priority: null,
    team: null,
    duplicateOf: similar.map((s) => ({ id: s.id, number: s.number, title: s.title })),
    similarCount: similar.length,
    suggestedReply: "",
    articles: articles.map((a) => ({ slug: a.slug, title: a.title })),
    note: null,
  };
  try {
    const raw = await withPlatformAi(async (call) =>
      call({
        instructions: await getPrompt("support.analyze", { categories: cfg.categories.filter((c) => c.active).map((c) => c.key).join(", "), priorities: cfg.priorities.filter((p) => p.active).map((p) => p.key).join(", "), teams: cfg.teams.filter((t) => t.active).map((t) => t.key).join(", ") }),
        input: `Type: ${req.type}\nTitle: ${req.title}\nDescription: ${req.description.slice(0, 3000)}\nFields: ${JSON.stringify(req.fields)}\nLocation: ${ctxLine(req.context) || "unknown"}\nError: ${req.context?.errorInfo ?? "none"}\nSimilar open requests: ${similar.map((s) => `#${s.number} ${s.title}`).join("; ") || "none"}\n\nHelp articles:\n${articleBlock(articles)}` as never,
        max_output_tokens: 700,
      }),
    );
    if (raw === null) return { ...base, note: "AI isn't connected, so only keyword-based duplicate and article suggestions are shown." };
    const j = parseJson<Partial<AiAnalysis>>(raw);
    if (!j) return { ...base, note: "The AI reply couldn't be read; showing keyword-based suggestions only." };
    return {
      ...base,
      summary: String(j.summary ?? "").trim().slice(0, 600) || base.summary,
      category: cfg.categories.some((c) => c.key === j.category) ? String(j.category) : null,
      priority: cfg.priorities.some((p) => p.key === j.priority) ? String(j.priority) : null,
      team: cfg.teams.some((t) => t.key === j.team) ? String(j.team) : null,
      suggestedReply: String(j.suggestedReply ?? "").trim().slice(0, 3000),
    };
  } catch (err) {
    console.error("[support] analysis failed", err);
    return { ...base, note: isBillingLimitError(err) ? err.message : "AI analysis failed; showing keyword-based suggestions only." };
  }
}
