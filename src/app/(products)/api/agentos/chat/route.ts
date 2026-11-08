import { withTransport } from "@/lib/security/transport";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import type OpenAI from "openai";
import { isOpenAIConfigured } from "@/lib/openai";
import { sanitizeUserMessage } from "@/lib/prompt-safety";
import { getViewer, can, AibotsInputError, NotFoundError } from "@/lib/products/agentos/viewer";
import { getUsableBot } from "@/lib/products/agentos/bots";
import { autoTitle, chatsCollection, createChat, ensureConversation, getChat, textChatBlockReason, touchChat, type ChatDoc } from "@/lib/products/agentos/chats";
import { refreshProcessing, friendlyError } from "@/lib/products/agentos/knowledge";
import { botHasKnowledge, buildUserContent, citationTitles, collectCitedFileIds, plainText, popLastTurn, startResponse, type UserContent } from "@/lib/products/agentos/engine";
import { countUserRunsToday, recordRun } from "@/lib/products/agentos/runs";
import { estimateCost, getSettings } from "@/lib/products/agentos/settings";
import { LIMITS } from "@/lib/products/agentos/constants";
import { aiBlockReason } from "@/lib/platform/billing/enforce";

// Long-running streamed completion.
export const maxDuration = 300;

const GENERIC_ERROR = "Sorry — the bot couldn't generate a reply. Please try again.";

function fail(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

/**
 * One chat turn, streamed as SSE. Multipart body: `botId`, optional `chatId`
 * (absent → a new chat + OpenAI Conversation), `message`, optional `files`,
 * or `regenerate=1` (with `chatId`) to re-run the last turn.
 *
 * Everything that matters is resolved server-side from the SESSION: who the
 * user is, whether they may use this bot, and whether the chat is theirs. The
 * OpenAI key never leaves the server; the client only ever sees text deltas.
 */
async function handlePOST(req: NextRequest) {
  const viewer = await getViewer();
  if (!viewer) return fail("Your session has expired — please sign in again.", 401);
  if (!can(viewer, "USE_BOT") && !can(viewer, "EDIT_BOT")) return fail("You don't have permission to use AI bots.", 403);
  if (!(await isOpenAIConfigured())) return fail("OpenAI isn't connected for this workspace yet (Settings → Integrations). Connect OpenAI in Workspace → Settings → Integrations.", 503);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("That message could not be read.", 400);
  }
  const botId = String(form.get("botId") ?? "");
  const chatId = String(form.get("chatId") ?? "") || null;
  const regenerate = form.get("regenerate") === "1";
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  const settings = await getSettings();
  let bot;
  let chat: ChatDoc | null = null;
  try {
    bot = await getUsableBot(viewer, botId);
    if (chatId) {
      chat = await getChat(viewer, chatId);
      if (chat.botId !== bot._id) throw new NotFoundError();
    }
  } catch {
    return fail("That bot or chat isn't available to you.", 404);
  }

  const textBlock = textChatBlockReason(bot, chat);
  if (textBlock) return fail(textBlock, 400);

  const planBlock = await aiBlockReason();
  if (planBlock) return fail(planBlock, 402);

  if (settings.dailyMessageLimit > 0 && (await countUserRunsToday(viewer.userId)) >= settings.dailyMessageLimit) {
    return fail(`You've reached today's limit of ${settings.dailyMessageLimit} messages. It resets at midnight.`, 429);
  }

  let content: UserContent;
  let isNew = false;
  try {
    if (regenerate) {
      if (!chat?.conversationId) return fail("There's nothing to regenerate yet.", 400);
      const popped = await popLastTurn(chat.conversationId);
      if (!popped) return fail("There's nothing to regenerate yet.", 400);
      content = popped;
    } else {
      const sanitized = sanitizeUserMessage(form.get("message"), LIMITS.messageMax);
      if (!sanitized.ok) return fail(sanitized.error ?? "Type a message.", 400);
      if (files.length > 0 && !bot.allowAttachments) return fail("This bot doesn't accept file attachments.", 400);
      content = await buildUserContent(sanitized.text, files);
      if (!chat) {
        chat = await createChat(viewer, bot._id, sanitized.text);
        isNew = true;
        // The sidebar lists agents the viewer has chatted with: a first chat adds this one.
        revalidatePath("/agentos", "layout");
      } else {
        await ensureConversation(chat);
      }
    }
  } catch (err) {
    if (err instanceof AibotsInputError) return fail(err.message, 400);
    console.error("[aibots chat] prepare failed", friendlyError(err));
    return fail(GENERIC_ERROR, 502);
  }

  // Keep "processing" knowledge files honest before deciding whether to search them.
  await refreshProcessing(bot).catch(() => {});
  const hasKnowledge = await botHasKnowledge(bot);
  const startedAt = Date.now();
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort());
  const runBase = { chatId: chat._id, botId: bot._id, userId: viewer.userId, model: bot.model, regenerate };

  let stream: AsyncIterable<OpenAI.Responses.ResponseStreamEvent>;
  try {
    stream = await startResponse({ bot, conversationId: chat.conversationId!, content, maxOutputTokens: settings.maxOutputTokens, hasKnowledge, signal: abort.signal });
  } catch (err) {
    console.error("[aibots chat] start failed", friendlyError(err));
    await recordRun({ ...runBase, responseId: null, status: "failed", inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: Date.now() - startedAt, error: friendlyError(err) });
    return fail(GENERIC_ERROR, 502);
  }

  // First turn of a fresh chat, or a regenerate of a never-renamed chat, keeps its auto title in sync.
  if (!isNew && !chat.titleLocked && chat.turns === 0) {
    const title = autoTitle(plainText(content));
    await (await chatsCollection()).updateOne({ _id: chat._id }, { $set: { title } });
    chat.title = title;
  }

  const encoder = new TextEncoder();
  const activeChat = chat;
  const activeBot = bot;
  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (obj: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch {
          closed = true;
        }
      };
      send({ type: "chat", chatId: activeChat._id, title: activeChat.title, isNew });

      let final: OpenAI.Responses.Response | null = null;
      try {
        for await (const event of stream) {
          switch (event.type) {
            case "response.output_text.delta":
            case "response.refusal.delta":
              send({ type: "delta", text: event.delta });
              break;
            case "response.file_search_call.searching":
            case "response.file_search_call.in_progress":
              send({ type: "status", value: "searching" });
              break;
            case "response.completed":
            case "response.incomplete":
              final = event.response;
              break;
            case "response.failed":
              throw new Error(event.response.error?.message ?? "response failed");
            case "error":
              throw new Error(event.message ?? "stream error");
          }
        }
        // An aborted request ends the SDK stream quietly rather than throwing.
        if (abort.signal.aborted) throw new Error("stopped");
        if (!final) throw new Error("The stream ended without a completed response");
        const usage = final.usage;
        const inputTokens = usage?.input_tokens ?? 0;
        const outputTokens = usage?.output_tokens ?? 0;
        await recordRun({
          ...runBase,
          responseId: final?.id ?? null,
          status: "completed",
          inputTokens,
          outputTokens,
          costUsd: estimateCost(settings, activeBot.model, inputTokens, outputTokens),
          durationMs: Date.now() - startedAt,
          error: null,
        });
        await touchChat(activeChat._id, { countTurn: !regenerate });
        const citations = await citationTitles(activeBot._id, collectCitedFileIds(final));
        send({ type: "done", citations, incomplete: final?.status === "incomplete" });
      } catch (err) {
        const stopped = abort.signal.aborted;
        await recordRun({ ...runBase, responseId: final?.id ?? null, status: stopped ? "stopped" : "failed", inputTokens: 0, outputTokens: 0, costUsd: 0, durationMs: Date.now() - startedAt, error: stopped ? null : friendlyError(err) });
        await touchChat(activeChat._id, { countTurn: false });
        if (!stopped) {
          console.error("[aibots chat] stream failed", friendlyError(err));
          send({ type: "error", message: GENERIC_ERROR });
        }
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by the client
          }
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new NextResponse(readable, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}

export const POST = withTransport(handlePOST);
