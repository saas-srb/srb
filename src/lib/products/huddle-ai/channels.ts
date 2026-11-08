import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, slugify, type AuditFields } from "@/lib/products/huddle-ai/db";
import { emit } from "@/lib/products/huddle-ai/events";
import { getChatUsers, type DirectoryUser } from "@/lib/products/huddle-ai/users";
import { isChatAdmin, type ChatRole } from "@/lib/messenger-roles";

/**
 * `chat_channels` + `channel_members`. Three kinds share one model:
 *  - `team`    — org-wide channels (#general, #development, …); public or private
 *  - `project` — auto-bound to a PMS project (later phase); always private
 *  - `group`   — ad-hoc named groups (later phase); always private
 *
 * Product-role access (`hasMessengerAccess`) is only the outer gate. Reading or
 * posting in a channel additionally requires membership — except a **public
 * team** channel, which any Messenger user may read and self-join, and a
 * workspace admin, who may enter any channel for moderation.
 */

export const CHANNELS_COLLECTION = "chat_channels";
export const MEMBERS_COLLECTION = "channel_members";

export type ChannelKind = "team" | "project" | "group";
export type ChannelVisibility = "public" | "private";
export type MemberRole = "owner" | "admin" | "member";
export type NotificationPref = "all" | "mentions" | "none";

export interface Channel extends AuditFields {
  _id: string;
  kind: ChannelKind;
  slug: string;
  name: string;
  description: string | null;
  topic: string | null;
  avatarUrl: string | null;
  visibility: ChannelVisibility;
  /** PMS project id — set only for `kind: "project"`. */
  projectId: string | null;
  pinnedMessageIds: string[];
  archivedAt: Date | null;
  lastActivityAt: Date;
  lastMessagePreview: string | null;
}

export interface ChannelMember extends AuditFields {
  _id: string;
  channelId: string;
  userId: string;
  role: MemberRole;
  joinedAt: Date;
  lastReadSeq: number;
  mutedUntil: Date | null;
  notificationPref: NotificationPref;
}

export interface SerializedChannel extends Omit<Channel, "createdAt" | "updatedAt" | "deletedAt" | "archivedAt" | "lastActivityAt"> {
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  lastActivityAt: string;
  memberCount: number;
  myRole: MemberRole | null;
  unread: number;
}

export interface ChannelMemberWithUser {
  _id: string;
  channelId: string;
  userId: string;
  role: MemberRole;
  lastReadSeq: number;
  notificationPref: NotificationPref;
  joinedAt: string;
  user: DirectoryUser | null;
}

let channelIdx = false;
let memberIdx = false;

async function channels() {
  const db = await getDb();
  const c = db.collection<Channel>(CHANNELS_COLLECTION);
  if (!channelIdx) {
    channelIdx = true;
    await Promise.all([
      c.createIndex({ slug: 1 }, { unique: true, partialFilterExpression: { deletedAt: null } }).catch(() => {}),
      c.createIndex({ kind: 1, visibility: 1 }).catch(() => {}),
      c.createIndex({ projectId: 1 }).catch(() => {}),
      c.createIndex({ lastActivityAt: -1 }).catch(() => {}),
    ]);
  }
  return c;
}

async function members() {
  const db = await getDb();
  const c = db.collection<ChannelMember>(MEMBERS_COLLECTION);
  if (!memberIdx) {
    memberIdx = true;
    await Promise.all([
      c.createIndex({ channelId: 1, userId: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ userId: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getChannel(id: string): Promise<Channel | null> {
  return (await channels()).findOne({ _id: id, ...notDeleted });
}

export async function getChannelBySlug(slug: string): Promise<Channel | null> {
  return (await channels()).findOne({ slug, ...notDeleted });
}

export async function getMembership(channelId: string, userId: string): Promise<ChannelMember | null> {
  return (await members()).findOne({ channelId, userId, ...notDeleted });
}

export async function isMember(channelId: string, userId: string): Promise<boolean> {
  return (await getMembership(channelId, userId)) !== null;
}

/** Can this user read the channel at all? */
export async function canAccessChannel(
  channel: Channel,
  user: { id: string; roles: ChatRole[]; permissionOverrides?: Record<string, boolean> }
): Promise<boolean> {
  if (await isMember(channel._id, user.id)) return true;
  if (channel.kind === "team" && channel.visibility === "public") return true;
  if (isChatAdmin(user)) return true;
  return false;
}

/** Can this user post in the channel? (Archived channels are read-only.) */
export async function canPostInChannel(
  channel: Channel,
  user: { id: string; roles: ChatRole[]; permissionOverrides?: Record<string, boolean> }
): Promise<boolean> {
  if (channel.archivedAt) return false;
  if (await isMember(channel._id, user.id)) return true;
  if (channel.kind === "team" && channel.visibility === "public") return true;
  return false;
}

async function countMembers(channelId: string): Promise<number> {
  return (await members()).countDocuments({ channelId, ...notDeleted });
}

export async function serializeChannel(channel: Channel, viewerId: string): Promise<SerializedChannel> {
  const [memberCount, membership] = await Promise.all([countMembers(channel._id), getMembership(channel._id, viewerId)]);
  let unread = 0;
  if (membership) {
    const db = await getDb();
    unread = await db
      .collection("channel_messages")
      .countDocuments({ channelId: channel._id, seq: { $gt: membership.lastReadSeq }, deletedAt: null, authorId: { $ne: viewerId } });
  }
  return {
    _id: channel._id,
    kind: channel.kind,
    slug: channel.slug,
    name: channel.name,
    description: channel.description,
    topic: channel.topic,
    avatarUrl: channel.avatarUrl,
    visibility: channel.visibility,
    projectId: channel.projectId,
    pinnedMessageIds: channel.pinnedMessageIds,
    createdBy: channel.createdBy,
    updatedBy: channel.updatedBy,
    createdAt: channel.createdAt.toISOString(),
    updatedAt: channel.updatedAt.toISOString(),
    archivedAt: channel.archivedAt ? channel.archivedAt.toISOString() : null,
    lastActivityAt: channel.lastActivityAt.toISOString(),
    lastMessagePreview: channel.lastMessagePreview,
    memberCount,
    myRole: membership?.role ?? null,
    unread,
  };
}

/** Channels the user belongs to, most recently active first. */
export async function listMemberChannels(userId: string, kind?: ChannelKind): Promise<Channel[]> {
  const memberRows = await (await members()).find({ userId, ...notDeleted }).toArray();
  const ids = memberRows.map((m) => m.channelId);
  if (ids.length === 0) return [];
  const filter: Record<string, unknown> = { _id: { $in: ids }, ...notDeleted };
  if (kind) filter.kind = kind;
  return (await channels()).find(filter).sort({ lastActivityAt: -1 }).toArray();
}

/** Public team channels the user is *not* yet in — for the "browse channels" list. */
export async function listBrowsableChannels(userId: string): Promise<Channel[]> {
  const memberRows = await (await members()).find({ userId, ...notDeleted }).toArray();
  const joined = new Set(memberRows.map((m) => m.channelId));
  const rows = await (await channels())
    .find({ kind: "team", visibility: "public", ...notDeleted })
    .sort({ lastActivityAt: -1 })
    .toArray();
  return rows.filter((c) => !joined.has(c._id));
}

export async function listMembers(channelId: string): Promise<ChannelMemberWithUser[]> {
  const rows = await (await members()).find({ channelId, ...notDeleted }).toArray();
  const users = await getChatUsers(rows.map((r) => r.userId));
  const rank: Record<MemberRole, number> = { owner: 0, admin: 1, member: 2 };
  return rows
    .sort((a, b) => rank[a.role] - rank[b.role] || a.joinedAt.getTime() - b.joinedAt.getTime())
    .map((r) => ({
      _id: r._id,
      channelId: r.channelId,
      userId: r.userId,
      role: r.role,
      lastReadSeq: r.lastReadSeq,
      notificationPref: r.notificationPref,
      joinedAt: r.joinedAt.toISOString(),
      user: users[r.userId] ?? null,
    }));
}

export async function listMemberIds(channelId: string): Promise<string[]> {
  const rows = await (await members()).find({ channelId, ...notDeleted }).project<{ userId: string }>({ userId: 1 }).toArray();
  return rows.map((r) => r.userId);
}

export async function countChannels(kind?: ChannelKind): Promise<number> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (kind) filter.kind = kind;
  return (await channels()).countDocuments(filter);
}

export async function countActiveProjectChannels(sinceDays = 7): Promise<number> {
  const since = new Date(Date.now() - sinceDays * 86400000);
  return (await channels()).countDocuments({ kind: "project", lastActivityAt: { $gte: since }, ...notDeleted });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function uniqueSlug(base: string): Promise<string> {
  const c = await channels();
  const root = slugify(base);
  let slug = root;
  let n = 1;
  while (await c.findOne({ slug, ...notDeleted })) slug = `${root}-${++n}`;
  return slug;
}

export interface CreateChannelInput {
  kind: ChannelKind;
  name: string;
  description?: string | null;
  visibility?: ChannelVisibility;
  projectId?: string | null;
  memberIds?: string[];
}

export async function createChannel(input: CreateChannelInput, actorId: string): Promise<Channel> {
  const c = await channels();
  const now = new Date();
  const visibility: ChannelVisibility = input.kind === "team" ? input.visibility ?? "public" : "private";
  const doc: Channel = {
    _id: newId(),
    kind: input.kind,
    slug: await uniqueSlug(input.name),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    topic: null,
    avatarUrl: null,
    visibility,
    projectId: input.projectId ?? null,
    pinnedMessageIds: [],
    archivedAt: null,
    lastActivityAt: now,
    lastMessagePreview: null,
    ...createStamp(actorId),
  };
  await c.insertOne(doc);

  const memberIds = Array.from(new Set([actorId, ...(input.memberIds ?? [])]));
  const m = await members();
  await m.insertMany(
    memberIds.map((userId) => ({
      _id: newId(),
      channelId: doc._id,
      userId,
      role: (userId === actorId ? "owner" : "member") as MemberRole,
      joinedAt: now,
      lastReadSeq: 0,
      mutedUntil: null,
      notificationPref: "all" as NotificationPref,
      ...createStamp(actorId),
    }))
  );

  await emit({ scope: { type: "channel", id: doc._id }, kind: "channel", payload: { action: "created", channelId: doc._id }, actorId });
  return doc;
}

export async function updateChannel(
  channelId: string,
  patch: Partial<Pick<Channel, "name" | "description" | "topic" | "avatarUrl" | "visibility">>,
  actorId: string
): Promise<void> {
  const c = await channels();
  const set: Record<string, unknown> = { ...updateStamp(actorId) };
  if (patch.name !== undefined) set.name = patch.name.trim();
  if (patch.description !== undefined) set.description = patch.description?.trim() || null;
  if (patch.topic !== undefined) set.topic = patch.topic?.trim() || null;
  if (patch.avatarUrl !== undefined) set.avatarUrl = patch.avatarUrl;
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  await c.updateOne({ _id: channelId, ...notDeleted }, { $set: set });
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "updated", channelId }, actorId });
}

export async function archiveChannel(channelId: string, actorId: string, archived = true): Promise<void> {
  const c = await channels();
  await c.updateOne(
    { _id: channelId, ...notDeleted },
    { $set: { archivedAt: archived ? new Date() : null, ...updateStamp(actorId) } }
  );
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: archived ? "archived" : "unarchived", channelId }, actorId });
}

export async function joinChannel(channelId: string, userId: string): Promise<void> {
  const m = await members();
  const existing = await m.findOne({ channelId, userId });
  if (existing && !existing.deletedAt) return;
  const now = new Date();
  await m.updateOne(
    { channelId, userId },
    {
      $set: { role: "member", joinedAt: now, deletedAt: null, ...updateStamp(userId) },
      $setOnInsert: { _id: newId(), lastReadSeq: 0, mutedUntil: null, notificationPref: "all", createdAt: now, createdBy: userId },
    },
    { upsert: true }
  );
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "member_joined", channelId, userId }, actorId: userId });
  await emit({ scope: { type: "user", id: userId }, kind: "channel", payload: { action: "self_joined", channelId }, actorId: userId });
}

export async function addMembers(channelId: string, userIds: string[], actorId: string): Promise<void> {
  const m = await members();
  const now = new Date();
  for (const userId of Array.from(new Set(userIds))) {
    await m.updateOne(
      { channelId, userId },
      {
        $set: { deletedAt: null, ...updateStamp(actorId) },
        $setOnInsert: {
          _id: newId(),
          role: "member",
          joinedAt: now,
          lastReadSeq: 0,
          mutedUntil: null,
          notificationPref: "all",
          createdAt: now,
          createdBy: actorId,
        },
      },
      { upsert: true }
    );
    await emit({ scope: { type: "user", id: userId }, kind: "channel", payload: { action: "added_to_channel", channelId }, actorId });
  }
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "members_added", channelId, userIds }, actorId });
}

export async function removeMember(channelId: string, userId: string, actorId: string): Promise<void> {
  const m = await members();
  await m.updateOne({ channelId, userId }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "member_removed", channelId, userId }, actorId });
  await emit({ scope: { type: "user", id: userId }, kind: "channel", payload: { action: "removed_from_channel", channelId }, actorId });
}

export async function setMemberRole(channelId: string, userId: string, role: MemberRole, actorId: string): Promise<void> {
  const m = await members();
  await m.updateOne({ channelId, userId, ...notDeleted }, { $set: { role, ...updateStamp(actorId) } });
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "role_changed", channelId, userId, role }, actorId });
}

export async function advanceChannelRead(channelId: string, userId: string, seq: number): Promise<void> {
  const m = await members();
  await m.updateOne({ channelId, userId, ...notDeleted, lastReadSeq: { $lt: seq } }, { $set: { lastReadSeq: seq } });
  await emit({ scope: { type: "channel", id: channelId }, kind: "read", payload: { channelId, userId, seq }, actorId: userId });
}

export async function touchChannel(channelId: string, preview: string | null): Promise<void> {
  const c = await channels();
  await c.updateOne({ _id: channelId }, { $set: { lastActivityAt: new Date(), lastMessagePreview: preview } });
}

// ---------------------------------------------------------------------------
// Pins
// ---------------------------------------------------------------------------

export async function pinMessage(channelId: string, messageId: string, actorId: string): Promise<void> {
  const c = await channels();
  await c.updateOne({ _id: channelId, ...notDeleted }, { $addToSet: { pinnedMessageIds: messageId }, $set: updateStamp(actorId) });
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "message_pinned", channelId, messageId }, actorId });
}

export async function unpinMessage(channelId: string, messageId: string, actorId: string): Promise<void> {
  const c = await channels();
  await c.updateOne({ _id: channelId, ...notDeleted }, { $pull: { pinnedMessageIds: messageId }, $set: updateStamp(actorId) });
  await emit({ scope: { type: "channel", id: channelId }, kind: "channel", payload: { action: "message_unpinned", channelId, messageId }, actorId });
}
