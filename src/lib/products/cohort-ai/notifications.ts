import "server-only";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { signalNew } from "@/lib/notify/signals";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { queuePush } from "@/lib/push/send";
import { categorizeType } from "@/lib/push/categories";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/cohort-ai/db";

/**
 * Per-recipient TMS notifications. `recipientUserId` is an `admin_users` `_id`
 * (string) — staff product users and student portal logins alike. Mirrors
 * `src/lib/sprintos/notifications.ts`.
 */

export const NOTIFICATIONS_COLLECTION = "training_notifications";
const META_COLLECTION = "tms_meta";
const STUDENTS_COLLECTION = "training_students";
const ENROLLMENTS_COLLECTION = "student_enrollments";
const CLASSES_COLLECTION = "class_schedules";
const PAYMENTS_COLLECTION = "payments";

export type NotificationAudience = "staff" | "student";

export interface TmsNotification {
  _id: string;
  recipientUserId: string;
  audience: NotificationAudience;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  dedupeKey: string | null;
  createdAt: Date;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<TmsNotification>(NOTIFICATIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ recipientUserId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ recipientUserId: 1, read: 1 }).catch(() => {}),
      // Partial: only string dedupe keys are unique — `null` / missing never collide.
      collection
        .createIndex({ dedupeKey: 1 }, { unique: true, partialFilterExpression: { dedupeKey: { $type: "string" } } })
        .catch(() => {}),
    ]);
  }
  return collection;
}

export interface NotifyInput {
  recipientUserId: string;
  audience: NotificationAudience;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  dedupeKey?: string | null;
}

/** Best-effort — never throws. Dedupe-key collisions are silently ignored. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const collection = await getCollection();
    const plan = await planNotification({ type: input.type, title: input.title, body: input.body, link: input.link, product: "tms" });
    if (plan.inApp.on) await collection.insertOne({
      _id: newId(),
      recipientUserId: input.recipientUserId,
      audience: input.audience,
      type: input.type,
      title: plan.inApp.title,
      body: plan.inApp.body,
      link: input.link ?? null,
      read: false,
      // Only store the key when it's a real string — the unique index is partial
      // on `$type: "string"`, so `null`/missing never collide.
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      createdAt: new Date(),
    } as TmsNotification);
    await queuePush("staff", [input.recipientUserId], { category: categorizeType(input.type), title: input.title, body: input.body, url: input.link, tag: input.dedupeKey ?? undefined, event: input.type, product: "tms" });
    if (plan.inApp.on) await signalNew("tms", [input.recipientUserId], { type: input.type, title: plan.inApp.title, body: plan.inApp.body, link: input.link ?? null });
    await logBell(plan.inApp.on, { type: input.type, title: input.title, product: "tms", reason: plan.inApp.reason });
  } catch {
    // dup dedupeKey or transient error — ignore.
  }
}

/** Resolve a `training_students` id to its portal login and notify them. */
export async function notifyStudent(
  studentId: string,
  n: Omit<NotifyInput, "recipientUserId" | "audience">
): Promise<void> {
  try {
    const db = await getDb();
    const login = await db
      .collection<{ _id: unknown }>("admin_users")
      .findOne({ studentId, roles: "training_student" });
    if (!login) return;
    await notify({ ...n, recipientUserId: String(login._id), audience: "student" });
  } catch {
    /* ignore */
  }
}

/** Notify every student enrolled in a batch. */
export async function notifyBatchStudents(
  batchId: string,
  n: Omit<NotifyInput, "recipientUserId" | "audience"> & { dedupeSuffix?: string }
): Promise<void> {
  try {
    const db = await getDb();
    const enrollments = await db
      .collection<{ studentId: string }>(ENROLLMENTS_COLLECTION)
      .find({ batchId, deletedAt: null, status: { $ne: "dropped" } })
      .toArray();
    await Promise.all(
      enrollments.map((e) =>
        notifyStudent(e.studentId, {
          ...n,
          dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${e.studentId}` : null,
        })
      )
    );
  } catch {
    /* ignore */
  }
}

/** Notify all TMS staff (admins + managers). */
export async function notifyStaff(n: Omit<NotifyInput, "recipientUserId" | "audience">): Promise<void> {
  try {
    const db = await getDb();
    const staff = await db
      .collection<{ _id: unknown }>("admin_users")
      .find({ roles: { $in: ["super_admin", "tms_admin", "tms_manager"] }, status: { $nin: BLOCKED_STATUSES } })
      .toArray();
    await Promise.all(
      staff.map((s) =>
        notify({
          ...n,
          recipientUserId: String(s._id),
          audience: "staff",
          dedupeKey: n.dedupeKey ? `${n.dedupeKey}:${String(s._id)}` : null,
        })
      )
    );
  } catch {
    /* ignore */
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listNotifications(recipientUserId: string, limit = 20): Promise<TmsNotification[]> {
  const collection = await getCollection();
  return collection.find({ recipientUserId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function unreadCount(recipientUserId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ recipientUserId, read: false });
}

export async function markRead(ids: string[], recipientUserId: string): Promise<void> {
  if (ids.length === 0) return;
  const collection = await getCollection();
  await collection.updateMany({ _id: { $in: ids }, recipientUserId }, { $set: { read: true } });
}

export async function markAllRead(recipientUserId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateMany({ recipientUserId, read: false }, { $set: { read: true } });
}

// ---------------------------------------------------------------------------
// Sweep — generates time-based notifications, throttled to once/hour.
// ---------------------------------------------------------------------------

export async function runTmsSweep(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRun: Date }>(META_COLLECTION);
    const now = new Date();
    const claim = await meta.findOneAndUpdate(
      { _id: "notification_sweep", lastRun: { $lt: new Date(now.getTime() - 60 * 60 * 1000) } },
      { $set: { lastRun: now } },
      { upsert: false, returnDocument: "after" }
    );
    // First-ever run: upsert and continue.
    if (!claim) {
      const existing = await meta.findOne({ _id: "notification_sweep" });
      if (existing) return; // someone else claimed within the hour
      await meta.updateOne({ _id: "notification_sweep" }, { $setOnInsert: { lastRun: now } }, { upsert: true });
    }

    const today = now.toISOString().slice(0, 10);
    const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);

    // 1. Classes happening tomorrow → remind enrolled students.
    const upcomingClasses = await db
      .collection<{ _id: string; batchId: string; topic: string; date: string }>(CLASSES_COLLECTION)
      .find({ deletedAt: null, status: "scheduled", date: tomorrow })
      .toArray();
    for (const c of upcomingClasses) {
      await notifyBatchStudents(c.batchId, {
        type: "class_reminder",
        title: "Class tomorrow",
        body: c.topic,
        link: "/cohort-ai/me/schedule",
        dedupeKey: `class_reminder:${c._id}`,
      });
    }

    // 2. Fee plans with a pending balance → nudge staff weekly.
    const pendingPlans = await db
      .collection<{ _id: string; totalFees: number; discount: number; installments: { amount: number }[] }>(PAYMENTS_COLLECTION)
      .find({ deletedAt: null })
      .toArray();
    const overdue = pendingPlans.filter((p) => {
      const paid = (p.installments ?? []).reduce((s, i) => s + i.amount, 0);
      return Math.max((p.totalFees ?? 0) - (p.discount ?? 0) - paid, 0) > 0;
    });
    if (overdue.length > 0) {
      await notifyStaff({
        type: "fees_pending",
        title: `${overdue.length} fee plan(s) with a pending balance`,
        body: "Follow up on outstanding payments.",
        link: "/cohort-ai/payments",
        dedupeKey: `fees_pending:${today.slice(0, 7)}`,
      });
    }
    void STUDENTS_COLLECTION;
  } catch {
    // Sweep failures must never break a page render.
  }
}
