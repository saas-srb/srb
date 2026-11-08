import { withTransport } from "@/lib/security/transport";
import { isBillingLimitError } from "@/lib/platform/billing/enforce";
import { NextRequest, NextResponse } from "next/server";
import { readSafeJson } from "@/lib/security/safe-json";
import type OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/openai";
import { getChatbotConfig } from "@/lib/chatbot-config";
import { sanitizeUserMessage } from "@/lib/prompt-safety";
import { checkRateLimit } from "@/lib/chatbot-rate-limit";
import {
  applyChatCookies,
  resolveSession,
  recordUserMessage,
  recordAssistantMessage,
  getConversationHistory,
} from "@/lib/chatbot-sessions";
import { prepareAnswer, streamAnswer, resolveCitations } from "@/lib/chatbot-rag";
import { checkScope, detectLanguage, refusalText } from "@/lib/ai/policy";
import { getVisitorProfile } from "@/lib/chat-visitors";

// Long-running streamed completion.
export const maxDuration = 300;

/** What a website visitor sees when the company's AI allowance is used up. */
const ASSISTANT_PAUSED = "Our assistant is unavailable right now. Please contact us directly, or try again a little later.";
const GENERIC_ERROR = "Sorry — something went wrong generating a response. Please try again.";

async function handlePOST(req: NextRequest) {
  if (!(await isOpenAIConfigured())) {
    return NextResponse.json(
      { error: "The AI assistant is not configured yet. Please try again later." },
      { status: 503 }
    );
  }

  let body: { message?: unknown; sourcePage?: unknown; voice?: unknown };
  try {
    body = (await readSafeJson(req)) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const isVoice = body.voice === true;

  const config = await getChatbotConfig();
  const sanitized = sanitizeUserMessage(body.message, config.rateLimit.maxMessageChars);
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  const sourcePage = typeof body.sourcePage === "string" ? body.sourcePage : null;
  const { session, cookiesToSet } = await resolveSession(req, { sourcePage });

  if (config.preChat.enabled) {
    const profile = await getVisitorProfile(session.visitorId);
    if (!profile) {
      const res = NextResponse.json(
        { error: "Please introduce yourself before starting the chat.", needsIdentification: true },
        { status: 403 }
      );
      return applyChatCookies(res, cookiesToSet);
    }
  }

  const rateLimit = await checkRateLimit(session.ipHash, config.rateLimit);
  if (!rateLimit.ok) {
    const res = NextResponse.json(
      {
        error:
          rateLimit.scope === "day"
            ? "You've reached today's message limit. Please come back tomorrow or contact our team directly."
            : "You're sending messages too quickly. Please wait a few seconds and try again.",
        retryAfter: rateLimit.retryAfter,
      },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(rateLimit.retryAfter));
    return applyChatCookies(res, cookiesToSet);
  }

  // Persist the user's message up front so it survives a mid-stream failure.
  const userMsg = await recordUserMessage(session.sessionId, sanitized.text, {
    flaggedInjection: sanitized.flaggedInjection,
    voice: isVoice,
  });

  const historyWithNew = await getConversationHistory(session.sessionId, config.contextMessageLimit + 4);
  const priorHistory = historyWithNew.slice(0, -1); // drop the message we just inserted

  const encoder = new TextEncoder();
  const startedAt = Date.now();

  // ---- Scope gate: this assistant speaks only for this company. Anything else gets a short, polite decline in the visitor's language. ----
  const lang = detectLanguage([...priorHistory.filter((m) => m.role === "user").map((m) => m.content), sanitized.text]);
  const lastAssistant = [...priorHistory].reverse().find((m) => m.role === "assistant")?.content;
  if (!(await checkScope({ text: sanitized.text, previousAssistant: lastAssistant, kind: "website" }))) {
    const text = refusalText(lang, "website");
    const readable = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        send({ type: "session", sessionId: session.sessionId });
        send({ type: "delta", text });
        const assistantMsg = await recordAssistantMessage(session.sessionId, { content: text, citations: [], model: "scope-guard", responseTimeMs: Date.now() - startedAt, voice: isVoice });
        send({ type: "done", messageId: String(assistantMsg._id), userMessageId: String(userMsg._id), citations: [] });
        controller.close();
      },
    });
    const res = new NextResponse(readable, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
    return applyChatCookies(res, cookiesToSet);
  }

  // ---- Live mode: OpenAI Responses API ------------------------------------
  let prepared;
  let stream;
  try {
    prepared = await prepareAnswer(priorHistory, sanitized.text);
    stream = await streamAnswer(prepared);
  } catch (err) {
    console.error("chat: failed to start stream", err);
    await recordAssistantMessage(session.sessionId, {
      content: "",
      error: err instanceof Error ? err.message : "stream start failed",
      model: config.model,
      voice: isVoice,
    });
    // The company's AI allowance is used up (or AI isn't in its plan): the visitor sees a plain notice, never billing details.
    if (isBillingLimitError(err)) return applyChatCookies(NextResponse.json({ error: ASSISTANT_PAUSED, paused: true }, { status: 503 }), cookiesToSet);
    const res = NextResponse.json({ error: GENERIC_ERROR }, { status: 502 });
    return applyChatCookies(res, cookiesToSet);
  }

  const model = prepared.config.model;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      send({ type: "session", sessionId: session.sessionId });

      let full = "";
      let finalResponse: OpenAI.Responses.Response | null = null;

      try {
        for await (const event of stream!) {
          switch (event.type) {
            case "response.output_text.delta":
            case "response.refusal.delta":
              full += event.delta;
              send({ type: "delta", text: event.delta });
              break;
            case "response.file_search_call.searching":
            case "response.file_search_call.in_progress":
              send({ type: "status", value: "searching" });
              break;
            case "response.completed":
              finalResponse = event.response;
              break;
            case "response.failed":
              throw new Error(event.response.error?.message ?? "response failed");
            case "error":
              throw new Error(event.message ?? "stream error");
          }
        }

        const citations = finalResponse ? await resolveCitations(finalResponse) : [];
        const usage = finalResponse?.usage;
        const assistantMsg = await recordAssistantMessage(session.sessionId, {
          content: full,
          citations,
          model,
          responseTimeMs: Date.now() - startedAt,
          promptTokens: usage?.input_tokens,
          completionTokens: usage?.output_tokens,
          voice: isVoice,
        });
        send({
          type: "done",
          messageId: String(assistantMsg._id),
          userMessageId: String(userMsg._id),
          citations,
        });
      } catch (err) {
        console.error("chat: stream error", err);
        await recordAssistantMessage(session.sessionId, {
          content: full,
          error: err instanceof Error ? err.message : "stream error",
          model,
          responseTimeMs: Date.now() - startedAt,
          voice: isVoice,
        });
        send({ type: "error", message: isBillingLimitError(err) ? ASSISTANT_PAUSED : GENERIC_ERROR });
      } finally {
        controller.close();
      }
    },
  });

  const res = new NextResponse(readable, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
  return applyChatCookies(res, cookiesToSet);
}

export const POST = withTransport(handlePOST);
