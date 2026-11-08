import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { externalUsers, type ExternalUserDoc } from "@/lib/portal-auth";
import { NOTIFICATIONS_COLLECTION as PORTAL_NOTIFICATIONS_COLLECTION } from "@/lib/products/clientos/notifications";
import type { PortalRole } from "@/lib/portal-roles";

/**
 * Director management layer for the External User Portal. Nothing here
 * existed before — the Portal only ever had auth/session code
 * (`src/lib/portal-auth.ts`) and registration flows, no admin-facing
 * search/suspend/force-logout anywhere (there's no "portal staff product" to
 * mirror, unlike PMS/TMS/PRMS). `externalUsers()` and the `portal_sessions` /
 * `external_notifications` collections are reused directly rather than
 * duplicated.
 */

const SESSIONS_COLLECTION = "portal_sessions";

/** Base row shape from the data layer — the admin page adds a `linkedRecordHref`
 * (role-specific deep link) before handing rows to the grid. */
export interface PortalUserSearchRow {
  _id: string;
  email: string;
  phone: string;
  displayName: string;
  role: PortalRole;
  status: "active" | "suspended";
  locked: boolean;
  activeSessions: number;
  unreadNotifications: number;
  lastLoginAt: string | null;
  createdAt: string;
  /** Exactly one is set, matching `role` — the real record this login is tied to. */
  applicationId: string | null;
  studentId: string | null;
  clientId: string | null;
}

export interface PortalUserFilter {
  search?: string;
  role?: PortalRole;
  status?: "active" | "suspended";
}

function buildFilter(opts: PortalUserFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ email: rx }, { phone: rx }, { displayName: rx }];
  }
  if (opts.role) filter.role = opts.role;
  if (opts.status) filter.status = opts.status;
  return filter;
}

export interface SearchPortalUsersOptions extends PortalUserFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "displayName" | "lastLoginAt" | "role" | "status";
  sortDir?: "asc" | "desc";
}

async function attachLiveCounts(users: ExternalUserDoc[]): Promise<PortalUserSearchRow[]> {
  const db = await getDb();
  const ids = users.map((u) => u._id);
  const now = new Date();

  const [sessionRows, notificationRows] = ids.length
    ? await Promise.all([
        db
          .collection(SESSIONS_COLLECTION)
          .aggregate<{ _id: string; count: number }>([
            { $match: { userId: { $in: ids }, expiresAt: { $gt: now } } },
            { $group: { _id: "$userId", count: { $sum: 1 } } },
          ])
          .toArray(),
        db
          .collection(PORTAL_NOTIFICATIONS_COLLECTION)
          .aggregate<{ _id: string; count: number }>([
            { $match: { recipientUserId: { $in: ids }, read: false } },
            { $group: { _id: "$recipientUserId", count: { $sum: 1 } } },
          ])
          .toArray(),
      ])
    : [[], []];

  const sessionsByUser = new Map(sessionRows.map((r) => [r._id, r.count]));
  const notificationsByUser = new Map(notificationRows.map((r) => [r._id, r.count]));

  return users.map((u) => ({
    _id: u._id,
    email: u.email,
    phone: u.phone,
    displayName: u.displayName || u.email.split("@")[0],
    role: u.role,
    status: u.status,
    locked: Boolean(u.lockedUntil && u.lockedUntil > now),
    activeSessions: sessionsByUser.get(u._id) ?? 0,
    unreadNotifications: notificationsByUser.get(u._id) ?? 0,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    applicationId: u.applicationId ?? null,
    studentId: u.studentId ?? null,
    clientId: u.clientId ?? null,
  }));
}

export async function searchPortalUsers(opts: SearchPortalUsersOptions = {}) {
  const collection = await externalUsers();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [docs, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return {
    items: await attachLiveCounts(docs),
    total,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(total / pageSize), 1),
  };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportPortalUsers(opts: PortalUserFilter & { ids?: string[] } = {}): Promise<ExternalUserDoc[]> {
  const collection = await externalUsers();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids } } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

/** Suspend/reactivate — reversible, unlike a delete (which this module doesn't
 * expose: an external login is tied to a real applicant/student/client
 * record, so removing the account is out of scope for a status toggle). */
export async function setPortalUserStatus(id: string, status: "active" | "suspended"): Promise<boolean> {
  const collection = await externalUsers();
  const res = await collection.updateOne({ _id: id }, { $set: { status, updatedAt: new Date() } });
  return res.matchedCount === 1;
}

/** Force-logout — deletes every live session for this user; they simply sign
 * in again next time, so this is safe and fully reversible. */
export async function forceLogoutPortalUser(id: string): Promise<number> {
  const db = await getDb();
  const res = await db.collection(SESSIONS_COLLECTION).deleteMany({ userId: id });
  return res.deletedCount;
}
