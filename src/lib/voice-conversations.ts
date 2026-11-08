import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ChatSession } from "@/lib/chatbot-sessions";
import { getVisitorProfiles } from "@/lib/chat-visitors";
import { deleteVoiceAudio } from "@/lib/voice-storage";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const VOICE_CONVERSATIONS_COLLECTION = "voice_conversations";
export const VOICE_MESSAGES_COLLECTION = "voice_messages";
export const VOICE_TRANSCRIPTS_COLLECTION = "voice_transcripts";

export type VoiceRole = "user" | "assistant";

export interface VoiceConversation {
  _id: ObjectId;
  sessionId: string;
  visitorId: string;
  device: string;
  browser: string;
  os: string;
  sourcePage: string | null;
  voiceId: string;
  startedAt: Date;
  lastActivityAt: Date;
  durationMs: number;
  voiceMessageCount: number;
  status: "active" | "ended";
}

export interface VoiceMessageDoc {
  _id: ObjectId;
  sessionId: string;
  conversationId: ObjectId;
  chatMessageId: ObjectId | null;
  role: VoiceRole;
  text: string;
  audioDurationMs: number;
  audioStorageKey?: string;
  audioBytes?: number;
  sttMs?: number;
  ttsMs?: number;
  voiceId?: string;
  transcriptId?: ObjectId;
  createdAt: Date;
}

export interface VoiceTranscriptDoc {
  _id: ObjectId;
  sessionId: string;
  voiceMessageId: ObjectId | null;
  rawText: string;
  languageCode: string | null;
  languageProbability: number | null;
  audioDurationSecs: number | null;
  model: string;
  createdAt: Date;
}

let indexesEnsured = false;

async function collections() {
  const db = await getDb();
  const conversations = db.collection<VoiceConversation>(VOICE_CONVERSATIONS_COLLECTION);
  const messages = db.collection<VoiceMessageDoc>(VOICE_MESSAGES_COLLECTION);
  const transcripts = db.collection<VoiceTranscriptDoc>(VOICE_TRANSCRIPTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      conversations.createIndex({ sessionId: 1 }, { unique: true }).catch(() => {}),
      conversations.createIndex({ lastActivityAt: -1 }).catch(() => {}),
      messages.createIndex({ sessionId: 1, createdAt: 1 }).catch(() => {}),
      messages.createIndex({ conversationId: 1 }).catch(() => {}),
      transcripts.createIndex({ sessionId: 1, createdAt: 1 }).catch(() => {}),
    ]);
  }
  return { conversations, messages, transcripts };
}

/** Upserts the voice conversation for a chat session and returns its id. */
export async function ensureVoiceConversation(
  session: ChatSession,
  voiceId: string
): Promise<ObjectId> {
  const { conversations } = await collections();
  const now = new Date();
  const res = await conversations.findOneAndUpdate(
    { sessionId: session.sessionId },
    {
      $set: { lastActivityAt: now, voiceId, status: "active" },
      $setOnInsert: {
        sessionId: session.sessionId,
        visitorId: session.visitorId,
        device: session.device,
        browser: session.browser,
        os: session.os,
        sourcePage: session.sourcePage,
        startedAt: now,
        durationMs: 0,
        voiceMessageCount: 0,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  return res!._id;
}

export async function recordVoiceTranscript(input: {
  sessionId: string;
  rawText: string;
  languageCode: string | null;
  languageProbability: number | null;
  audioDurationSecs: number | null;
  model: string;
}): Promise<string> {
  const { transcripts } = await collections();
  const doc: VoiceTranscriptDoc = {
    _id: new ObjectId(),
    sessionId: input.sessionId,
    voiceMessageId: null,
    rawText: input.rawText,
    languageCode: input.languageCode,
    languageProbability: input.languageProbability,
    audioDurationSecs: input.audioDurationSecs,
    model: input.model,
    createdAt: new Date(),
  };
  await transcripts.insertOne(doc);
  return String(doc._id);
}

export interface VoiceTurnInput {
  sessionId: string;
  conversationId: ObjectId;
  user: {
    chatMessageId: string | null;
    text: string;
    transcriptId: string | null;
    audioDurationMs: number;
    sttMs: number;
  };
  assistant: {
    chatMessageId: string | null;
    text: string;
    audioStorageKey: string | null;
    audioBytes: number;
    audioDurationMs: number;
    ttsMs: number;
    voiceId: string;
  };
}

/** Writes the user + assistant voice_messages for one completed turn and rolls up the conversation. */
export async function recordVoiceTurn(input: VoiceTurnInput): Promise<{ firstTurn: boolean }> {
  const { conversations, messages, transcripts } = await collections();
  const now = new Date();
  const existing = await conversations.findOne(
    { _id: input.conversationId },
    { projection: { voiceMessageCount: 1 } }
  );
  const firstTurn = (existing?.voiceMessageCount ?? 0) === 0;
  const oid = (v: string | null) => (v && ObjectId.isValid(v) ? new ObjectId(v) : null);

  const userMsg: VoiceMessageDoc = {
    _id: new ObjectId(),
    sessionId: input.sessionId,
    conversationId: input.conversationId,
    chatMessageId: oid(input.user.chatMessageId),
    role: "user",
    text: input.user.text,
    audioDurationMs: Math.max(0, Math.round(input.user.audioDurationMs)),
    sttMs: Math.max(0, Math.round(input.user.sttMs)),
    transcriptId: oid(input.user.transcriptId) ?? undefined,
    createdAt: now,
  };
  const assistantMsg: VoiceMessageDoc = {
    _id: new ObjectId(),
    sessionId: input.sessionId,
    conversationId: input.conversationId,
    chatMessageId: oid(input.assistant.chatMessageId),
    role: "assistant",
    text: input.assistant.text,
    audioDurationMs: Math.max(0, Math.round(input.assistant.audioDurationMs)),
    audioStorageKey: input.assistant.audioStorageKey ?? undefined,
    audioBytes: input.assistant.audioBytes || undefined,
    ttsMs: Math.max(0, Math.round(input.assistant.ttsMs)),
    voiceId: input.assistant.voiceId,
    createdAt: new Date(now.getTime() + 1),
  };

  await messages.insertMany([userMsg, assistantMsg]);

  if (userMsg.transcriptId) {
    await transcripts.updateOne(
      { _id: userMsg.transcriptId },
      { $set: { voiceMessageId: userMsg._id } }
    );
  }

  await conversations.updateOne(
    { _id: input.conversationId },
    {
      $inc: {
        voiceMessageCount: 2,
        durationMs: userMsg.audioDurationMs + assistantMsg.audioDurationMs,
      },
      $set: { lastActivityAt: now, status: "active" },
    }
  );

  return { firstTurn };
}

// ---------------------------------------------------------------------------
// Admin: management & analytics reads
// ---------------------------------------------------------------------------

export interface VoiceConversationRow {
  _id: string;
  sessionId: string;
  visitorId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  device: string;
  browser: string;
  os: string;
  sourcePage: string | null;
  voiceId: string;
  startedAt: string;
  lastActivityAt: string;
  durationMs: number;
  voiceMessageCount: number;
  textMessageCount: number;
  status: VoiceConversation["status"];
  preview: string;
}

export interface SearchVoiceConversationsOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  device?: string;
  minDurationMs?: number;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: "lastActivityAt" | "startedAt" | "durationMs" | "voiceMessageCount";
  sortDir?: "asc" | "desc";
}

async function buildVoiceFilter(opts: SearchVoiceConversationsOptions) {
  const filter: Record<string, unknown> = {};
  if (opts.device && opts.device !== "all") filter.device = opts.device;
  if (opts.minDurationMs && opts.minDurationMs > 0) filter.durationMs = { $gte: opts.minDurationMs };
  if (opts.dateFrom || opts.dateTo) {
    const r: Record<string, Date> = {};
    if (opts.dateFrom) r.$gte = opts.dateFrom;
    if (opts.dateTo) r.$lte = opts.dateTo;
    filter.startedAt = r;
  }
  if (opts.search && opts.search.trim()) {
    const term = opts.search.trim();
    const rx = new RegExp(escapeRegExp(term), "i");
    const { messages } = await collections();
    const matchedSessions = await messages.distinct("sessionId", { text: rx });
    filter.$or = [
      { sessionId: rx },
      { visitorId: rx },
      ...(matchedSessions.length > 0 ? [{ sessionId: { $in: matchedSessions } }] : []),
    ];
  }
  return filter;
}

export async function searchVoiceConversations(opts: SearchVoiceConversationsOptions = {}): Promise<{
  items: VoiceConversationRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { conversations, messages } = await collections();
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const sortField = opts.sortBy ?? "lastActivityAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const filter = await buildVoiceFilter(opts);

  const [docs, total] = await Promise.all([
    conversations.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    conversations.countDocuments(filter),
  ]);

  const sessionIds = docs.map((d) => d.sessionId);
  const [profiles, sessionCounts, firstUserMsgs] = await Promise.all([
    getVisitorProfiles([...new Set(docs.map((d) => d.visitorId))]),
    db
      .collection("chat_sessions")
      .find({ sessionId: { $in: sessionIds } }, { projection: { sessionId: 1, messageCount: 1 } })
      .toArray(),
    messages
      .find({ sessionId: { $in: sessionIds }, role: "user" })
      .sort({ createdAt: 1 })
      .toArray(),
  ]);
  const countBySession = new Map(sessionCounts.map((s) => [s.sessionId as string, (s.messageCount as number) ?? 0]));
  const previewBySession = new Map<string, string>();
  for (const m of firstUserMsgs) {
    if (!previewBySession.has(m.sessionId) && m.text) previewBySession.set(m.sessionId, m.text.slice(0, 140));
  }

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
      voiceId: d.voiceId,
      startedAt: new Date(d.startedAt).toISOString(),
      lastActivityAt: new Date(d.lastActivityAt).toISOString(),
      durationMs: d.durationMs,
      voiceMessageCount: d.voiceMessageCount,
      textMessageCount: Math.max(0, (countBySession.get(d.sessionId) ?? 0) - d.voiceMessageCount),
      status: d.status,
      preview: previewBySession.get(d.sessionId) ?? "(voice conversation)",
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

export interface VoiceTimelineEntry {
  _id: string;
  role: VoiceRole;
  text: string;
  audioDurationMs: number;
  hasAudio: boolean;
  ttsMs: number | null;
  sttMs: number | null;
  createdAt: string;
}

export interface VoiceConversationDetail {
  session: VoiceConversationRow;
  timeline: VoiceTimelineEntry[];
}

async function resolveConversation(idOrSessionId: string): Promise<VoiceConversation | null> {
  const { conversations } = await collections();
  if (ObjectId.isValid(idOrSessionId)) {
    const byId = await conversations.findOne({ _id: new ObjectId(idOrSessionId) });
    if (byId) return byId;
  }
  return conversations.findOne({ sessionId: idOrSessionId });
}

export async function getVoiceConversation(idOrSessionId: string): Promise<VoiceConversationDetail | null> {
  const conv = await resolveConversation(idOrSessionId);
  if (!conv) return null;
  const { messages } = await collections();
  const db = await getDb();

  const [msgs, profiles, sessionDoc] = await Promise.all([
    messages.find({ sessionId: conv.sessionId }).sort({ createdAt: 1 }).toArray(),
    getVisitorProfiles([conv.visitorId]),
    db.collection("chat_sessions").findOne({ sessionId: conv.sessionId }, { projection: { messageCount: 1 } }),
  ]);
  const totalMsgs = ((sessionDoc?.messageCount as number) ?? 0);

  return {
    session: {
      _id: String(conv._id),
      sessionId: conv.sessionId,
      visitorId: conv.visitorId,
      visitorName: profiles.get(conv.visitorId)?.name ?? null,
      visitorEmail: profiles.get(conv.visitorId)?.email ?? null,
      device: conv.device,
      browser: conv.browser,
      os: conv.os,
      sourcePage: conv.sourcePage,
      voiceId: conv.voiceId,
      startedAt: new Date(conv.startedAt).toISOString(),
      lastActivityAt: new Date(conv.lastActivityAt).toISOString(),
      durationMs: conv.durationMs,
      voiceMessageCount: conv.voiceMessageCount,
      textMessageCount: Math.max(0, totalMsgs - conv.voiceMessageCount),
      status: conv.status,
      preview: "",
    },
    timeline: msgs.map((m) => ({
      _id: String(m._id),
      role: m.role,
      text: m.text,
      audioDurationMs: m.audioDurationMs,
      hasAudio: Boolean(m.audioStorageKey),
      ttsMs: m.ttsMs ?? null,
      sttMs: m.sttMs ?? null,
      createdAt: new Date(m.createdAt).toISOString(),
    })),
  };
}

/** Returns the on-disk audio key for one assistant voice message in a conversation. */
export async function getVoiceMessageAudioKey(
  idOrSessionId: string,
  voiceMessageId: string
): Promise<string | null> {
  if (!ObjectId.isValid(voiceMessageId)) return null;
  const conv = await resolveConversation(idOrSessionId);
  if (!conv) return null;
  const { messages } = await collections();
  const msg = await messages.findOne({ _id: new ObjectId(voiceMessageId), sessionId: conv.sessionId });
  return msg?.audioStorageKey ?? null;
}

export async function deleteVoiceConversation(idOrSessionId: string): Promise<boolean> {
  const conv = await resolveConversation(idOrSessionId);
  if (!conv) return false;
  const { conversations, messages, transcripts } = await collections();
  const audioMsgs = await messages.find({ sessionId: conv.sessionId, audioStorageKey: { $exists: true } }).toArray();
  await Promise.all(audioMsgs.map((m) => deleteVoiceAudio(m.audioStorageKey)));
  await messages.deleteMany({ sessionId: conv.sessionId });
  await transcripts.deleteMany({ sessionId: conv.sessionId });
  const res = await conversations.deleteOne({ _id: conv._id });
  return res.deletedCount === 1;
}

export async function bulkDeleteVoiceConversations(ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) if (await deleteVoiceConversation(id)) n += 1;
  return n;
}

export async function getVoiceSourcePages(): Promise<string[]> {
  const { conversations } = await collections();
  const pages = await conversations.distinct("sourcePage", { sourcePage: { $nin: [null, ""] } });
  return (pages as (string | null)[]).filter((p): p is string => Boolean(p)).sort().slice(0, 200);
}

export interface VoiceExportRow {
  sessionId: string;
  visitorId: string;
  startedAt: string;
  role: string;
  text: string;
  audioSeconds: string;
  sentAt: string;
}

export async function exportVoiceConversations(
  opts: SearchVoiceConversationsOptions & { ids?: string[] } = {}
): Promise<VoiceExportRow[]> {
  const { conversations, messages } = await collections();
  let convDocs: VoiceConversation[];
  if (opts.ids && opts.ids.length > 0) {
    const objIds = opts.ids.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    convDocs = await conversations.find({ _id: { $in: objIds } }).toArray();
  } else {
    const filter = await buildVoiceFilter(opts);
    convDocs = await conversations.find(filter).sort({ startedAt: -1 }).limit(5000).toArray();
  }
  const byId = new Map(convDocs.map((c) => [c.sessionId, c]));
  const msgs = await messages
    .find({ sessionId: { $in: [...byId.keys()] } })
    .sort({ sessionId: 1, createdAt: 1 })
    .limit(20000)
    .toArray();
  return msgs.map((m) => {
    const c = byId.get(m.sessionId);
    return {
      sessionId: m.sessionId,
      visitorId: c?.visitorId ?? "",
      startedAt: c ? new Date(c.startedAt).toISOString() : "",
      role: m.role,
      text: m.text,
      audioSeconds: (m.audioDurationMs / 1000).toFixed(1),
      sentAt: new Date(m.createdAt).toISOString(),
    };
  });
}
