import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/huddle-ai/db";
import { emit } from "@/lib/products/huddle-ai/events";
import { notify } from "@/lib/products/huddle-ai/notifications";
import { getChatUsers } from "@/lib/products/huddle-ai/users";
import { getChannelBySlug, listMemberIds } from "@/lib/products/huddle-ai/channels";
import { postMessage } from "@/lib/products/huddle-ai/messages";
import { recordAudit } from "@/lib/products/huddle-ai/audit";
import { normalizeChatRoles, canPostAnnouncements, type ChatRole } from "@/lib/messenger-roles";
import type { Attachment } from "@/lib/products/huddle-ai/attachments";

/**
 * Broadcast announcements. Only `super_admin` / `chat_admin` / `chat_hr` may
 * author (see `canPostAnnouncements`). An announcement targets everyone, a set
 * of roles, a set of HRMS departments, or a set of channels; on publish it
 * raises a personal notification for every recipient, optionally cross-posts to
 * `#announcement`, and — when `requireConfirmation` is set — tracks per-user
 * reads so the author can see who has and hasn't acknowledged it.
 */

export const ANNOUNCEMENTS_COLLECTION = "chat_announcements";
export const READS_COLLECTION = "announcement_reads";
const META_COLLECTION = "chat_meta";

export type AnnouncementPriority = "normal" | "important" | "critical";
export type AnnouncementStatus = "draft" | "scheduled" | "published" | "archived";

export type AnnouncementAudience =
  | { kind: "everyone" }
  | { kind: "roles"; roles: ChatRole[] }
  | { kind: "departments"; departmentIds: string[] }
  | { kind: "channels"; channelIds: string[] };

export const PRIORITY_META: Record<AnnouncementPriority, { label: string; className: string }> = {
  normal: { label: "Normal", className: "bg-muted text-muted-foreground" },
  important: { label: "Important", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  critical: { label: "Critical", className: "bg-destructive/15 text-destructive" },
};

export interface Announcement extends AuditFields {
  _id: string;
  title: string;
  body: string;
  priority: AnnouncementPriority;
  attachments: Attachment[];
  audience: AnnouncementAudience;
  authorId: string;
  status: AnnouncementStatus;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  requireConfirmation: boolean;
  crossPost: boolean;
  /** Denormalised recipient count, set at publish. */
  recipientCount: number;
}

export interface SerializedAnnouncement
  extends Omit<Announcement, "createdAt" | "updatedAt" | "deletedAt" | "scheduledFor" | "publishedAt"> {
  createdAt: string;
  updatedAt: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  authorName: string;
  readByMe: boolean;
}

interface ReadDoc {
  _id: string;
  announcementId: string;
  userId: string;
  readAt: Date;
}

let annIdx = false;
let readIdx = false;

async function announcements() {
  const db = await getDb();
  const c = db.collection<Announcement>(ANNOUNCEMENTS_COLLECTION);
  if (!annIdx) {
    annIdx = true;
    await Promise.all([
      c.createIndex({ status: 1, publishedAt: -1 }).catch(() => {}),
      c.createIndex({ authorId: 1, createdAt: -1 }).catch(() => {}),
      c.createIndex({ status: 1, scheduledFor: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

async function reads() {
  const db = await getDb();
  const c = db.collection<ReadDoc>(READS_COLLECTION);
  if (!readIdx) {
    readIdx = true;
    await Promise.all([
      c.createIndex({ announcementId: 1, userId: 1 }, { unique: true }).catch(() => {}),
      c.createIndex({ announcementId: 1 }).catch(() => {}),
    ]);
  }
  return c;
}

// ---------------------------------------------------------------------------
// Recipient resolution
// ---------------------------------------------------------------------------

export async function resolveRecipients(audience: AnnouncementAudience): Promise<string[]> {
  const db = await getDb();
  const chatUsers = db.collection<{ _id: string; roles: string[]; employeeId: string | null }>("chat_users");

  if (audience.kind === "everyone") {
    const rows = await chatUsers.find({ deletedAt: null }).project<{ _id: string }>({ _id: 1 }).toArray();
    return rows.map((r) => r._id);
  }

  if (audience.kind === "roles") {
    const wanted = normalizeChatRoles(audience.roles);
    if (wanted.length === 0) return [];
    const rows = await chatUsers.find({ deletedAt: null, roles: { $in: wanted } }).project<{ _id: string }>({ _id: 1 }).toArray();
    return rows.map((r) => r._id);
  }

  if (audience.kind === "channels") {
    const lists = await Promise.all(audience.channelIds.map((id) => listMemberIds(id)));
    return Array.from(new Set(lists.flat()));
  }

  // departments — HRMS integration point.
  if (audience.departmentIds.length === 0) return [];
  const employees = await db
    .collection<{ _id: string; professional?: { departmentId?: string | null } }>("hrms_employees")
    .find({ deletedAt: null, "professional.departmentId": { $in: audience.departmentIds } })
    .project<{ _id: string }>({ _id: 1 })
    .toArray();
  const empIds = employees.map((e) => e._id);
  if (empIds.length === 0) return [];
  const rows = await chatUsers.find({ deletedAt: null, employeeId: { $in: empIds } }).project<{ _id: string }>({ _id: 1 }).toArray();
  return rows.map((r) => r._id);
}

/** Is this user in the announcement's audience (used for the reader-side list)? */
async function isRecipient(a: Announcement, userId: string): Promise<boolean> {
  if (a.authorId === userId) return true;
  const recipients = await resolveRecipients(a.audience);
  return recipients.includes(userId);
}

// ---------------------------------------------------------------------------
// Reads / serialization
// ---------------------------------------------------------------------------

export async function serializeAnnouncement(a: Announcement, viewerId: string): Promise<SerializedAnnouncement> {
  const [authors, readRow] = await Promise.all([
    getChatUsers([a.authorId]),
    (await reads()).findOne({ announcementId: a._id, userId: viewerId }),
  ]);
  return {
    _id: a._id,
    title: a.title,
    body: a.body,
    priority: a.priority,
    attachments: a.attachments,
    audience: a.audience,
    authorId: a.authorId,
    status: a.status,
    requireConfirmation: a.requireConfirmation,
    crossPost: a.crossPost,
    recipientCount: a.recipientCount,
    createdBy: a.createdBy,
    updatedBy: a.updatedBy,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    scheduledFor: a.scheduledFor ? a.scheduledFor.toISOString() : null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    authorName: authors[a.authorId]?.displayName ?? "Unknown",
    readByMe: readRow !== null,
  };
}

export async function markAnnouncementRead(announcementId: string, userId: string): Promise<void> {
  const c = await reads();
  await c
    .updateOne(
      { announcementId, userId },
      { $setOnInsert: { _id: newId(), announcementId, userId, readAt: new Date() } },
      { upsert: true }
    )
    .catch(() => {});
}

export interface ReadStats {
  total: number;
  read: number;
  readers: { userId: string; name: string; readAt: string }[];
  unread: { userId: string; name: string }[];
}

export async function readStats(announcementId: string): Promise<ReadStats> {
  const a = await (await announcements()).findOne({ _id: announcementId, ...notDeleted });
  if (!a) return { total: 0, read: 0, readers: [], unread: [] };
  const [recipients, readRows] = await Promise.all([
    resolveRecipients(a.audience),
    (await reads()).find({ announcementId }).toArray(),
  ]);
  const recipientSet = new Set(recipients);
  const users = await getChatUsers([...recipientSet]);
  const readMap = new Map(readRows.map((r) => [r.userId, r.readAt]));

  const readers = readRows
    .filter((r) => recipientSet.has(r.userId))
    .map((r) => ({ userId: r.userId, name: users[r.userId]?.displayName ?? "Unknown", readAt: r.readAt.toISOString() }))
    .sort((x, y) => y.readAt.localeCompare(x.readAt));
  const unread = [...recipientSet]
    .filter((id) => !readMap.has(id))
    .map((id) => ({ userId: id, name: users[id]?.displayName ?? "Unknown" }))
    .sort((x, y) => x.name.localeCompare(y.name));

  return { total: recipientSet.size, read: readers.length, readers, unread };
}

// ---------------------------------------------------------------------------
// Reads (lists)
// ---------------------------------------------------------------------------

export async function getAnnouncement(id: string): Promise<Announcement | null> {
  return (await announcements()).findOne({ _id: id, ...notDeleted });
}

export async function canViewAnnouncement(
  a: Announcement,
  user: { id: string; roles: ChatRole[]; permissionOverrides?: Record<string, boolean> }
): Promise<boolean> {
  if (canPostAnnouncements(user)) return true;
  if (a.status !== "published") return false;
  return isRecipient(a, user.id);
}

/** Published announcements this user should see, newest first. */
export async function listForViewer(
  user: { id: string; roles: ChatRole[] },
  opts: { page?: number; pageSize?: number } = {}
): Promise<{ items: SerializedAnnouncement[]; total: number; page: number; totalPages: number }> {
  const c = await announcements();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 50);

  const published = await c.find({ status: "published", ...notDeleted }).sort({ publishedAt: -1 }).toArray();
  const visible: Announcement[] = [];
  for (const a of published) {
    if (await isRecipient(a, user.id)) visible.push(a);
  }
  const total = visible.length;
  const slice = visible.slice((page - 1) * pageSize, page * pageSize);
  const items = await Promise.all(slice.map((a) => serializeAnnouncement(a, user.id)));
  return { items, total, page, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function listForAuthor(authorId: string, viewerId: string): Promise<SerializedAnnouncement[]> {
  const rows = await (await announcements())
    .find({ authorId, ...notDeleted })
    .sort({ createdAt: -1 })
    .toArray();
  return Promise.all(rows.map((a) => serializeAnnouncement(a, viewerId)));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface AnnouncementWriteData {
  title: string;
  body: string;
  priority: AnnouncementPriority;
  attachments: Attachment[];
  audience: AnnouncementAudience;
  scheduledFor: Date | null;
  requireConfirmation: boolean;
  crossPost: boolean;
}

export async function createAnnouncement(data: AnnouncementWriteData, actorId: string): Promise<Announcement> {
  const c = await announcements();
  const status: AnnouncementStatus = data.scheduledFor && data.scheduledFor > new Date() ? "scheduled" : "draft";
  const doc: Announcement = {
    _id: newId(),
    title: data.title.trim(),
    body: data.body,
    priority: data.priority,
    attachments: data.attachments,
    audience: data.audience,
    authorId: actorId,
    status,
    scheduledFor: data.scheduledFor,
    publishedAt: null,
    requireConfirmation: data.requireConfirmation,
    crossPost: data.crossPost,
    recipientCount: 0,
    ...createStamp(actorId),
  };
  await c.insertOne(doc);
  await recordAudit({ actorId, action: "create", entity: "announcement", entityId: doc._id, entityLabel: doc.title, summary: `announcement (${status})` });
  return doc;
}

export async function updateAnnouncement(
  id: string,
  data: Partial<AnnouncementWriteData>,
  actorId: string
): Promise<void> {
  const c = await announcements();
  const existing = await c.findOne({ _id: id, ...notDeleted });
  if (!existing) throw new Error("Announcement not found.");
  if (existing.status === "published") throw new Error("A published announcement can't be edited.");

  const set: Record<string, unknown> = { ...updateStamp(actorId) };
  for (const k of ["title", "body", "priority", "attachments", "audience", "requireConfirmation", "crossPost"] as const) {
    if (data[k] !== undefined) set[k] = k === "title" ? String(data[k]).trim() : data[k];
  }
  if (data.scheduledFor !== undefined) {
    set.scheduledFor = data.scheduledFor;
    set.status = data.scheduledFor && data.scheduledFor > new Date() ? "scheduled" : "draft";
  }
  await c.updateOne({ _id: id }, { $set: set });
}

export async function deleteAnnouncement(id: string, actorId: string): Promise<void> {
  await (await announcements()).updateOne({ _id: id }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  await recordAudit({ actorId, action: "delete", entity: "announcement", entityId: id, summary: "announcement" });
}

export async function archiveAnnouncement(id: string, actorId: string): Promise<void> {
  await (await announcements()).updateOne(
    { _id: id, ...notDeleted },
    { $set: { status: "archived", ...updateStamp(actorId) } }
  );
}

/** Publish now — resolve the audience, notify everyone, optionally cross-post. Idempotent-ish. */
export async function publishAnnouncement(id: string, actorId: string): Promise<{ recipientCount: number }> {
  const c = await announcements();
  const a = await c.findOne({ _id: id, ...notDeleted });
  if (!a) throw new Error("Announcement not found.");
  if (a.status === "published") return { recipientCount: a.recipientCount };

  const recipients = await resolveRecipients(a.audience);
  const now = new Date();
  await c.updateOne(
    { _id: id },
    { $set: { status: "published", publishedAt: now, scheduledFor: null, recipientCount: recipients.length, ...updateStamp(actorId) } }
  );

  const authors = await getChatUsers([a.authorId]);
  const authorName = authors[a.authorId]?.displayName ?? "Someone";
  const prefix = a.priority === "critical" ? "🔴 " : a.priority === "important" ? "🟡 " : "📣 ";

  await Promise.all(
    recipients
      .filter((uid) => uid !== a.authorId)
      .map((uid) =>
        notify({
          recipientUserId: uid,
          type: "announcement",
          title: `${prefix}${a.title}`,
          body: `Announcement from ${authorName}`,
          link: `/huddle-ai/announcements/${a._id}`,
          dedupeKey: `announcement:${a._id}:${uid}`,
        }).then(() =>
          emit({
            scope: { type: "user", id: uid },
            kind: "notification",
            payload: { kind: "announcement", announcementId: a._id, priority: a.priority },
            actorId: a.authorId,
          })
        )
      )
  );

  // Cross-post a pointer into #announcement so it shows in the channel stream too.
  if (a.crossPost) {
    try {
      const channel = await getChannelBySlug("announcement");
      if (channel) {
        await postMessage({
          scope: { type: "channel", id: channel._id },
          authorId: a.authorId,
          body: `${prefix}**${a.title}**\n\n${a.body}\n\n[Open announcement →](/huddle-ai/announcements/${a._id})`,
          attachments: a.attachments,
          mentions: [],
        });
      }
    } catch {
      /* cross-post is best-effort */
    }
  }

  await recordAudit({ actorId, action: "update", entity: "announcement", entityId: id, entityLabel: a.title, summary: `published to ${recipients.length}` });
  return { recipientCount: recipients.length };
}

// ---------------------------------------------------------------------------
// Scheduled-publish sweep — throttled to once / 2 minutes.
// ---------------------------------------------------------------------------

export async function runAnnouncementSweep(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRun: Date }>(META_COLLECTION);
    const now = new Date();
    const claim = await meta.findOneAndUpdate(
      { _id: "announcement_sweep", lastRun: { $lt: new Date(now.getTime() - 2 * 60 * 1000) } },
      { $set: { lastRun: now } },
      { returnDocument: "after" }
    );
    if (!claim) {
      const existing = await meta.findOne({ _id: "announcement_sweep" });
      if (existing) return;
      await meta.updateOne({ _id: "announcement_sweep" }, { $setOnInsert: { lastRun: now } }, { upsert: true });
    }

    const due = await (await announcements())
      .find({ status: "scheduled", scheduledFor: { $lte: now }, ...notDeleted })
      .limit(20)
      .toArray();
    for (const a of due) await publishAnnouncement(a._id, a.authorId).catch(() => {});
  } catch {
    /* sweep failures never break a render */
  }
}
