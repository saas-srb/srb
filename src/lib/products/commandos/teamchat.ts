import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { getChatUsers } from "@/lib/products/huddle-ai/users";
import {
  CONVERSATIONS_COLLECTION,
  type DirectConversation,
} from "@/lib/products/huddle-ai/conversations";
import {
  CHANNELS_COLLECTION,
  MEMBERS_COLLECTION,
  type Channel,
} from "@/lib/products/huddle-ai/channels";
import {
  MEETINGS_COLLECTION,
  PARTICIPANTS_COLLECTION,
  type Meeting,
} from "@/lib/products/huddle-ai/meetings";

/**
 * Cross-conversation Team Chat admin listings — Direct Messages, Channels,
 * Meetings. None of these had an admin-wide search before (the module is
 * realtime/per-user-facing: `listConversationsForUser`, `listMemberChannels`,
 * `listMeetingsForUser`). Message *content* is intentionally not surfaced row
 * by row here — DMs show each conversation's own already-stored
 * `lastMessagePreview`, the same preview the product itself shows, not a
 * fetched transcript; there's no admin-facing DM reader anywhere in the app
 * and this doesn't add one. Real mutation actions used: `archiveChannel`,
 * `cancelMeeting` (both already exist in `messenger/channels.ts` /
 * `messenger/meetings.ts`). Direct conversations have no real delete/archive
 * function anywhere in the app, so that listing stays view-only.
 */

// ---------------------------------------------------------------------------
// Direct Message conversations
// ---------------------------------------------------------------------------

export interface AdminDirectConversationRow {
  _id: string;
  participantA: string;
  participantB: string;
  lastMessagePreview: string | null;
  lastMessageAt: string;
  createdAt: string;
}

export interface SearchDirectConversationsOptions {
  search?: string;
  page?: number;
  pageSize?: number;
}

async function conversationsCollection() {
  const db = await getDb();
  return db.collection<DirectConversation>(CONVERSATIONS_COLLECTION);
}

export async function searchDirectConversations(opts: SearchDirectConversationsOptions = {}) {
  const collection = await conversationsCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.lastMessagePreview = rx;
  }

  const [docs, total] = await Promise.all([
    collection.find(filter).sort({ lastMessageAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  const userIds = [...new Set(docs.flatMap((d) => d.participantIds))];
  const users = await getChatUsers(userIds);

  const items: AdminDirectConversationRow[] = docs.map((d) => ({
    _id: d._id,
    participantA: users[d.participantIds[0]]?.displayName ?? d.participantIds[0],
    participantB: users[d.participantIds[1]]?.displayName ?? d.participantIds[1],
    lastMessagePreview: d.lastMessagePreview,
    lastMessageAt: new Date(d.lastMessageAt).toISOString(),
    createdAt: new Date(d.createdAt).toISOString(),
  }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportDirectConversations(opts: SearchDirectConversationsOptions = {}): Promise<AdminDirectConversationRow[]> {
  const { items } = await searchDirectConversations({ ...opts, page: 1, pageSize: 5000 });
  return items;
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

export interface AdminChannelRow {
  _id: string;
  name: string;
  kind: string;
  visibility: string;
  memberCount: number;
  archived: boolean;
  lastActivityAt: string;
  createdAt: string;
}

export interface SearchChannelsOptions {
  search?: string;
  kind?: string;
  archived?: boolean;
  page?: number;
  pageSize?: number;
}

async function channelsCollection() {
  const db = await getDb();
  return db.collection<Channel>(CHANNELS_COLLECTION);
}

function buildChannelFilter(opts: SearchChannelsOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { slug: rx }, { topic: rx }];
  }
  if (opts.kind) filter.kind = opts.kind;
  if (opts.archived !== undefined) filter.archivedAt = opts.archived ? { $ne: null } : null;
  return filter;
}

export async function searchChannels(opts: SearchChannelsOptions = {}) {
  const collection = await channelsCollection();
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildChannelFilter(opts);

  const [docs, total] = await Promise.all([
    collection.find(filter).sort({ lastActivityAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  const channelIds = docs.map((d) => d._id);
  const counts = channelIds.length
    ? await db
        .collection(MEMBERS_COLLECTION)
        .aggregate<{ _id: string; count: number }>([
          { $match: { channelId: { $in: channelIds } } },
          { $group: { _id: "$channelId", count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const countByChannel = new Map(counts.map((c) => [c._id, c.count]));

  const items: AdminChannelRow[] = docs.map((d) => ({
    _id: d._id,
    name: d.name,
    kind: d.kind,
    visibility: d.visibility,
    memberCount: countByChannel.get(d._id) ?? 0,
    archived: d.archivedAt !== null,
    lastActivityAt: new Date(d.lastActivityAt).toISOString(),
    createdAt: new Date(d.createdAt).toISOString(),
  }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportChannels(opts: SearchChannelsOptions & { ids?: string[] } = {}): Promise<AdminChannelRow[]> {
  if (opts.ids && opts.ids.length > 0) {
    const collection = await channelsCollection();
    const db = await getDb();
    const docs = await collection.find({ _id: { $in: opts.ids } }).toArray();
    const counts = await db
      .collection(MEMBERS_COLLECTION)
      .aggregate<{ _id: string; count: number }>([
        { $match: { channelId: { $in: opts.ids } } },
        { $group: { _id: "$channelId", count: { $sum: 1 } } },
      ])
      .toArray();
    const countByChannel = new Map(counts.map((c) => [c._id, c.count]));
    return docs.map((d) => ({
      _id: d._id,
      name: d.name,
      kind: d.kind,
      visibility: d.visibility,
      memberCount: countByChannel.get(d._id) ?? 0,
      archived: d.archivedAt !== null,
      lastActivityAt: new Date(d.lastActivityAt).toISOString(),
      createdAt: new Date(d.createdAt).toISOString(),
    }));
  }
  const { items } = await searchChannels({ ...opts, page: 1, pageSize: 5000 });
  return items;
}

// ---------------------------------------------------------------------------
// Meetings
// ---------------------------------------------------------------------------

export interface AdminMeetingRow {
  _id: string;
  title: string;
  hostName: string;
  kind: string;
  status: string;
  startAt: string;
  durationMins: number;
  participantCount: number;
  recordingEnabled: boolean;
}

export interface SearchMeetingsOptions {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

async function meetingsCollection() {
  const db = await getDb();
  return db.collection<Meeting>(MEETINGS_COLLECTION);
}

function buildMeetingFilter(opts: SearchMeetingsOptions): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.title = rx;
  }
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchMeetings(opts: SearchMeetingsOptions = {}) {
  const collection = await meetingsCollection();
  const db = await getDb();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildMeetingFilter(opts);

  const [docs, total] = await Promise.all([
    collection.find(filter).sort({ startAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  const meetingIds = docs.map((d) => d._id);
  const [hosts, counts] = await Promise.all([
    getChatUsers([...new Set(docs.map((d) => d.hostId))]),
    meetingIds.length
      ? db
          .collection(PARTICIPANTS_COLLECTION)
          .aggregate<{ _id: string; count: number }>([
            { $match: { meetingId: { $in: meetingIds } } },
            { $group: { _id: "$meetingId", count: { $sum: 1 } } },
          ])
          .toArray()
      : Promise.resolve([]),
  ]);
  const countByMeeting = new Map(counts.map((c) => [c._id, c.count]));

  const items: AdminMeetingRow[] = docs.map((d) => ({
    _id: d._id,
    title: d.title,
    hostName: hosts[d.hostId]?.displayName ?? d.hostId,
    kind: d.kind,
    status: d.status,
    startAt: new Date(d.startAt).toISOString(),
    durationMins: d.durationMins,
    participantCount: countByMeeting.get(d._id) ?? 0,
    recordingEnabled: d.recordingEnabled,
  }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportMeetings(opts: SearchMeetingsOptions = {}): Promise<AdminMeetingRow[]> {
  const { items } = await searchMeetings({ ...opts, page: 1, pageSize: 5000 });
  return items;
}
