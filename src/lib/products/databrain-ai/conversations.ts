import "server-only";
import { randomUUID } from "node:crypto";
import { getDb } from "@/lib/mongodb";
import type { Block, IntelMessage, StoredQuery } from "@/lib/products/databrain-ai/blocks";

/**
 * AI Intelligence conversations. Three small company-scoped collections
 * (`intel_conversations`, `intel_messages`, `intel_rate` — the Atlas cluster
 * has a 500-collection ceiling). Every read and write is keyed by the signed-in
 * user: people see only their own history (no admin oversight — an answer can
 * contain data its reader is not entitled to see, so another user's chat must
 * never be shown to them).
 */

export const CONVERSATIONS = "intel_conversations";
export const MESSAGES = "intel_messages";
export const RATE = "intel_rate";
export const QUESTIONS_PER_HOUR = 30;
export const MAX_QUESTION_CHARS = 1000;
const TITLE_MAX = 80;

export interface ConversationDoc {
  _id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}
export interface MessageDoc {
  _id: string;
  conversationId: string;
  userId: string;
  role: "user" | "assistant";
  text: string;
  blocks: Block[];
  queries: StoredQuery[];
  tokens: number;
  error: string | null;
  createdAt: Date;
}
export interface ConversationListItem {
  id: string;
  title: string;
  updatedAt: string;
}

let indexed = false;
async function cols() {
  const db = await getDb();
  const conversations = db.collection<ConversationDoc>(CONVERSATIONS);
  const messages = db.collection<MessageDoc>(MESSAGES);
  const rate = db.collection<{ _id?: string; userId: string; window: string; count: number; expiresAt: Date }>(RATE);
  if (!indexed) {
    // Awaited: the rate limiter's unique index must exist before concurrent upserts.
    await Promise.all([
      conversations.createIndex({ userId: 1, updatedAt: -1 }),
      messages.createIndex({ conversationId: 1, createdAt: 1 }),
      rate.createIndex({ userId: 1, window: 1 }, { unique: true }),
      rate.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]).catch(() => {});
    indexed = true;
  }
  return { conversations, messages, rate };
}

export const titleFrom = (question: string) => {
  const t = question.replace(/\s+/g, " ").trim();
  return t.length > TITLE_MAX ? `${t.slice(0, TITLE_MAX - 1)}…` : t;
};

export async function createConversation(userId: string, firstQuestion: string): Promise<ConversationDoc> {
  const { conversations } = await cols();
  const now = new Date();
  const doc: ConversationDoc = { _id: randomUUID(), userId, title: titleFrom(firstQuestion), createdAt: now, updatedAt: now };
  await conversations.insertOne(doc);
  return doc;
}

/** The user's OWN conversation, or null (another user's id is indistinguishable from a missing one). */
export async function getConversation(userId: string, id: string): Promise<ConversationDoc | null> {
  if (typeof id !== "string" || id.length === 0 || id.length > 64) return null;
  const { conversations } = await cols();
  return conversations.findOne({ _id: id, userId });
}

export async function listConversations(userId: string, limit = 50): Promise<ConversationListItem[]> {
  const { conversations } = await cols();
  const rows = await conversations.find({ userId }).sort({ updatedAt: -1 }).limit(limit).toArray();
  return rows.map((c) => ({ id: c._id, title: c.title, updatedAt: c.updatedAt.toISOString() }));
}

export async function deleteConversation(userId: string, id: string): Promise<boolean> {
  const { conversations, messages } = await cols();
  const owned = await conversations.findOne({ _id: id, userId }, { projection: { _id: 1 } });
  if (!owned) return false;
  await messages.deleteMany({ conversationId: id, userId });
  await conversations.deleteOne({ _id: id, userId });
  return true;
}

export async function addMessage(m: Omit<MessageDoc, "_id" | "createdAt" | "blocks" | "queries" | "tokens" | "error"> & Partial<Pick<MessageDoc, "blocks" | "queries" | "tokens" | "error">>): Promise<MessageDoc> {
  const { messages, conversations } = await cols();
  const doc: MessageDoc = { blocks: [], queries: [], tokens: 0, error: null, ...m, _id: randomUUID(), createdAt: new Date() };
  await messages.insertOne(doc);
  await conversations.updateOne({ _id: m.conversationId, userId: m.userId }, { $set: { updatedAt: new Date() } });
  return doc;
}

export const toView = (m: MessageDoc): IntelMessage => ({ id: m._id, role: m.role, text: m.text, blocks: m.blocks, queries: m.queries, error: m.error, createdAt: m.createdAt.toISOString() });

export async function listMessages(userId: string, conversationId: string): Promise<IntelMessage[]> {
  const { messages } = await cols();
  return (await messages.find({ conversationId, userId }).sort({ createdAt: 1 }).limit(200).toArray()).map(toView);
}

/**
 * The earlier turns as plain text for the model — never raw rows — newest
 * kept first within a character budget (≈ a few thousand tokens).
 */
export async function historyForModel(userId: string, conversationId: string, opts: { maxMessages?: number; budgetChars?: number } = {}): Promise<{ role: "user" | "assistant"; text: string }[]> {
  const { messages } = await cols();
  const rows = await messages.find({ conversationId, userId, error: null }, { projection: { role: 1, text: 1 } }).sort({ createdAt: -1 }).limit(opts.maxMessages ?? 12).toArray();
  let budget = opts.budgetChars ?? 6000;
  const kept: { role: "user" | "assistant"; text: string }[] = [];
  for (const r of rows) {
    const text = r.text.slice(0, 1200);
    if (!text.trim() || budget - text.length < 0) break;
    budget -= text.length;
    kept.push({ role: r.role, text });
  }
  return kept.reverse();
}

/** Per-user, per-hour question counter (DB-backed, so it holds across serverless instances). */
export async function consumeQuestion(userId: string, now = new Date()): Promise<{ ok: true; used: number } | { ok: false; retryInMinutes: number }> {
  const { rate } = await cols();
  const window = now.toISOString().slice(0, 13); // yyyy-mm-ddThh (UTC hour)
  const expiresAt = new Date(Date.parse(`${window}:00:00Z`) + 2 * 3600_000);
  const doc = await rate.findOneAndUpdate({ userId, window }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true, returnDocument: "after" });
  const used = doc?.count ?? 1;
  if (used <= QUESTIONS_PER_HOUR) return { ok: true, used };
  const hourEnd = Date.parse(`${window}:00:00Z`) + 3600_000;
  return { ok: false, retryInMinutes: Math.max(1, Math.ceil((hourEnd - now.getTime()) / 60_000)) };
}
