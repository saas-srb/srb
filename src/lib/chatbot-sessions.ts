import { clientIpFrom } from "@/lib/security/ip";
import "server-only";
import { randomUUID, createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { parseUserAgent } from "@/lib/ua";
import { bumpDailyRollup } from "@/lib/chatbot-rollup";

export const CHAT_SESSIONS_COLLECTION = "chat_sessions";
export const CHAT_MESSAGES_COLLECTION = "chat_messages";

export const CHAT_SESSION_COOKIE = "yo_chat_session";
export const CHAT_VISITOR_COOKIE = "yo_visitor";
const SESSION_TTL_SEC = 30 * 24 * 60 * 60; // 30 days
const VISITOR_TTL_SEC = 365 * 24 * 60 * 60; // 1 year

const IP_SALT = process.env.CHATBOT_IP_SALT || "chat-analytics-v1";

export type ChatRole = "user" | "assistant";

export interface ChatCitation {
  fileId: string;
  /** `_id` of the originating `kb_website_pages` / `kb_pdf_documents` doc, when resolvable. */
  docId?: string;
  kind: "website" | "pdf" | "unknown";
  title: string;
  /** Public URL for website chunks; omitted for PDFs (not publicly downloadable). */
  url?: string;
}

export interface ChatSession {
  _id: ObjectId;
  sessionId: string;
  visitorId: string;
  ipHash: string | null;
  userAgent: string | null;
  device: string;
  browser: string;
  os: string;
  sourcePage: string | null;
  /** Conversation title. Auto-derived from the first user message; renamable. */
  title: string | null;
  startedAt: Date;
  lastActivityAt: Date;
  messageCount: number;
  status: "active" | "ended";
  createdAt: Date;
  updatedAt: Date;
}

/** A conversation as shown in the ChatGPT-style history sidebar. */
export interface VisitorSessionSummary {
  sessionId: string;
  title: string;
  messageCount: number;
  startedAt: string;
  lastActivityAt: string;
}

const MAX_TITLE_LEN = 80;

function deriveTitle(firstMessage: string): string {
  const clean = firstMessage.replace(/\s+/g, " ").trim();
  if (clean.length <= MAX_TITLE_LEN) return clean;
  const cut = clean.slice(0, MAX_TITLE_LEN);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

export interface ChatMessageDoc {
  _id: ObjectId;
  sessionId: string;
  role: ChatRole;
  content: string;
  citations?: ChatCitation[];
  model?: string;
  responseTimeMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  flaggedInjection?: boolean;
  /** True when this turn originated from / was delivered as voice. */
  voice?: boolean;
  error?: string;
  createdAt: Date;
}

export interface SerializedChatMessage {
  _id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  citations: ChatCitation[];
  model: string | null;
  responseTimeMs: number | null;
  flaggedInjection: boolean;
  voice: boolean;
  error: string | null;
  createdAt: string;
}

export interface CookieToSet {
  name: string;
  value: string;
  maxAge: number;
}

let indexesEnsured = false;

async function getSessionsCollection(): Promise<Collection<ChatSession>> {
  const db = await getDb();
  const collection = db.collection<ChatSession>(CHAT_SESSIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ sessionId: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ lastActivityAt: -1 }).catch(() => {}),
      collection.createIndex({ visitorId: 1, lastActivityAt: -1 }).catch(() => {}),
      db.collection(CHAT_MESSAGES_COLLECTION).createIndex({ sessionId: 1, createdAt: 1 }).catch(() => {}),
      db.collection(CHAT_MESSAGES_COLLECTION).createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

async function getMessagesCollection(): Promise<Collection<ChatMessageDoc>> {
  const db = await getDb();
  return db.collection<ChatMessageDoc>(CHAT_MESSAGES_COLLECTION);
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHash("sha256").update(`${IP_SALT}:${ip}`).digest("hex").slice(0, 32);
}

function getClientIp(req: NextRequest): string | null {
  const ip = clientIpFrom(req.headers);
  return ip === "unknown" ? null : ip;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Applies session/visitor cookies onto an outgoing response. */
export function applyChatCookies(res: NextResponse, cookies: CookieToSet[]): NextResponse {
  for (const c of cookies) {
    res.cookies.set(c.name, c.value, cookieOptions(c.maxAge));
  }
  return res;
}

function firstPartyPath(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).pathname || "/";
  } catch {
    return null;
  }
}

export interface ResolvedSession {
  session: ChatSession;
  cookiesToSet: CookieToSet[];
  isNew: boolean;
}

async function createSession(
  req: NextRequest,
  opts: { sourcePage?: string | null; visitorId?: string | null }
): Promise<ResolvedSession> {
  const collection = await getSessionsCollection();
  const now = new Date();
  const ua = req.headers.get("user-agent");
  const parsed = parseUserAgent(ua);
  const visitorId = opts.visitorId || randomUUID();
  const sourcePage =
    (typeof opts.sourcePage === "string" && opts.sourcePage.trim().slice(0, 300)) ||
    firstPartyPath(req.headers.get("referer"));

  const doc: ChatSession = {
    _id: new ObjectId(),
    sessionId: randomUUID(),
    visitorId,
    ipHash: hashIp(getClientIp(req)),
    userAgent: ua ? ua.slice(0, 400) : null,
    device: parsed.device,
    browser: parsed.browser,
    os: parsed.os,
    sourcePage: sourcePage || null,
    title: null,
    startedAt: now,
    lastActivityAt: now,
    messageCount: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await collection.insertOne(doc);
  await bumpDailyRollup({ sessions: 1, visitorId });

  return {
    session: doc,
    isNew: true,
    cookiesToSet: [
      { name: CHAT_SESSION_COOKIE, value: doc.sessionId, maxAge: SESSION_TTL_SEC },
      { name: CHAT_VISITOR_COOKIE, value: visitorId, maxAge: VISITOR_TTL_SEC },
    ],
  };
}

/** Loads the session named by the request cookie, creating one if absent/stale. */
export async function resolveSession(
  req: NextRequest,
  opts: { sourcePage?: string | null } = {}
): Promise<ResolvedSession> {
  const sessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value;
  const visitorId = req.cookies.get(CHAT_VISITOR_COOKIE)?.value || null;

  if (sessionId) {
    const collection = await getSessionsCollection();
    const existing = await collection.findOne({ sessionId });
    if (existing) {
      // Keep the visitor cookie fresh even on a returning session.
      const cookiesToSet: CookieToSet[] = [
        { name: CHAT_SESSION_COOKIE, value: existing.sessionId, maxAge: SESSION_TTL_SEC },
        { name: CHAT_VISITOR_COOKIE, value: existing.visitorId, maxAge: VISITOR_TTL_SEC },
      ];
      return { session: existing, cookiesToSet, isNew: false };
    }
  }

  return createSession(req, { sourcePage: opts.sourcePage, visitorId });
}

/** Read-only lookup — no session is created. */
export async function getSessionFromRequest(req: NextRequest): Promise<ChatSession | null> {
  const sessionId = req.cookies.get(CHAT_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const collection = await getSessionsCollection();
  return collection.findOne({ sessionId });
}

/**
 * Starts a fresh conversation (new session cookie). Prunes the visitor's
 * other empty conversations so repeated "New chat" clicks don't pile up.
 */
export async function startNewConversation(req: NextRequest): Promise<ResolvedSession> {
  const visitorId = req.cookies.get(CHAT_VISITOR_COOKIE)?.value || null;
  if (visitorId) {
    const collection = await getSessionsCollection();
    await collection.deleteMany({ visitorId, messageCount: { $lte: 0 } }).catch(() => {});
  }
  return createSession(req, { visitorId });
}

export async function recordUserMessage(
  sessionId: string,
  content: string,
  meta: { flaggedInjection?: boolean; voice?: boolean } = {}
): Promise<ChatMessageDoc> {
  const messages = await getMessagesCollection();
  const sessions = await getSessionsCollection();
  const now = new Date();
  const doc: ChatMessageDoc = {
    _id: new ObjectId(),
    sessionId,
    role: "user",
    content,
    flaggedInjection: meta.flaggedInjection || false,
    voice: meta.voice || undefined,
    createdAt: now,
  };
  await messages.insertOne(doc);
  await sessions.updateOne(
    { sessionId },
    { $inc: { messageCount: 1 }, $set: { lastActivityAt: now, updatedAt: now } }
  );
  // Auto-title the conversation from its first user message (only if unset).
  await sessions.updateOne(
    { sessionId, $or: [{ title: null }, { title: "" }, { title: { $exists: false } }] },
    { $set: { title: deriveTitle(content) } }
  );
  await bumpDailyRollup({
    userMessages: 1,
    flaggedInjections: meta.flaggedInjection ? 1 : 0,
  });
  return doc;
}

export async function recordAssistantMessage(
  sessionId: string,
  data: {
    content: string;
    citations?: ChatCitation[];
    model?: string;
    responseTimeMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    voice?: boolean;
    error?: string;
  }
): Promise<ChatMessageDoc> {
  const messages = await getMessagesCollection();
  const sessions = await getSessionsCollection();
  const now = new Date();
  const doc: ChatMessageDoc = {
    _id: new ObjectId(),
    sessionId,
    role: "assistant",
    content: data.content,
    citations: data.citations && data.citations.length > 0 ? data.citations : undefined,
    model: data.model,
    responseTimeMs: data.responseTimeMs,
    promptTokens: data.promptTokens,
    completionTokens: data.completionTokens,
    voice: data.voice || undefined,
    error: data.error,
    createdAt: now,
  };
  await messages.insertOne(doc);
  await sessions.updateOne(
    { sessionId },
    { $inc: { messageCount: 1 }, $set: { lastActivityAt: now, updatedAt: now } }
  );
  await bumpDailyRollup({
    assistantMessages: 1,
    errors: data.error ? 1 : 0,
    responseTimeMs: data.error ? undefined : data.responseTimeMs,
  });
  return doc;
}

/** Ascending history for replaying as model context. */
export async function getConversationHistory(
  sessionId: string,
  limit: number
): Promise<ChatMessageDoc[]> {
  if (limit <= 0) return [];
  const messages = await getMessagesCollection();
  const docs = await messages
    .find({ sessionId, error: { $exists: false } })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return docs.reverse();
}

export function serializeChatMessage(doc: ChatMessageDoc): SerializedChatMessage {
  return {
    _id: String(doc._id),
    sessionId: doc.sessionId,
    role: doc.role,
    content: doc.content,
    citations: doc.citations ?? [],
    model: doc.model ?? null,
    responseTimeMs: doc.responseTimeMs ?? null,
    flaggedInjection: doc.flaggedInjection ?? false,
    voice: doc.voice ?? false,
    error: doc.error ?? null,
    createdAt: new Date(doc.createdAt).toISOString(),
  };
}

/** Paginated message list for the public "load history" endpoint (oldest→newest). */
export async function listSessionMessages(
  sessionId: string,
  opts: { limit?: number; before?: string } = {}
): Promise<{ items: SerializedChatMessage[]; hasMore: boolean; nextCursor: string | null }> {
  const messages = await getMessagesCollection();
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  const filter: Record<string, unknown> = { sessionId };
  if (opts.before && ObjectId.isValid(opts.before)) {
    filter._id = { $lt: new ObjectId(opts.before) };
  }
  const docs = await messages
    .find(filter)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .toArray();

  const hasMore = docs.length > limit;
  const page = hasMore ? docs.slice(0, limit) : docs;
  const nextCursor = hasMore ? String(page[page.length - 1]._id) : null;
  return {
    items: page.reverse().map(serializeChatMessage),
    hasMore,
    nextCursor,
  };
}

// ---------------------------------------------------------------------------
// Browser-session conversation history (ChatGPT-style sidebar)
// ---------------------------------------------------------------------------

const VISITOR_SESSION_CAP = 200;

function summarize(doc: ChatSession): VisitorSessionSummary {
  return {
    sessionId: doc.sessionId,
    title: doc.title?.trim() || (doc.messageCount > 0 ? "Untitled chat" : "New chat"),
    messageCount: doc.messageCount,
    startedAt: new Date(doc.startedAt).toISOString(),
    lastActivityAt: new Date(doc.lastActivityAt).toISOString(),
  };
}

/** Every conversation belonging to this browser (keyed by the visitor cookie). */
export async function listVisitorSessions(visitorId: string): Promise<VisitorSessionSummary[]> {
  if (!visitorId) return [];
  const collection = await getSessionsCollection();
  const docs = await collection
    .find({ visitorId })
    .sort({ lastActivityAt: -1 })
    .limit(VISITOR_SESSION_CAP)
    .toArray();
  return docs.map(summarize);
}

async function ownedSession(sessionId: string, visitorId: string): Promise<ChatSession | null> {
  if (!sessionId || !visitorId) return null;
  const collection = await getSessionsCollection();
  return collection.findOne({ sessionId, visitorId });
}

/** Rename one of the visitor's own conversations. */
export async function renameVisitorSession(
  sessionId: string,
  visitorId: string,
  rawTitle: string
): Promise<VisitorSessionSummary | null> {
  const session = await ownedSession(sessionId, visitorId);
  if (!session) return null;
  const title = rawTitle.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LEN) || "New chat";
  const collection = await getSessionsCollection();
  await collection.updateOne({ sessionId }, { $set: { title, updatedAt: new Date() } });
  return summarize({ ...session, title });
}

/** Delete one of the visitor's own conversations (and its messages). */
export async function deleteVisitorSession(sessionId: string, visitorId: string): Promise<boolean> {
  const session = await ownedSession(sessionId, visitorId);
  if (!session) return false;
  const sessions = await getSessionsCollection();
  const messages = await getMessagesCollection();
  await messages.deleteMany({ sessionId });
  const res = await sessions.deleteOne({ _id: session._id });
  return res.deletedCount === 1;
}

/** Switch the active-conversation cookie to another of the visitor's chats. */
export async function activateVisitorSession(
  sessionId: string,
  visitorId: string
): Promise<{ ok: boolean; cookiesToSet: CookieToSet[] }> {
  const session = await ownedSession(sessionId, visitorId);
  if (!session) return { ok: false, cookiesToSet: [] };
  return {
    ok: true,
    cookiesToSet: [
      { name: CHAT_SESSION_COOKIE, value: session.sessionId, maxAge: SESSION_TTL_SEC },
      { name: CHAT_VISITOR_COOKIE, value: visitorId, maxAge: VISITOR_TTL_SEC },
    ],
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The visitor's id from their cookie — only ever a UUID we issued; anything else is treated as "no visitor". */
export function getVisitorIdFromRequest(req: NextRequest): string | null {
  const v = req.cookies.get(CHAT_VISITOR_COOKIE)?.value;
  return v && UUID.test(v) ? v : null;
}

/** Reads or mints just the long-lived visitor id (no chat session created). */
export function ensureVisitorCookie(req: NextRequest): { visitorId: string; cookiesToSet: CookieToSet[] } {
  const existing = getVisitorIdFromRequest(req);
  const visitorId = existing || randomUUID();
  return {
    visitorId,
    cookiesToSet: [{ name: CHAT_VISITOR_COOKIE, value: visitorId, maxAge: VISITOR_TTL_SEC }],
  };
}

export function hashClientIp(req: NextRequest): string | null {
  return hashIp(getClientIp(req));
}
