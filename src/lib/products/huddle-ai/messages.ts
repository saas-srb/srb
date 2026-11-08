import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, nextSequence, notDeleted } from "@/lib/products/huddle-ai/db";
import { emit, emitMany, type EmitInput } from "@/lib/products/huddle-ai/events";
import { getChatUsers, type DirectoryUser } from "@/lib/products/huddle-ai/users";
import { recordSharedFile, type Attachment } from "@/lib/products/huddle-ai/attachments";
import { notify } from "@/lib/products/huddle-ai/notifications";
import { listMemberIds, touchChannel, type Channel } from "@/lib/products/huddle-ai/channels";
import { getConversation, touchConversation } from "@/lib/products/huddle-ai/conversations";

/**
 * One message model over two collections — `channel_messages` and
 * `direct_messages` — discriminated by `MessageScope`. Sequence numbers are
 * **per scope** (`nextSequence("channel:<id>")` / `"dm:<id>"`), so a member's
 * `lastReadSeq` is a plain monotonic integer within that channel / conversation.
 *
 * Every write also appends a `chat_event` (for the realtime stream) and, for
 * mentions, a personal notification.
 */

export const CHANNEL_MESSAGES_COLLECTION = "channel_messages";
export const DIRECT_MESSAGES_COLLECTION = "direct_messages";
export const REACTIONS_COLLECTION = "message_reactions";
export const THREADS_COLLECTION = "message_threads";

export type MessageScope = { type: "channel"; id: string } | { type: "dm"; id: string };

function scopeKeyOf(s: MessageScope): string {
  return `${s.type}:${s.id}`;
}

export interface StoredMessage {
  _id: string;
  seq: number;
  channelId?: string;
  conversationId?: string;
  authorId: string;
  body: string;
  attachments: Attachment[];
  /** User ids; the sentinels `"@channel"` / `"@here"` may also appear. */
  mentions: string[];
  parentId: string | null;
  /** Set when this message was forwarded from another conversation. */
  forwardedFrom?: { authorName: string; scopeLabel: string } | null;
  /** Set for the system message that records a finished call. */
  callMeta?: CallMeta | null;
  editedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReactionGroup {
  emoji: string;
  count: number;
  userIds: string[];
  mine: boolean;
}

export interface CallMeta {
  callId: string;
  mode: "audio" | "video";
  outcome: "accepted" | "missed" | "declined" | "no_answer";
  durationSec: number;
  participantIds: string[];
}

export interface SerializedMessage {
  _id: string;
  seq: number;
  scope: MessageScope;
  author: DirectoryUser | null;
  authorId: string;
  body: string;
  attachments: Attachment[];
  mentions: string[];
  parentId: string | null;
  forwardedFrom: { authorName: string; scopeLabel: string } | null;
  callMeta: CallMeta | null;
  edited: boolean;
  deleted: boolean;
  reactions: ReactionGroup[];
  thread: { replyCount: number; lastReplyAt: string | null } | null;
  starred: boolean;
  createdAt: string;
}

interface ReactionDoc {
  _id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: Date;
}

interface ThreadDoc {
  _id: string; // === root message id
  scopeKey: string;
  replyCount: number;
  lastReplyAt: Date;
  participantIds: string[];
}

let channelMsgIdx = false;
let directMsgIdx = false;
let reactionIdx = false;
let threadIdx = false;

async function channelMessages() {
  const db = await getDb();
  const c = db.collection<StoredMessage>(CHANNEL_MESSAGES_COLLECTION);
  if (!channelMsgIdx) {
    channelMsgIdx = true;
    await Promise.all([
      c.createIndex({ channelId: 1, seq: 1 }).catch(() => {}),
      c.createIndex({ channelId: 1, parentId: 1, seq: 1 }).catch(() => {}),
      c.createIndex({ authorId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ body: "text" }).catch(() => {}),
    ]);
  }
  return c;
}

async function directMessages() {
  const db = await getDb();
  const c = db.collection<StoredMessage>(DIRECT_MESSAGES_COLLECTION);
  if (!directMsgIdx) {
    directMsgIdx = true;
    await Promise.all([
      c.createIndex({ conversationId: 1, seq: 1 }).catch(() => {}),
      c.createIndex({ conversationId: 1, parentId: 1, seq: 1 }).catch(() => {}),
      c.createIndex({ authorId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ body: "text" }).catch(() => {}),
    ]);
  }
  return c;
}

async function reactions() {
  const db = await getDb();
  const c = db.collection<ReactionDoc>(REACTIONS_COLLECTION);
  if (!reactionIdx) {
    reactionIdx = true;
    await c.createIndex({ messageId: 1, userId: 1, emoji: 1 }, { unique: true }).catch(() => {});
  }
  return c;
}

async function threads() {
  const db = await getDb();
  const c = db.collection<ThreadDoc>(THREADS_COLLECTION);
  if (!threadIdx) {
    threadIdx = true;
    await c.createIndex({ scopeKey: 1, lastReplyAt: -1 }).catch(() => {});
  }
  return c;
}

async function collectionFor(scope: MessageScope) {
  return scope.type === "channel" ? channelMessages() : directMessages();
}

function scopeFilter(scope: MessageScope) {
  return scope.type === "channel" ? { channelId: scope.id } : { conversationId: scope.id };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

async function hydrate(
  rows: StoredMessage[],
  scope: MessageScope,
  viewerId: string,
  starredIds: Set<string>
): Promise<SerializedMessage[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r._id);
  const [authors, reactionRows, threadRows] = await Promise.all([
    getChatUsers(rows.map((r) => r.authorId)),
    (await reactions()).find({ messageId: { $in: ids } }).toArray(),
    (await threads()).find({ _id: { $in: ids } }).toArray(),
  ]);

  const reactionsByMsg = new Map<string, ReactionDoc[]>();
  for (const r of reactionRows) {
    const arr = reactionsByMsg.get(r.messageId) ?? [];
    arr.push(r);
    reactionsByMsg.set(r.messageId, arr);
  }
  const threadById = new Map(threadRows.map((t) => [t._id, t]));

  return rows.map((r) => {
    const grouped = new Map<string, ReactionGroup>();
    for (const rx of reactionsByMsg.get(r._id) ?? []) {
      const g = grouped.get(rx.emoji) ?? { emoji: rx.emoji, count: 0, userIds: [], mine: false };
      g.count += 1;
      g.userIds.push(rx.userId);
      if (rx.userId === viewerId) g.mine = true;
      grouped.set(rx.emoji, g);
    }
    const t = threadById.get(r._id);
    return {
      _id: r._id,
      seq: r.seq,
      scope,
      author: authors[r.authorId] ?? null,
      authorId: r.authorId,
      body: r.deletedAt ? "" : r.body,
      attachments: r.deletedAt ? [] : r.attachments,
      mentions: r.mentions,
      parentId: r.parentId,
      forwardedFrom: r.deletedAt ? null : r.forwardedFrom ?? null,
      callMeta: r.deletedAt ? null : r.callMeta ?? null,
      edited: r.editedAt !== null,
      deleted: r.deletedAt !== null,
      reactions: [...grouped.values()],
      thread: t ? { replyCount: t.replyCount, lastReplyAt: t.lastReplyAt.toISOString() } : null,
      starred: starredIds.has(r._id),
      createdAt: r.createdAt.toISOString(),
    };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getStoredMessage(scope: MessageScope, messageId: string): Promise<StoredMessage | null> {
  const c = await collectionFor(scope);
  return c.findOne({ _id: messageId, ...scopeFilter(scope) });
}

export interface ListMessagesInput {
  scope: MessageScope;
  viewerId: string;
  starredIds?: string[];
  beforeSeq?: number;
  limit?: number;
}

/** Top-level messages (thread replies excluded), oldest→newest. */
export async function listMessages(input: ListMessagesInput): Promise<SerializedMessage[]> {
  const c = await collectionFor(input.scope);
  const limit = Math.min(Math.max(input.limit ?? 40, 1), 100);
  const filter: Record<string, unknown> = { ...scopeFilter(input.scope), parentId: null };
  if (input.beforeSeq) filter.seq = { $lt: input.beforeSeq };
  const rows = (await c.find(filter).sort({ seq: -1 }).limit(limit).toArray()).reverse();
  return hydrate(rows, input.scope, input.viewerId, new Set(input.starredIds ?? []));
}

export async function listThread(
  scope: MessageScope,
  rootId: string,
  viewerId: string,
  starredIds: string[] = []
): Promise<SerializedMessage[]> {
  const c = await collectionFor(scope);
  const rows = await c
    .find({ ...scopeFilter(scope), $or: [{ _id: rootId }, { parentId: rootId }] })
    .sort({ seq: 1 })
    .toArray();
  return hydrate(rows, scope, viewerId, new Set(starredIds));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

function previewOf(body: string, attachments: Attachment[]): string {
  const text = body.replace(/\s+/g, " ").trim();
  if (text) return text.slice(0, 140);
  if (attachments.length > 0) {
    const a = attachments[0];
    return a.kind === "image" ? "📷 Photo" : a.kind === "voice" ? "🎤 Voice message" : `📎 ${a.filename}`;
  }
  return "";
}

async function resolveScopeMembers(scope: MessageScope): Promise<string[]> {
  if (scope.type === "channel") return listMemberIds(scope.id);
  const conv = await getConversation(scope.id);
  return conv ? [...conv.participantIds] : [];
}

export interface PostMessageInput {
  scope: MessageScope;
  authorId: string;
  body: string;
  attachments?: Attachment[];
  mentions?: string[];
  parentId?: string | null;
  forwardedFrom?: { authorName: string; scopeLabel: string } | null;
  callMeta?: CallMeta | null;
}

export async function postMessage(input: PostMessageInput): Promise<SerializedMessage> {
  const body = (input.body ?? "").trim();
  const attachments = input.attachments ?? [];
  if (!body && attachments.length === 0 && !input.callMeta) throw new Error("Message is empty.");
  if (body.length > 8000) throw new Error("Message is too long.");

  const c = await collectionFor(input.scope);
  const memberIds = await resolveScopeMembers(input.scope);
  const memberSet = new Set(memberIds);

  // Trust only mentions that resolve to real members (or the broadcast sentinels).
  const mentions = Array.from(new Set(input.mentions ?? [])).filter(
    (m) => m === "@channel" || m === "@here" || memberSet.has(m)
  );

  const seq = await nextSequence(scopeKeyOf(input.scope));
  const now = new Date();
  const doc: StoredMessage = {
    _id: newId(),
    seq,
    ...(input.scope.type === "channel" ? { channelId: input.scope.id } : { conversationId: input.scope.id }),
    authorId: input.authorId,
    body,
    attachments,
    mentions,
    parentId: input.parentId ?? null,
    forwardedFrom: input.forwardedFrom ?? null,
    callMeta: input.callMeta ?? null,
    editedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  await c.insertOne(doc);

  // Thread bookkeeping.
  if (doc.parentId) {
    await (await threads()).updateOne(
      { _id: doc.parentId },
      {
        $set: { scopeKey: scopeKeyOf(input.scope), lastReplyAt: now },
        $inc: { replyCount: 1 },
        $addToSet: { participantIds: input.authorId },
      },
      { upsert: true }
    );
  }

  // Conversation / channel recency + preview.
  const preview = previewOf(body, attachments);
  if (input.scope.type === "channel") {
    await touchChannel(input.scope.id, preview);
  } else {
    await touchConversation(input.scope.id, preview, input.authorId);
  }

  // Shared-files ledger (feeds the future Files hub + the dashboard KPI now).
  for (const a of attachments) {
    await recordSharedFile({ attachment: a, scope: input.scope, messageId: doc._id, uploadedBy: input.authorId });
  }

  const serialized = (await hydrate([doc], input.scope, input.authorId, new Set()))[0];

  // Realtime: the message itself to the scope.
  await emit({
    scope: input.scope,
    kind: "message",
    payload: { message: serialized },
    actorId: input.authorId,
  });

  // Notifications + per-user "new activity" nudge. Call-summary system messages
  // carry their own missed-call notifications — skip the generic message nudge.
  if (!input.callMeta) {
    await fanOutNotifications({ scope: input.scope, message: doc, mentions, memberIds });
  }

  return serialized;
}

async function fanOutNotifications(args: {
  scope: MessageScope;
  message: StoredMessage;
  mentions: string[];
  memberIds: string[];
}): Promise<void> {
  const { scope, message, mentions, memberIds } = args;
  const authors = await getChatUsers([message.authorId]);
  const authorName = authors[message.authorId]?.displayName ?? "Someone";
  const link = scope.type === "channel" ? `/huddle-ai/channels` : `/huddle-ai/dm/${scope.id}`;

  const broadcast = mentions.includes("@channel") || mentions.includes("@here");
  const explicit = new Set(mentions.filter((m) => m !== "@channel" && m !== "@here"));

  const events: EmitInput[] = [];
  for (const uid of memberIds) {
    if (uid === message.authorId) continue;
    const mentioned = broadcast || explicit.has(uid);
    // DMs always notify the recipient; channels only on a mention (Phase 1).
    const shouldNotify = scope.type === "dm" || mentioned;
    if (!shouldNotify) {
      // still push a lightweight "unread bumped" nudge so sidebars can update
      events.push({ scope: { type: "user", id: uid }, kind: "notification", payload: { kind: "activity", scope }, actorId: message.authorId });
      continue;
    }
    await notify({
      recipientUserId: uid,
      type: mentioned ? "mention" : "message",
      title: mentioned ? `${authorName} mentioned you` : `New message from ${authorName}`,
      body: previewOf(message.body, message.attachments) || null,
      link,
    });
    events.push({
      scope: { type: "user", id: uid },
      kind: "notification",
      payload: { kind: mentioned ? "mention" : "message", scope, from: message.authorId },
      actorId: message.authorId,
    });
  }
  await emitMany(events);
}

/**
 * Re-post an existing message (body + attachments) into another conversation.
 * The caller's read access to the source and post access to the target are
 * verified by the route via `resolveScope` before this is called.
 */
export async function forwardMessage(args: {
  source: MessageScope;
  messageId: string;
  target: MessageScope;
  actorId: string;
  sourceLabel: string;
}): Promise<SerializedMessage> {
  const src = await getStoredMessage(args.source, args.messageId);
  if (!src || src.deletedAt) throw new Error("That message is no longer available.");

  const authors = await getChatUsers([src.authorId]);
  return postMessage({
    scope: args.target,
    authorId: args.actorId,
    body: src.body,
    attachments: src.attachments,
    mentions: [],
    forwardedFrom: {
      authorName: authors[src.authorId]?.displayName ?? "Unknown",
      scopeLabel: args.sourceLabel,
    },
  });
}

export async function editMessage(
  scope: MessageScope,
  messageId: string,
  actorId: string,
  body: string,
  attachments?: Attachment[]
): Promise<SerializedMessage> {
  const c = await collectionFor(scope);
  const existing = await c.findOne({ _id: messageId, ...scopeFilter(scope) });
  if (!existing) throw new Error("Message not found.");
  if (existing.authorId !== actorId) throw new Error("You can only edit your own messages.");
  if (existing.deletedAt) throw new Error("Message was deleted.");

  const next = body.trim();
  if (!next && (attachments ?? existing.attachments).length === 0) throw new Error("Message is empty.");

  await c.updateOne(
    { _id: messageId },
    { $set: { body: next, ...(attachments ? { attachments } : {}), editedAt: new Date(), updatedAt: new Date() } }
  );
  const updated = { ...existing, body: next, attachments: attachments ?? existing.attachments, editedAt: new Date() };
  const serialized = (await hydrate([updated], scope, actorId, new Set()))[0];
  await emit({ scope, kind: "message_edit", payload: { message: serialized }, actorId });
  return serialized;
}

export async function softDeleteMessage(
  scope: MessageScope,
  messageId: string,
  actor: { id: string; isModerator: boolean }
): Promise<void> {
  const c = await collectionFor(scope);
  const existing = await c.findOne({ _id: messageId, ...scopeFilter(scope) });
  if (!existing) return;
  if (existing.authorId !== actor.id && !actor.isModerator) {
    throw new Error("You can only delete your own messages.");
  }
  await c.updateOne({ _id: messageId }, { $set: { deletedAt: new Date(), updatedAt: new Date() } });
  await emit({ scope, kind: "message_delete", payload: { messageId }, actorId: actor.id });
}

export async function toggleReaction(
  scope: MessageScope,
  messageId: string,
  userId: string,
  emoji: string
): Promise<{ added: boolean }> {
  const clean = emoji.trim().slice(0, 24);
  if (!clean) throw new Error("No emoji.");
  const r = await reactions();
  const existing = await r.findOne({ messageId, userId, emoji: clean });
  let added: boolean;
  if (existing) {
    await r.deleteOne({ _id: existing._id });
    added = false;
  } else {
    await r.insertOne({ _id: newId(), messageId, userId, emoji: clean, createdAt: new Date() });
    added = true;
  }
  await emit({ scope, kind: "reaction", payload: { messageId, userId, emoji: clean, added }, actorId: userId });
  return { added };
}

// ---------------------------------------------------------------------------
// Search + dashboard aggregations
// ---------------------------------------------------------------------------

export interface MessageSearchHit {
  _id: string;
  scope: MessageScope;
  scopeLabel: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

export async function searchMessages(
  q: string,
  opts: { channelIds: string[]; conversationIds: string[]; limit?: number }
): Promise<MessageSearchHit[]> {
  const term = q.trim();
  if (!term) return [];
  const limit = Math.min(opts.limit ?? 20, 50);
  const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

  const [cm, dm] = await Promise.all([channelMessages(), directMessages()]);
  const [chanRows, dmRows] = await Promise.all([
    opts.channelIds.length
      ? cm.find({ channelId: { $in: opts.channelIds }, body: rx, ...notDeleted }).sort({ createdAt: -1 }).limit(limit).toArray()
      : Promise.resolve([]),
    opts.conversationIds.length
      ? dm.find({ conversationId: { $in: opts.conversationIds }, body: rx, ...notDeleted }).sort({ createdAt: -1 }).limit(limit).toArray()
      : Promise.resolve([]),
  ]);

  const rows = [...chanRows, ...dmRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  const authors = await getChatUsers(rows.map((r) => r.authorId));
  return rows.map((r) => ({
    _id: r._id,
    scope: r.channelId ? { type: "channel", id: r.channelId } : { type: "dm", id: r.conversationId! },
    scopeLabel: r.channelId ? "Channel" : "Direct message",
    authorId: r.authorId,
    authorName: authors[r.authorId]?.displayName ?? "Unknown",
    body: r.body,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function countMessagesBetween(from: Date, to: Date): Promise<number> {
  const [cm, dm] = await Promise.all([channelMessages(), directMessages()]);
  const [a, b] = await Promise.all([
    cm.countDocuments({ createdAt: { $gte: from, $lte: to }, ...notDeleted }),
    dm.countDocuments({ createdAt: { $gte: from, $lte: to }, ...notDeleted }),
  ]);
  return a + b;
}

export async function countDirectMessagesBetween(from: Date, to: Date): Promise<number> {
  return (await directMessages()).countDocuments({ createdAt: { $gte: from, $lte: to }, ...notDeleted });
}

/** Daily message counts (channel + DM) within a range. */
export async function dailyMessageTrend(from: Date, to: Date): Promise<{ date: string; count: number }[]> {
  const [cm, dm] = await Promise.all([channelMessages(), directMessages()]);
  const pipeline = [
    { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: null } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, count: { $sum: 1 } } },
  ];
  const [ca, da] = await Promise.all([cm.aggregate<{ _id: string; count: number }>(pipeline).toArray(), dm.aggregate<{ _id: string; count: number }>(pipeline).toArray()]);
  const merged = new Map<string, number>();
  for (const r of [...ca, ...da]) merged.set(r._id, (merged.get(r._id) ?? 0) + r.count);
  return [...merged.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }));
}

/** Message counts by hour-of-day (0–23) within a range. */
export async function peakHours(from: Date, to: Date): Promise<{ label: string; value: number }[]> {
  const [cm, dm] = await Promise.all([channelMessages(), directMessages()]);
  const pipeline = [
    { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: null } },
    { $group: { _id: { $hour: "$createdAt" }, count: { $sum: 1 } } },
  ];
  const [ca, da] = await Promise.all([cm.aggregate<{ _id: number; count: number }>(pipeline).toArray(), dm.aggregate<{ _id: number; count: number }>(pipeline).toArray()]);
  const byHour = new Array(24).fill(0) as number[];
  for (const r of [...ca, ...da]) byHour[r._id] += r.count;
  return byHour.map((value, h) => ({ label: `${String(h).padStart(2, "0")}:00`, value }));
}

/** Top channels by message volume within a range. */
export async function channelActivity(from: Date, to: Date, limit = 8): Promise<{ label: string; value: number; channelId: string }[]> {
  const cm = await channelMessages();
  const rows = await cm
    .aggregate<{ _id: string; count: number }>([
      { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: null } },
      { $group: { _id: "$channelId", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ])
    .toArray();
  const db = await getDb();
  const channels = await db
    .collection<Channel>("chat_channels")
    .find({ _id: { $in: rows.map((r) => r._id) } })
    .toArray();
  const nameById = new Map(channels.map((c) => [c._id, c.name]));
  return rows.map((r) => ({ channelId: r._id, label: nameById.get(r._id) ?? "channel", value: r.count }));
}

/** Most active people by message volume within a range. */
export async function mostActiveUsers(from: Date, to: Date, limit = 8): Promise<{ label: string; value: number }[]> {
  const [cm, dm] = await Promise.all([channelMessages(), directMessages()]);
  const pipeline = [
    { $match: { createdAt: { $gte: from, $lte: to }, deletedAt: null } },
    { $group: { _id: "$authorId", count: { $sum: 1 } } },
  ];
  const [ca, da] = await Promise.all([cm.aggregate<{ _id: string; count: number }>(pipeline).toArray(), dm.aggregate<{ _id: string; count: number }>(pipeline).toArray()]);
  const merged = new Map<string, number>();
  for (const r of [...ca, ...da]) merged.set(r._id, (merged.get(r._id) ?? 0) + r.count);
  const top = [...merged.entries()].sort(([, a], [, b]) => b - a).slice(0, limit);
  const users = await getChatUsers(top.map(([id]) => id));
  return top.map(([id, value]) => ({ label: users[id]?.displayName ?? "Unknown", value }));
}
