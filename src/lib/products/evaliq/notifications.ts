import "server-only";
import { getDb } from "@/lib/mongodb";
import { notifyMany, NOTIFICATIONS_COLLECTION, type ChatNotification } from "@/lib/products/huddle-ai/notifications";
import { notifyPortalUser } from "@/lib/products/clientos/notifications";
import { loginsForCandidates } from "@/lib/products/evaliq/people";
import type { CandidateRef } from "@/lib/products/evaliq/constants";

/**
 * OTS reuses the platform's two existing notification stores instead of a
 * new engine:
 *   - staff logins → Messenger's `chat_notifications` (types `ots_*`), shown in
 *     Team Chat's bell and the OTS product bell;
 *   - applicants / students → the External Portal's `external_notifications`,
 *     shown in the portal bell.
 * Delivery is best-effort and never blocks the action that triggered it.
 */

export type OtsNotificationType =
  | "ots_assigned"
  | "ots_starting"
  | "ots_due_soon"
  | "ots_expired"
  | "ots_completed"
  | "ots_result"
  | "ots_certificate"
  | "ots_evaluation_needed"
  | "ots_updated"
  | "ots_extra_attempt"
  | "ots_cancelled_alert"
  | "ots_certificate_revoked_alert"
  | "ots_certificate_restored";

export interface CandidateNotice {
  ref: CandidateRef;
  assignmentId: string;
  type: OtsNotificationType;
  title: string;
  body?: string;
  /** Default: the candidate's test page. */
  staffLink?: string;
  portalLink?: string;
  dedupeKey?: string;
}

/** Notifies each candidate through whichever logins they have (staff bell and/or portal bell). */
export async function notifyCandidates(notices: CandidateNotice[]): Promise<void> {
  if (notices.length === 0) return;
  try {
    const { staff, portal } = await loginsForCandidates(notices.map((n) => n.ref));
    await Promise.all(
      notices.flatMap((n) => {
        const key = `${n.ref.kind}:${n.ref.id}`;
        const jobs: Promise<void>[] = [];
        const staffIds = staff.get(key) ?? [];
        if (staffIds.length)
          jobs.push(
            notifyMany(staffIds, {
              type: n.type,
              title: n.title,
              body: n.body ?? null,
              link: n.staffLink ?? `/evaliq/my-tests/${n.assignmentId}`,
              dedupeKey: n.dedupeKey ?? null,
            }).catch(() => {})
          );
        for (const pid of portal.get(key) ?? [])
          jobs.push(
            notifyPortalUser({
              recipientUserId: pid,
              type: n.type,
              title: n.title,
              body: n.body ?? null,
              link: n.portalLink ?? `/clientos/tests/${n.assignmentId}`,
              dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${pid}` : null,
            })
          );
        return jobs;
      })
    );
  } catch {
    // non-fatal
  }
}

/** Staff-only notice (e.g. "answers waiting for evaluation"). */
export async function notifyStaff(userIds: string[], n: { type: OtsNotificationType; title: string; body?: string; link: string; dedupeKey?: string }): Promise<void> {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  try {
    await notifyMany(ids, { type: n.type, title: n.title, body: n.body ?? null, link: n.link, dedupeKey: n.dedupeKey ?? null });
  } catch {
    // non-fatal
  }
}

export interface OtsBellItem {
  _id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  createdAt: string;
  read: boolean;
}

export async function listOtsNotifications(userId: string, limit = 15): Promise<{ items: OtsBellItem[]; unread: number }> {
  const db = await getDb();
  const col = db.collection<ChatNotification>(NOTIFICATIONS_COLLECTION);
  const filter = { recipientUserId: userId, type: { $regex: "^ots_" } };
  const [rows, unread] = await Promise.all([col.find(filter).sort({ createdAt: -1 }).limit(limit).toArray(), col.countDocuments({ ...filter, read: false })]);
  return {
    items: rows.map((r) => ({ _id: r._id, type: r.type, title: r.title, body: r.body ?? "", link: r.link, createdAt: r.createdAt.toISOString(), read: r.read })),
    unread,
  };
}

export async function markOtsNotificationsRead(userId: string, ids?: string[]): Promise<void> {
  const db = await getDb();
  await db
    .collection<ChatNotification>(NOTIFICATIONS_COLLECTION)
    .updateMany({ recipientUserId: userId, type: { $regex: "^ots_" }, read: false, ...(ids ? { _id: { $in: ids } } : {}) }, { $set: { read: true } });
}
