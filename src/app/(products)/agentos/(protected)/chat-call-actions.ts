"use server";

import { revalidatePath } from "next/cache";
import { getChat, loadTranscript, touchChat, ensureConversation } from "@/lib/products/agentos/chats";
import { getOpenAI } from "@/lib/openai";
import { cancelCall } from "@/lib/products/agentos/calls/engine";
import { endCall, liveCapabilities } from "@/lib/products/agentos/calls/live";
import { loadCallForViewer } from "@/lib/products/agentos/calls/engine";
import { NO_ACCOUNT_MESSAGE, NO_PERMISSION_MESSAGE, runCallAction, type ActionResult } from "@/lib/products/agentos/calls/action-run";
import { buildChatSummary, voiceCallNote } from "@/lib/products/agentos/chat-call";
import { getBot } from "@/lib/products/agentos/bots";
import { AibotsInputError } from "@/lib/products/agentos/viewer";
import type { CallStatus } from "@/lib/products/agentos/calls/types";

/**
 * Server actions for starting a call from inside a text chat. The person comes from the session cookie; the chat must be theirs
 * (getChat without oversight). Nothing here reads chat text unless the person asked for the summary.
 */

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/** The opt-in summary: built on the server from the person's own chat, no AI call, bounded to the call-notes limit. */
export async function loadChatSummaryAction(chatId: string): Promise<ActionResult<{ summary: string }>> {
  return runCallAction({ noSession: NO_ACCOUNT_MESSAGE }, async (v) => {
    const chat = await getChat(v, str(chatId, 64));
    const messages = await loadTranscript(chat);
    return { summary: buildChatSummary(messages, chat.title) };
  });
}

export interface ChatCallStatus {
  status: CallStatus;
  scheduledFor: string | null;
  canEnd: boolean;
}

/** Light status for the header chip. Only the person's own visible call (the engine's own visibility rules apply). */
export async function chatCallStatusAction(callId: string): Promise<ActionResult<{ call: ChatCallStatus }>> {
  return runCallAction({ noSession: NO_ACCOUNT_MESSAGE }, async (v) => {
    const c = await loadCallForViewer(v, str(callId, 64), false);
    return { call: { status: c.status, scheduledFor: c.scheduledFor?.toISOString() ?? null, canEnd: liveCapabilities(c).endCall } };
  });
}

/** Ends a live call, or cancels one that is still scheduled. */
export async function endChatCallAction(callId: string): Promise<ActionResult<{ ended: true }>> {
  return runCallAction({ permission: "VOICE_CALL", write: true, noSession: NO_ACCOUNT_MESSAGE, noPermission: NO_PERMISSION_MESSAGE }, async (v) => {
    const id = str(callId, 64);
    const c = await loadCallForViewer(v, id, false);
    const res = c.status === "scheduled" ? await cancelCall(v, id) : await endCall(v, id);
    if (!res.ok) return { ok: false as const, error: res.failure.message, failure: res.failure };
    revalidatePath("/agentos/calls");
    return { ok: true as const, ended: true as const };
  });
}

/** Adds a short note to the chat's conversation that a voice call happened, with a link to it. The person asked for it. */
export async function postVoiceCallNoteAction(chatId: string, input: { agentId: string; callId: string; kind: "talk" | "phone" }): Promise<ActionResult<{ text: string }>> {
  return runCallAction({ write: true, noSession: NO_ACCOUNT_MESSAGE }, async (v) => {
    const chat = await getChat(v, str(chatId, 64));
    const callId = str(input?.callId, 64);
    if (!callId) throw new AibotsInputError("There is no call to link to.");
    // The call must be one this person may see (their own voice call chat row, or an engine call they can open).
    const own = await getChat(v, callId).catch(() => null);
    if (!own?.voiceCall) await loadCallForViewer(v, callId, false);
    const bot = await getBot(str(input?.agentId, 64)).catch(() => null);
    const text = voiceCallNote(bot?.name ?? "", callId, input?.kind === "phone" ? "phone" : "talk");
    const conversationId = await ensureConversation(chat);
    const openai = await getOpenAI();
    await openai.conversations.items.create(conversationId, { items: [{ type: "message", role: "user", content: [{ type: "input_text", text }] }] });
    await touchChat(chat._id, { countTurn: false });
    return { text };
  });
}
