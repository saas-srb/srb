import "server-only";
import { signalNew } from "@/lib/notify/signals";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { queuePush } from "@/lib/push/send";
import { categorizeType } from "@/lib/push/categories";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/sprintos/db";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";
import { MILESTONES_COLLECTION } from "@/lib/products/sprintos/milestones";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";

/**
 * PMS internal notifications. One row per recipient (a PMS login in
 * `admin_users`). Mirrors the spirit of `src/lib/talentos/notifications.ts` but
 * simpler — no audience fan-out, each row targets one `recipientUserId`.
 */

export const NOTIFICATIONS_COLLECTION = "pms_notifications";
const META_COLLECTION = "pms_meta";

export type PmsNotificationType =
  | "task_assigned"
  | "task_completed"
  | "deadline_approaching"
  | "milestone_completed"
  | "project_status_changed"
  | "comment_added"
  | "timesheet_submitted"
  | "timesheet_reviewed"
  | "added_to_project";

export interface PmsNotification {
  _id: string;
  recipientUserId: string;
  type: PmsNotificationType;
  title: string;
  body: string | null;
  link: string | null;
  projectId: string | null;
  read: boolean;
  dedupeKey: string | null;
  createdAt: Date;
}

export interface SerializedNotification extends Omit<PmsNotification, "createdAt"> {
  createdAt: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<PmsNotification>(NOTIFICATIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ recipientUserId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ recipientUserId: 1, read: 1 }).catch(() => {}),
      collection.createIndex({ dedupeKey: 1 }, { sparse: true }).catch(() => {}),
    ]);
  }
  return collection;
}

/** Resolves `hrms_employees` ids to the PMS login (`admin_users`) ids that carry them. */
async function loginIdsForEmployees(employeeIds: string[]): Promise<Map<string, string>> {
  if (employeeIds.length === 0) return new Map();
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; employeeId?: string | null }>("admin_users")
    .find({ employeeId: { $in: employeeIds } }, { projection: { employeeId: 1 } })
    .toArray();
  return new Map(users.filter((u) => u.employeeId).map((u) => [u.employeeId as string, u._id.toString()]));
}

export interface NotifyInput {
  recipientUserId: string;
  type: PmsNotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  projectId?: string | null;
  dedupeKey?: string | null;
}

export async function notify(input: NotifyInput): Promise<void> {
  try {
    const collection = await getCollection();
    if (input.dedupeKey) {
      const existing = await collection.findOne({ recipientUserId: input.recipientUserId, dedupeKey: input.dedupeKey });
      if (existing) return;
    }
    const plan = await planNotification({ type: input.type, title: input.title, body: input.body, link: input.link, product: "pms" });
    if (plan.inApp.on) await collection.insertOne({
      _id: newId(),
      recipientUserId: input.recipientUserId,
      type: input.type,
      title: plan.inApp.title,
      body: plan.inApp.body,
      link: input.link ?? null,
      projectId: input.projectId ?? null,
      read: false,
      dedupeKey: input.dedupeKey ?? null,
      createdAt: new Date(),
    });
    await queuePush("staff", [input.recipientUserId], { category: categorizeType(input.type), title: input.title, body: input.body, url: input.link, tag: input.dedupeKey ?? undefined, event: input.type, product: "pms" });
    if (plan.inApp.on) await signalNew("pms", [input.recipientUserId], { type: input.type, title: plan.inApp.title, body: plan.inApp.body, link: input.link ?? null });
    await logBell(plan.inApp.on, { type: input.type, title: input.title, product: "pms", reason: plan.inApp.reason });
  } catch {
    // Notifications must never break the primary mutation.
  }
}

/** Notify a set of employees by resolving their PMS logins. `exceptUserId` is skipped. */
export async function notifyEmployees(
  employeeIds: string[],
  build: (userId: string) => NotifyInput,
  exceptUserId?: string
): Promise<void> {
  const clean = Array.from(new Set(employeeIds.filter(Boolean)));
  const map = await loginIdsForEmployees(clean);
  await Promise.all(
    Array.from(map.values())
      .filter((uid) => uid !== exceptUserId)
      .map((uid) => notify(build(uid)))
  );
}

export async function listNotifications(userId: string, limit = 12): Promise<PmsNotification[]> {
  const collection = await getCollection();
  return collection.find({ recipientUserId: userId }).sort({ createdAt: -1 }).limit(limit).toArray();
}

export async function unreadCount(userId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ recipientUserId: userId, read: false });
}

export async function markRead(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  const collection = await getCollection();
  await collection.updateMany({ _id: { $in: ids }, recipientUserId: userId }, { $set: { read: true } });
}

export async function markAllRead(userId: string): Promise<void> {
  const collection = await getCollection();
  await collection.updateMany({ recipientUserId: userId, read: false }, { $set: { read: true } });
}

export function serializeNotification(n: PmsNotification): SerializedNotification {
  return { ...n, createdAt: n.createdAt.toISOString() };
}

/**
 * Once-an-hour sweep: raises `deadline_approaching` for tasks + milestones due
 * within 3 days, to their assignee (tasks) or the project manager (milestones).
 * Atomic claim on `pms_meta.deadline_sweep` so concurrent requests don't dup.
 */
export async function runDeadlineSweep(): Promise<void> {
  const db = await getDb();
  const meta = db.collection<{ _id: string; lastRunAt: Date }>(META_COLLECTION);
  const oneHourAgo = new Date(Date.now() - 3600_000);
  try {
    // Atomic once/hour claim: matches only a stale (or absent, via upsert) row.
    // A concurrent recent row makes upsert throw a duplicate-key error → skip.
    const res = await meta.updateOne(
      { _id: "deadline_sweep", lastRunAt: { $lt: oneHourAgo } },
      { $set: { lastRunAt: new Date() } },
      { upsert: true }
    );
    if (res.matchedCount === 0 && res.upsertedCount === 0) return;
  } catch {
    return; // duplicate key → another request holds the claim / ran recently
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const in3 = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    const tasks = db.collection(TASKS_COLLECTION);
    const milestones = db.collection(MILESTONES_COLLECTION);
    const projects = db.collection<{ _id: string; name: string; projectManagerId: string | null }>(PROJECTS_COLLECTION);

    const [dueTasks, dueMilestones] = await Promise.all([
      tasks
        .find(
          { deletedAt: null, status: { $ne: "done" }, assigneeId: { $ne: null }, dueDate: { $gte: today, $lte: in3 } },
          { projection: { title: 1, dueDate: 1, projectId: 1, assigneeId: 1, taskCode: 1 } }
        )
        .toArray(),
      milestones
        .find(
          { deletedAt: null, status: { $ne: "completed" }, dueDate: { $gte: today, $lte: in3 } },
          { projection: { name: 1, dueDate: 1, projectId: 1 } }
        )
        .toArray(),
    ]);

    const projIds = Array.from(
      new Set([...dueTasks.map((t) => String(t.projectId)), ...dueMilestones.map((m) => String(m.projectId))])
    );
    const projDocs = projIds.length ? await projects.find({ _id: { $in: projIds } }).toArray() : [];
    const projById = new Map(projDocs.map((p) => [p._id, p]));

    for (const t of dueTasks) {
      await notifyEmployees([String(t.assigneeId)], (uid) => ({
        recipientUserId: uid,
        type: "deadline_approaching",
        title: `Task due soon: ${t.title}`,
        body: `${projById.get(String(t.projectId))?.name ?? "Project"} · due ${t.dueDate}`,
        link: `/sprintos/projects/${t.projectId}/tasks/${t._id}`,
        projectId: String(t.projectId),
        dedupeKey: `deadline:task:${t._id}:${t.dueDate}`,
      }));
    }
    for (const m of dueMilestones) {
      const pm = projById.get(String(m.projectId))?.projectManagerId;
      if (!pm) continue;
      await notifyEmployees([pm], (uid) => ({
        recipientUserId: uid,
        type: "deadline_approaching",
        title: `Milestone due soon: ${m.name}`,
        body: `${projById.get(String(m.projectId))?.name ?? "Project"} · due ${m.dueDate}`,
        link: `/sprintos/projects/${m.projectId}`,
        projectId: String(m.projectId),
        dedupeKey: `deadline:milestone:${m._id}:${m.dueDate}`,
      }));
    }
  } catch {
    // best-effort
  }
}
