import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/huddle-ai/db";
import { emit } from "@/lib/products/huddle-ai/events";
import { getChatUser, getChatUsers, type DirectoryUser } from "@/lib/products/huddle-ai/users";
import { hasMessengerAccess } from "@/lib/messenger-roles";

/**
 * `direct_conversations` — one-to-one private threads. `participantIds` is a
 * two-element array sorted lexicographically so `getOrCreateDirect` is a stable
 * upsert regardless of who opens the DM first. Per-user read cursors are
 * embedded (`readSeqByUser`) since a 1:1 conversation only ever has two.
 *
 * Pin / archive live on `chat_users` (`pinnedConversationIds`).
 */

export const CONVERSATIONS_COLLECTION = "direct_conversations";

export interface DirectConversation {
  _id: string;
  participantIds: [string, string];
  createdAt: Date;
  lastMessageAt: Date;
  lastMessagePreview: string | null;
  lastMessageAuthorId: string | null;
  readSeqByUser: Record<string, number>;
}

export interface SerializedConversation {
  _id: string;
  otherUser: DirectoryUser | null;
  lastMessageAt: string;
  lastMessagePreview: string | null;
  lastMessageAuthorId: string | null;
  unread: number;
  pinned: boolean;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const c = db.collection<DirectConversation>(CONVERSATIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      c.createIndex({ participantIds: 1 }).catch(() => {}),
      c.createIndex({ lastMessageAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

function pairKey(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function getOrCreateDirect(
  userA: { id: string; roles: string[] },
  otherUserId: string
): Promise<{ ok: true; conversation: DirectConversation } | { ok: false; error: string }> {
  if (userA.id === otherUserId) return { ok: false, error: "You can't DM yourself." };
  const other = await getChatUser(otherUserId);
  if (!other || other.deletedAt) return { ok: false, error: "That person isn't on Messenger." };
  if (!hasMessengerAccess(other.roles)) return { ok: false, error: "That person no longer has Messenger access." };

  const c = await getCollection();
  const [p0, p1] = pairKey(userA.id, otherUserId);
  const now = new Date();
  const existing = await c.findOne({ participantIds: [p0, p1] });
  if (existing) return { ok: true, conversation: existing };

  const doc: DirectConversation = {
    _id: newId(),
    participantIds: [p0, p1],
    createdAt: now,
    lastMessageAt: now,
    lastMessagePreview: null,
    lastMessageAuthorId: null,
    readSeqByUser: { [p0]: 0, [p1]: 0 },
  };
  try {
    await c.insertOne(doc);
  } catch {
    const raced = await c.findOne({ participantIds: [p0, p1] });
    if (raced) return { ok: true, conversation: raced };
    throw new Error("Could not open the conversation.");
  }
  return { ok: true, conversation: doc };
}

export async function getConversation(id: string): Promise<DirectConversation | null> {
  return (await getCollection()).findOne({ _id: id });
}

export function isParticipant(conv: DirectConversation, userId: string): boolean {
  return conv.participantIds.includes(userId);
}

export async function listConversationsForUser(userId: string): Promise<DirectConversation[]> {
  return (await getCollection())
    .find({ participantIds: userId })
    .sort({ lastMessageAt: -1 })
    .toArray();
}

export async function serializeConversations(
  convs: DirectConversation[],
  viewerId: string
): Promise<SerializedConversation[]> {
  if (convs.length === 0) return [];
  const otherIds = convs.map((c) => c.participantIds.find((p) => p !== viewerId) ?? viewerId);
  const [users, viewer, db] = await Promise.all([getChatUsers(otherIds), getChatUser(viewerId), getDb()]);
  const pinned = new Set(viewer?.pinnedConversationIds ?? []);

  const unreadCounts = await Promise.all(
    convs.map((c) =>
      db
        .collection("direct_messages")
        .countDocuments({
          conversationId: c._id,
          seq: { $gt: c.readSeqByUser[viewerId] ?? 0 },
          authorId: { $ne: viewerId },
          deletedAt: null,
        })
    )
  );

  return convs.map((c, i) => {
    const otherId = c.participantIds.find((p) => p !== viewerId) ?? viewerId;
    return {
      _id: c._id,
      otherUser: users[otherId] ?? null,
      lastMessageAt: c.lastMessageAt.toISOString(),
      lastMessagePreview: c.lastMessagePreview,
      lastMessageAuthorId: c.lastMessageAuthorId,
      unread: unreadCounts[i],
      pinned: pinned.has(c._id),
    };
  });
}

export async function advanceDirectRead(conversationId: string, userId: string, seq: number): Promise<void> {
  const c = await getCollection();
  await c.updateOne(
    { _id: conversationId, participantIds: userId },
    { $max: { [`readSeqByUser.${userId}`]: seq } }
  );
  await emit({ scope: { type: "dm", id: conversationId }, kind: "read", payload: { conversationId, userId, seq }, actorId: userId });
}

export async function touchConversation(
  conversationId: string,
  preview: string | null,
  authorId: string | null
): Promise<void> {
  const c = await getCollection();
  await c.updateOne(
    { _id: conversationId },
    { $set: { lastMessageAt: new Date(), lastMessagePreview: preview, lastMessageAuthorId: authorId } }
  );
}

// ---------------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------------

export async function countActiveDirectConversations(sinceDays = 30): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 86400000);
  return (await getCollection()).countDocuments({ lastMessageAt: { $gte: since } });
}
