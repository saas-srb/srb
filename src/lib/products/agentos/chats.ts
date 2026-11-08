import { setAiFeature } from "@/lib/platform/billing/ai-usage-log";
import "server-only";
import type OpenAI from "openai";
import { getOpenAI } from "@/lib/openai";
import { COLLECTIONS, aibotsCollection, escapeRegex, newId, notDeleted, str } from "@/lib/products/agentos/db";
import { ATTACHMENT_MARKER, LIMITS } from "@/lib/products/agentos/constants";
import { AibotsInputError, NotFoundError, can, type AibotsViewer } from "@/lib/products/agentos/viewer";

/**
 * A chat is a pointer: our metadata (owner, bot, title) + the id of the OpenAI
 * Conversation that holds the actual transcript and context. Messages are
 * never copied into Mongo — `loadTranscript` reads them back from OpenAI.
 */

export interface ChatDoc {
  _id: string;
  botId: string;
  userId: string;
  userEmail: string;
  title: string;
  /** Set when the user renames — stops the auto-title from overwriting it. */
  titleLocked: boolean;
  conversationId: string | null;
  turns: number;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  /** Voice calls only: the ElevenLabs conversation and its transcript (see voice/calls.ts). Absent on text chats. */
  voiceCall?: VoiceCallRecord;
}

export interface VoiceCallRecord {
  /** ElevenLabs conversation id, set when the call connects. */
  conversationId: string | null;
  status: "started" | "processing" | "done" | "failed";
  durationSecs: number | null;
  transcript: { role: "agent" | "user"; text: string; atSecs: number | null }[] | null;
  /** Set once the call's seconds were counted against the plan (never twice). */
  meteredAt: Date | null;
  /** While a worker is counting the seconds: others skip until it passes. Cleared when counting fails, so the next visit retries. */
  meterLeaseUntil?: Date | null;
  /** Kept from ElevenLabs when the call settles, so history survives their retention window. All absent on older calls. */
  hasAudio?: boolean | null;
  summary?: string | null;
  summaryTitle?: string | null;
  callSuccess?: "success" | "failure" | "unknown" | null;
  dataCollection?: { key: string; value: string }[];
  terminationReason?: string | null;
}

export interface ChatListItem {
  _id: string;
  botId: string;
  title: string;
  turns: number;
  lastMessageAt: string;
  userEmail: string;
}

export const toListItem = (c: ChatDoc): ChatListItem => ({
  _id: c._id,
  botId: c.botId,
  title: c.title,
  turns: c.turns,
  lastMessageAt: c.lastMessageAt.toISOString(),
  userEmail: c.userEmail,
});

let indexesEnsured = false;
export async function chatsCollection() {
  const col = await aibotsCollection<ChatDoc>(COLLECTIONS.chats);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      col.createIndex({ userId: 1, botId: 1, deletedAt: 1, lastMessageAt: -1 }).catch(() => {}),
      col.createIndex({ deletedAt: 1, lastMessageAt: -1 }).catch(() => {}),
    ]);
  }
  return col;
}

export async function listMyChats(viewer: AibotsViewer, botId: string, limit = 300): Promise<ChatListItem[]> {
  const col = await chatsCollection();
  const rows = await col.find({ userId: viewer.userId, botId, ...notDeleted }).sort({ lastMessageAt: -1 }).limit(limit).toArray();
  return rows.map(toListItem);
}

/** The viewer's own chat, or (with VIEW_CHATS) anyone's. Throws NotFound otherwise. */
/** Why a text chat turn must be refused, or null. Voice agents are only used by calling them; a voice call's row never carries text turns. */
export function textChatBlockReason(bot: { kind?: "text" | "voice" | null }, chat: { voiceCall?: unknown } | null): string | null {
  if (bot.kind === "voice") return "This is a voice agent. Start a call to talk to it.";
  if (chat?.voiceCall) return "This conversation is a voice call and can't take text messages.";
  return null;
}

export async function getChat(viewer: AibotsViewer, chatId: string, opts: { allowOversight?: boolean } = {}): Promise<ChatDoc> {
  if (typeof chatId !== "string" || chatId.length > 64) throw new NotFoundError();
  const col = await chatsCollection();
  const chat = await col.findOne({ _id: chatId, ...notDeleted });
  if (!chat) throw new NotFoundError();
  if (chat.userId === viewer.userId) return chat;
  if (opts.allowOversight && can(viewer, "VIEW_CHATS")) return chat;
  throw new NotFoundError();
}

export function autoTitle(message: string): string {
  const oneLine = message.replace(ATTACHMENT_MARKER, "").replace(/\s+/g, " ").trim();
  return (oneLine.length > 60 ? `${oneLine.slice(0, 57).trimEnd()}…` : oneLine) || "New chat";
}

/** Creates the chat row and its OpenAI Conversation (the per-chat context container). */
export async function createChat(viewer: AibotsViewer, botId: string, firstMessage: string): Promise<ChatDoc> {
  setAiFeature("AI Bots");
  const openai = await getOpenAI();
  const conversation = await openai.conversations.create({ metadata: { app: "aibots", bot_id: botId, user_id: viewer.userId } });
  const now = new Date();
  const chat: ChatDoc = {
    _id: newId(),
    botId,
    userId: viewer.userId,
    userEmail: viewer.email,
    title: autoTitle(firstMessage),
    titleLocked: false,
    conversationId: conversation.id,
    turns: 0,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const col = await chatsCollection();
  await col.insertOne(chat);
  return chat;
}

/**
 * The chat's OpenAI Conversation, created on first use when the chat has none
 * (e.g. demo chats seeded without an OpenAI key).
 */
export async function ensureConversation(chat: ChatDoc): Promise<string> {
  if (chat.conversationId) return chat.conversationId;
  const conversation = await (await getOpenAI()).conversations.create({ metadata: { app: "aibots", bot_id: chat.botId, user_id: chat.userId } });
  const col = await chatsCollection();
  await col.updateOne({ _id: chat._id, conversationId: null }, { $set: { conversationId: conversation.id } });
  chat.conversationId = conversation.id;
  return conversation.id;
}

export async function touchChat(chatId: string, opts: { countTurn: boolean }): Promise<void> {
  const col = await chatsCollection();
  const now = new Date();
  await col.updateOne({ _id: chatId }, { $set: { lastMessageAt: now, updatedAt: now }, ...(opts.countTurn ? { $inc: { turns: 1 } } : {}) });
}

export async function renameChat(viewer: AibotsViewer, chatId: string, title: unknown): Promise<ChatDoc> {
  const chat = await getChat(viewer, chatId);
  const clean = str(title, LIMITS.chatTitleMax);
  if (!clean) throw new AibotsInputError("Give the chat a title.");
  const col = await chatsCollection();
  await col.updateOne({ _id: chat._id }, { $set: { title: clean, titleLocked: true, updatedAt: new Date() } });
  return chat;
}

/** Owners can always delete their chat; DELETE_CHATS deletes anyone's. The OpenAI Conversation goes too. */
export async function deleteChat(viewer: AibotsViewer, chatId: string): Promise<ChatDoc> {
  const col = await chatsCollection();
  const chat = await col.findOne({ _id: chatId, ...notDeleted });
  if (!chat || (chat.userId !== viewer.userId && !can(viewer, "DELETE_CHATS"))) throw new NotFoundError();
  await col.updateOne({ _id: chat._id }, { $set: { deletedAt: new Date() } });
  if (chat.conversationId) await (await getOpenAI()).conversations.delete(chat.conversationId).catch(() => {});
  return chat;
}

export interface OversightQuery {
  botId?: string;
  q?: string;
  page?: number;
}

export async function listAllChats(query: OversightQuery) {
  const col = await chatsCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (query.botId) filter.botId = query.botId;
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q.slice(0, 80)), "i");
    filter.$or = [{ title: rx }, { userEmail: rx }];
  }
  const pageSize = 40;
  const page = Math.max(query.page ?? 1, 1);
  const [rows, total] = await Promise.all([col.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), col.countDocuments(filter)]);
  return { items: rows.map(toListItem), total, page, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

// ---------------------------------------------------------------------------
// Transcript — read back from the OpenAI Conversation
// ---------------------------------------------------------------------------

export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments: string[];
  /** OpenAI file ids cited by file_search (resolved to titles by the caller). */
  citedFileIds: string[];
}

type Item = OpenAI.Conversations.ConversationItem;

/** Splits our inline attachment marker off an input_text part: `[[yo-attachment:name]]\n…`. */
export function parseAttachmentPart(text: string): string | null {
  if (!text.startsWith(ATTACHMENT_MARKER)) return null;
  const end = text.indexOf("]]");
  return end > 0 ? text.slice(ATTACHMENT_MARKER.length, end) : null;
}

export async function listConversationItems(conversationId: string): Promise<Item[]> {
  setAiFeature("AI Bots");
  const openai = await getOpenAI();
  const out: Item[] = [];
  for await (const item of openai.conversations.items.list(conversationId, { order: "asc", limit: 100 })) {
    out.push(item);
    if (out.length >= 2000) break;
  }
  return out;
}

export function itemsToTranscript(items: Item[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = [];
  for (const item of items) {
    if (item.type !== "message" || (item.role !== "user" && item.role !== "assistant")) continue;
    const texts: string[] = [];
    const attachments: string[] = [];
    const cited = new Set<string>();
    for (const part of item.content ?? []) {
      if (part.type === "input_text") {
        const name = parseAttachmentPart(part.text);
        if (name) attachments.push(name);
        else texts.push(part.text);
      } else if (part.type === "output_text") {
        texts.push(part.text);
        for (const a of part.annotations ?? []) if (a.type === "file_citation") cited.add(a.file_id);
      } else if (part.type === "refusal") {
        texts.push(part.refusal);
      }
    }
    const role = item.role;
    const prev = out[out.length - 1];
    // Several assistant items in one turn (e.g. around a tool call) render as one reply.
    if (role === "assistant" && prev?.role === "assistant") {
      prev.text = [prev.text, ...texts].filter(Boolean).join("\n\n");
      cited.forEach((c) => prev.citedFileIds.push(c));
      continue;
    }
    out.push({ id: item.id ?? newId(), role, text: texts.join("\n\n"), attachments, citedFileIds: [...cited] });
  }
  return out;
}

export async function loadTranscript(chat: ChatDoc): Promise<TranscriptMessage[]> {
  if (!chat.conversationId) return [];
  return itemsToTranscript(await listConversationItems(chat.conversationId));
}
