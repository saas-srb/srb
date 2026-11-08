import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/huddle-ai/db";
import type { CurrentChatUser } from "@/lib/messenger-auth";
import { normalizeChatRoles, type ChatRole } from "@/lib/messenger-roles";

/**
 * `chat_users` — the Messenger-facing profile projected from `admin_users`
 * (+ `hrms_employees` when linked). Kept as its own collection so directory
 * lookups, mentions and message-author rendering never touch the auth store,
 * and so per-user preferences (sound, pinned conversations, starred messages)
 * have a home.
 *
 * `ensureChatUser` is called from the `(protected)` layout on every navigation,
 * so the projection stays fresh without a migration step.
 */

export const CHAT_USERS_COLLECTION = "chat_users";

export interface ChatUser {
  _id: string; // === admin_users._id (string)
  email: string;
  displayName: string;
  title: string | null;
  department: string | null;
  avatarUrl: string | null;
  roles: ChatRole[];
  employeeId: string | null;
  // preferences
  soundEnabled: boolean;
  presenceDefault: "online" | "away" | "busy" | "in_meeting";
  pinnedConversationIds: string[];
  starredMessageIds: string[];
  mutedChannelIds: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface DirectoryUser {
  _id: string;
  displayName: string;
  email: string;
  title: string | null;
  department: string | null;
  avatarUrl: string | null;
  roles: ChatRole[];
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ChatUser>(CHAT_USERS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ email: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ displayName: 1 }).catch(() => {}),
      collection.createIndex({ roles: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

function toDirectory(u: ChatUser): DirectoryUser {
  return {
    _id: u._id,
    displayName: u.displayName,
    email: u.email,
    title: u.title,
    department: u.department,
    avatarUrl: u.avatarUrl,
    roles: u.roles,
  };
}

/** Upsert the Messenger projection for a signed-in user. Idempotent, best-effort. */
export async function ensureChatUser(user: CurrentChatUser): Promise<void> {
  try {
    const collection = await getCollection();
    const db = await getDb();
    const existing = await collection.findOne({ _id: user.id });

    // Title / department are enriched from HRMS in a later phase (needs the
    // designation + department lookup collections). Keep whatever is already
    // stored rather than clobbering it to null on every navigation.
    let title: string | null | undefined;
    let department: string | null | undefined;
    if (user.employeeId) {
      const emp = await db
        .collection<{ _id: string; professional?: { designationId?: string | null; departmentId?: string | null } }>(
          "hrms_employees"
        )
        .findOne({ _id: user.employeeId });
      if (emp?.professional?.designationId) {
        const d = await db
          .collection<{ _id: string; name?: string; title?: string }>("hrms_designations")
          .findOne({ _id: emp.professional.designationId })
          .catch(() => null);
        title = d?.title ?? d?.name ?? undefined;
      }
      if (emp?.professional?.departmentId) {
        const d = await db
          .collection<{ _id: string; name?: string }>("hrms_departments")
          .findOne({ _id: emp.professional.departmentId })
          .catch(() => null);
        department = d?.name ?? undefined;
      }
    }

    const now = new Date();
    await collection.updateOne(
      { _id: user.id },
      {
        $set: {
          email: user.email,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          roles: user.roles,
          employeeId: user.employeeId,
          title: title ?? existing?.title ?? null,
          department: department ?? existing?.department ?? null,
          updatedAt: now,
          deletedAt: null,
        },
        $setOnInsert: {
          soundEnabled: true,
          presenceDefault: "online",
          pinnedConversationIds: [],
          starredMessageIds: [],
          mutedChannelIds: [],
          createdAt: now,
        },
      },
      { upsert: true }
    );
  } catch {
    // projection refresh is best-effort
  }
}

export async function getChatUser(userId: string): Promise<ChatUser | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: userId });
}

/** Batch lookup for message-author / member rendering. Returns a map keyed by id. */
export async function getChatUsers(userIds: string[]): Promise<Record<string, DirectoryUser>> {
  const out: Record<string, DirectoryUser> = {};
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return out;
  const collection = await getCollection();
  const rows = await collection.find({ _id: { $in: ids } }).toArray();
  for (const r of rows) out[r._id] = toDirectory(r);
  return out;
}

export async function listDirectoryUsers(excludeUserId?: string): Promise<DirectoryUser[]> {
  const collection = await getCollection();
  const rows = await collection.find({ ...notDeleted }).sort({ displayName: 1 }).toArray();
  return rows.filter((r) => r._id !== excludeUserId).map(toDirectory);
}

export async function searchUsers(q: string, limit = 12): Promise<DirectoryUser[]> {
  const term = q.trim();
  if (!term) return [];
  const collection = await getCollection();
  const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await collection
    .find({ ...notDeleted, $or: [{ displayName: rx }, { email: rx }, { title: rx }, { department: rx }] })
    .sort({ displayName: 1 })
    .limit(limit)
    .toArray();
  return rows.map(toDirectory);
}

export async function countActiveUsers(): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ ...notDeleted });
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export async function updatePreferences(
  userId: string,
  prefs: Partial<Pick<ChatUser, "soundEnabled" | "presenceDefault">>
): Promise<void> {
  const collection = await getCollection();
  await collection.updateOne({ _id: userId }, { $set: { ...prefs, updatedAt: new Date() } });
}

export async function togglePinnedConversation(userId: string, conversationId: string): Promise<boolean> {
  const collection = await getCollection();
  const u = await collection.findOne({ _id: userId });
  const pinned = new Set(u?.pinnedConversationIds ?? []);
  const nowPinned = !pinned.has(conversationId);
  if (nowPinned) pinned.add(conversationId);
  else pinned.delete(conversationId);
  await collection.updateOne(
    { _id: userId },
    { $set: { pinnedConversationIds: [...pinned], updatedAt: new Date() } }
  );
  return nowPinned;
}

export async function toggleStarredMessage(userId: string, messageId: string): Promise<boolean> {
  const collection = await getCollection();
  const u = await collection.findOne({ _id: userId });
  const starred = new Set(u?.starredMessageIds ?? []);
  const nowStarred = !starred.has(messageId);
  if (nowStarred) starred.add(messageId);
  else starred.delete(messageId);
  await collection.updateOne(
    { _id: userId },
    { $set: { starredMessageIds: [...starred], updatedAt: new Date() } }
  );
  return nowStarred;
}

/** Normalise a stored roles array (used by the seed script projection). */
export function chatRolesOf(raw: unknown): ChatRole[] {
  return normalizeChatRoles(raw);
}
