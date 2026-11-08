import "server-only";
import { ObjectId, type Collection } from "mongodb";
import { getDb } from "@/lib/mongodb";
import {
  CHAT_SESSIONS_COLLECTION,
  CHAT_MESSAGES_COLLECTION,
  serializeChatMessage,
  type ChatSession,
  type ChatMessageDoc,
  type SerializedChatMessage,
} from "@/lib/chatbot-sessions";
import { getVisitorProfile, getVisitorProfiles } from "@/lib/chat-visitors";
import { getCategoryLabel, isValidCategory } from "@/lib/categories";

/** Visitor-facing service slug → the human label shown in staff views/exports. */
function serviceLabel(service: string | null | undefined): string | null {
  return service && isValidCategory(service) ? getCategoryLabel(service) : null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function sessionsCollection(): Promise<Collection<ChatSession>> {
  return (await getDb()).collection<ChatSession>(CHAT_SESSIONS_COLLECTION);
}
async function messagesCollection(): Promise<Collection<ChatMessageDoc>> {
  return (await getDb()).collection<ChatMessageDoc>(CHAT_MESSAGES_COLLECTION);
}

export interface ConversationFilters {
  search?: string;
  device?: string;
  sourcePage?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface SearchConversationsOptions extends ConversationFilters {
  page?: number;
  pageSize?: number;
  sortBy?: "lastActivityAt" | "startedAt" | "messageCount";
  sortDir?: "asc" | "desc";
}

export interface ConversationRow {
  _id: string;
  sessionId: string;
  visitorId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  device: string;
  browser: string;
  os: string;
  sourcePage: string | null;
  startedAt: string;
  lastActivityAt: string;
  messageCount: number;
  status: ChatSession["status"];
  preview: string;
  flagged: boolean;
}

async function buildFilter(opts: ConversationFilters): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = {};

  if (opts.device && opts.device !== "all") filter.device = opts.device;
  if (opts.sourcePage) filter.sourcePage = new RegExp(escapeRegExp(opts.sourcePage), "i");
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    filter.startedAt = range;
  }

  if (opts.search && opts.search.trim()) {
    const term = opts.search.trim();
    const regex = new RegExp(escapeRegExp(term), "i");
    // Match session-level fields OR any message content in the conversation.
    const messages = await messagesCollection();
    const matchingSessionIds = await messages.distinct("sessionId", { content: regex });
    filter.$or = [
      { sessionId: regex },
      { visitorId: regex },
      { sourcePage: regex },
      ...(matchingSessionIds.length > 0 ? [{ sessionId: { $in: matchingSessionIds } }] : []),
    ];
  }

  return filter;
}

export async function searchConversations(opts: SearchConversationsOptions = {}): Promise<{
  items: ConversationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const sessions = await sessionsCollection();
  const messages = await messagesCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const sortField = opts.sortBy ?? "lastActivityAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const filter = await buildFilter(opts);

  const [docs, total] = await Promise.all([
    sessions
      .find(filter)
      .sort({ [sortField]: sortDir })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    sessions.countDocuments(filter),
  ]);

  // First user message + injection flag per listed conversation.
  const ids = docs.map((d) => d.sessionId);
  const previews = new Map<string, string>();
  const flagged = new Set<string>();
  if (ids.length > 0) {
    const rows = await messages
      .find({ sessionId: { $in: ids } })
      .sort({ createdAt: 1 })
      .toArray();
    for (const m of rows) {
      if (m.role === "user") {
        if (!previews.has(m.sessionId)) previews.set(m.sessionId, m.content.slice(0, 140));
        if (m.flaggedInjection) flagged.add(m.sessionId);
      }
    }
  }

  const profiles = await getVisitorProfiles([...new Set(docs.map((d) => d.visitorId))]);

  return {
    items: docs.map((d) => ({
      _id: String(d._id),
      sessionId: d.sessionId,
      visitorId: d.visitorId,
      visitorName: profiles.get(d.visitorId)?.name ?? null,
      visitorEmail: profiles.get(d.visitorId)?.email ?? null,
      device: d.device,
      browser: d.browser,
      os: d.os,
      sourcePage: d.sourcePage,
      startedAt: new Date(d.startedAt).toISOString(),
      lastActivityAt: new Date(d.lastActivityAt).toISOString(),
      messageCount: d.messageCount,
      status: d.status,
      preview: previews.get(d.sessionId) ?? "(no messages)",
      flagged: flagged.has(d.sessionId),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

export interface ConversationDetail {
  session: {
    _id: string;
    sessionId: string;
    visitorId: string;
    visitorName: string | null;
    visitorEmail: string | null;
    visitorPhone: string | null;
    visitorService: string | null;
    visitorCapturedAt: string | null;
    ipHash: string | null;
    userAgent: string | null;
    device: string;
    browser: string;
    os: string;
    sourcePage: string | null;
    startedAt: string;
    lastActivityAt: string;
    messageCount: number;
    status: ChatSession["status"];
  };
  messages: SerializedChatMessage[];
}

async function resolveSessionDoc(idOrSessionId: string): Promise<ChatSession | null> {
  const sessions = await sessionsCollection();
  if (ObjectId.isValid(idOrSessionId)) {
    const byId = await sessions.findOne({ _id: new ObjectId(idOrSessionId) });
    if (byId) return byId;
  }
  return sessions.findOne({ sessionId: idOrSessionId });
}

export async function getConversation(idOrSessionId: string): Promise<ConversationDetail | null> {
  const session = await resolveSessionDoc(idOrSessionId);
  if (!session) return null;
  const messages = await messagesCollection();
  const [msgs, profile] = await Promise.all([
    messages.find({ sessionId: session.sessionId }).sort({ createdAt: 1 }).toArray(),
    getVisitorProfile(session.visitorId),
  ]);
  return {
    session: {
      _id: String(session._id),
      sessionId: session.sessionId,
      visitorId: session.visitorId,
      visitorName: profile?.name ?? null,
      visitorEmail: profile?.email ?? null,
      visitorPhone: profile?.phone ?? null,
      visitorService: serviceLabel(profile?.service),
      visitorCapturedAt: profile ? new Date(profile.capturedAt).toISOString() : null,
      ipHash: session.ipHash,
      userAgent: session.userAgent,
      device: session.device,
      browser: session.browser,
      os: session.os,
      sourcePage: session.sourcePage,
      startedAt: new Date(session.startedAt).toISOString(),
      lastActivityAt: new Date(session.lastActivityAt).toISOString(),
      messageCount: session.messageCount,
      status: session.status,
    },
    messages: msgs.map(serializeChatMessage),
  };
}

export async function deleteConversation(idOrSessionId: string): Promise<boolean> {
  const session = await resolveSessionDoc(idOrSessionId);
  if (!session) return false;
  const sessions = await sessionsCollection();
  const messages = await messagesCollection();
  await messages.deleteMany({ sessionId: session.sessionId });
  const res = await sessions.deleteOne({ _id: session._id });
  return res.deletedCount === 1;
}

export async function bulkDeleteConversations(ids: string[]): Promise<number> {
  let deleted = 0;
  for (const id of ids) {
    if (await deleteConversation(id)) deleted += 1;
  }
  return deleted;
}

export interface ConversationExportRow {
  sessionId: string;
  visitorId: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  visitorService: string;
  device: string;
  browser: string;
  os: string;
  sourcePage: string;
  startedAt: string;
  role: string;
  message: string;
  citations: string;
  responseTimeMs: string;
  sentAt: string;
}

const EXPORT_MESSAGE_CAP = 20000;

export async function exportConversations(opts: ConversationFilters & { ids?: string[] } = {}): Promise<
  ConversationExportRow[]
> {
  const sessions = await sessionsCollection();
  const messages = await messagesCollection();

  let sessionDocs: ChatSession[];
  if (opts.ids && opts.ids.length > 0) {
    const objIds = opts.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    sessionDocs = await sessions.find({ _id: { $in: objIds } }).toArray();
  } else {
    const filter = await buildFilter(opts);
    sessionDocs = await sessions.find(filter).sort({ startedAt: -1 }).limit(5000).toArray();
  }

  const byId = new Map(sessionDocs.map((s) => [s.sessionId, s]));
  const [msgs, profiles] = await Promise.all([
    messages
      .find({ sessionId: { $in: [...byId.keys()] } })
      .sort({ sessionId: 1, createdAt: 1 })
      .limit(EXPORT_MESSAGE_CAP)
      .toArray(),
    getVisitorProfiles([...new Set(sessionDocs.map((s) => s.visitorId))]),
  ]);

  return msgs.map((m) => {
    const s = byId.get(m.sessionId);
    const profile = s ? profiles.get(s.visitorId) : undefined;
    return {
      sessionId: m.sessionId,
      visitorId: s?.visitorId ?? "",
      visitorName: profile?.name ?? "",
      visitorEmail: profile?.email ?? "",
      visitorPhone: profile?.phone ?? "",
      visitorService: serviceLabel(profile?.service) ?? "",
      device: s?.device ?? "",
      browser: s?.browser ?? "",
      os: s?.os ?? "",
      sourcePage: s?.sourcePage ?? "",
      startedAt: s ? new Date(s.startedAt).toISOString() : "",
      role: m.role,
      message: m.content,
      citations: (m.citations ?? []).map((c) => c.url || c.title).join(" | "),
      responseTimeMs: m.responseTimeMs != null ? String(m.responseTimeMs) : "",
      sentAt: new Date(m.createdAt).toISOString(),
    };
  });
}

/** Distinct source pages seen in sessions — powers the admin filter dropdown. */
export async function getConversationSourcePages(): Promise<string[]> {
  const sessions = await sessionsCollection();
  const pages = await sessions.distinct("sourcePage", { sourcePage: { $nin: [null, ""] } });
  return (pages as (string | null)[]).filter((p): p is string => Boolean(p)).sort().slice(0, 200);
}
