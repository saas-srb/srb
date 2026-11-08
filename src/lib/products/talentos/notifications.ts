import "server-only";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/talentos/db";
import type { CurrentHrmsUser } from "@/lib/hrms-auth";
import { hasStaffRole } from "@/lib/hrms-roles";
import { todayDateString } from "@/lib/products/talentos/time";
import { signalNew } from "@/lib/notify/signals";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { queuePush, userIdsWithRoles } from "@/lib/push/send";
import { categorizeType } from "@/lib/push/categories";

/**
 * In-app HR notifications. Two audiences:
 *  - "staff"    — broadcast to everyone with a staff role
 *  - "employee" — a single recipient (`recipientUserId`), used for portal users
 * Read state is a set of user ids that have dismissed the notification.
 */

export const NOTIFICATIONS_COLLECTION = "hrms_notifications";
const META_COLLECTION = "hrms_meta";

export type NotificationType =
  | "leave_requested"
  | "leave_decided"
  | "employee_added"
  | "payslip_published"
  | "document_uploaded"
  | "document_expiring"
  | "birthday_today"
  | "probation_ending"
  | "offer_status"
  | "payroll_ready"
  | "salary_paid"
  | "payout_failed"
  | "leave_cancelled"
  | "request_submitted"
  | "request_decided";

export interface HrmsNotification {
  _id: string;
  audience: "staff" | "employee";
  recipientUserId: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  readBy: string[];
  dedupeKey: string | null;
  createdAt: Date;
}

export interface SerializedNotification extends Omit<HrmsNotification, "createdAt" | "readBy"> {
  createdAt: string;
  read: boolean;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<HrmsNotification>(NOTIFICATIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ audience: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ recipientUserId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ dedupeKey: 1 }, { unique: true, sparse: true }).catch(() => {}),
    ]);
  }
  return collection;
}

export interface NotifyInput {
  audience: "staff" | "employee";
  recipientUserId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
}

/** Best-effort — never throws (mirrors `recordAudit`). Dedupes on `dedupeKey`. */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const collection = await getCollection();
    if (input.dedupeKey) {
      const existing = await collection.findOne({ dedupeKey: input.dedupeKey });
      if (existing) return;
    }
    const plan = await planNotification({ type: input.type, title: input.title, body: input.body, link: input.link, product: "hrms" });
    if (plan.inApp.on) await collection.insertOne({
      _id: newId(),
      audience: input.audience,
      recipientUserId: input.recipientUserId ?? null,
      type: input.type,
      title: plan.inApp.title,
      body: plan.inApp.body ?? input.body,
      link: input.link ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      readBy: [],
      dedupeKey: input.dedupeKey ?? null,
      createdAt: new Date(),
    });
    const recipients = input.recipientUserId ? [input.recipientUserId] : input.audience === "staff" ? await userIdsWithRoles(["super_admin", "hr", "manager"]) : [];
    await queuePush("staff", recipients, { category: categorizeType(input.type), title: input.title, body: input.body, url: input.link, tag: input.dedupeKey ?? undefined, event: input.type, product: "hrms" });
    if (plan.inApp.on) await signalNew("hrms", recipients, { type: input.type, title: plan.inApp.title, body: plan.inApp.body, link: input.link ?? null });
    await logBell(plan.inApp.on, { type: input.type, title: input.title, product: "hrms", recipients: recipients.length || 1, reason: plan.inApp.reason });
  } catch {
    // A duplicate-key race on dedupeKey, or any other failure — non-fatal.
  }
}

/** Sends to an employee's portal login, if they have one. */
export async function notifyEmployee(
  employeeId: string,
  input: Omit<NotifyInput, "audience" | "recipientUserId">
): Promise<void> {
  try {
    const db = await getDb();
    // Whoever the HR file is linked to, whatever their role: a Director or an HR manager has their own HR file too (leave decided, payslip
    // published …), so the lookup must not require the plain "employee" role. Deactivated / left accounts are skipped.
    const user = await db.collection("admin_users").findOne({ employeeId, status: { $nin: BLOCKED_STATUSES } }, { projection: { _id: 1 } });
    if (!user) return;
    await notify({ ...input, audience: "employee", recipientUserId: String(user._id) });
  } catch {
    // non-fatal
  }
}

function audienceFilter(user: Pick<CurrentHrmsUser, "id" | "roles">): Record<string, unknown> {
  if (hasStaffRole(user.roles)) {
    return { $or: [{ audience: "staff" }, { recipientUserId: user.id }] };
  }
  return { recipientUserId: user.id };
}

export async function listNotifications(
  user: Pick<CurrentHrmsUser, "id" | "roles">,
  opts: { page?: number; pageSize?: number; unreadOnly?: boolean } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter: Record<string, unknown> = { ...audienceFilter(user) };
  if (opts.unreadOnly) filter.readBy = { $ne: user.id };

  const [rows, total] = await Promise.all([
    collection.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  const items: SerializedNotification[] = rows.map((n) => {
    const { readBy, createdAt, ...rest } = n;
    return { ...rest, createdAt: createdAt.toISOString(), read: readBy.includes(user.id) };
  });
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function unreadCount(user: Pick<CurrentHrmsUser, "id" | "roles">): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ ...audienceFilter(user), readBy: { $ne: user.id } });
}

export async function markRead(ids: string[], userId: string): Promise<void> {
  if (ids.length === 0) return;
  const collection = await getCollection();
  await collection.updateMany({ _id: { $in: ids } }, { $addToSet: { readBy: userId } });
}

export async function markAllRead(user: Pick<CurrentHrmsUser, "id" | "roles">): Promise<void> {
  const collection = await getCollection();
  await collection.updateMany({ ...audienceFilter(user), readBy: { $ne: user.id } }, { $addToSet: { readBy: user.id } });
}

// ---------------------------------------------------------------------------
// Time-based generators — throttled to once/hour across the whole app.
// ---------------------------------------------------------------------------

interface EmployeeLite {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  status: string;
  personal: { dateOfBirth: string | null };
  professional: { probationEndDate: string | null };
}

export async function runNotificationSweep(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRunAt: Date }>(META_COLLECTION);
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Claim the slot atomically — only one caller per hour proceeds.
    const claim = await meta.findOneAndUpdate(
      { _id: "notification_sweep", lastRunAt: { $lt: hourAgo } },
      { $set: { lastRunAt: new Date() } },
      { returnDocument: "after" }
    );
    if (!claim) {
      // Either another caller has it, or the doc doesn't exist yet — create it.
      const created = await meta.updateOne(
        { _id: "notification_sweep" },
        { $setOnInsert: { lastRunAt: new Date() } },
        { upsert: true }
      );
      if (created.upsertedCount === 0) return; // someone else within the hour
    }

    const today = todayDateString();
    const mmdd = today.slice(5);
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

    const employees = await db
      .collection<EmployeeLite>("hrms_employees")
      .find({ deletedAt: null }, { projection: { employeeCode: 1, firstName: 1, lastName: 1, status: 1, "personal.dateOfBirth": 1, "professional.probationEndDate": 1 } })
      .toArray();

    for (const e of employees) {
      const name = `${e.firstName} ${e.lastName}`.trim();
      if (e.personal?.dateOfBirth && e.personal.dateOfBirth.slice(5) === mmdd) {
        await notify({
          audience: "staff",
          type: "birthday_today",
          title: `${name}'s birthday today`,
          body: `${e.employeeCode} · wish them a happy birthday.`,
          link: `/talentos/employees/${e._id}`,
          entityType: "employee",
          entityId: e._id,
          dedupeKey: `bday:${e._id}:${today}`,
        });
      }
      const probationEnd = e.professional?.probationEndDate;
      if (e.status === "probation" && probationEnd && probationEnd >= today && probationEnd <= in7) {
        await notify({
          audience: "staff",
          type: "probation_ending",
          title: `${name}'s probation ends ${probationEnd}`,
          body: `${e.employeeCode} · confirm or extend before the date.`,
          link: `/talentos/employees/${e._id}`,
          entityType: "employee",
          entityId: e._id,
          dedupeKey: `probation:${e._id}:${probationEnd}`,
        });
      }
    }

    // Document expiry — reuse the documents helper.
    const { expiringDocuments } = await import("@/lib/products/talentos/documents");
    const empName = new Map(employees.map((e) => [e._id, `${e.firstName} ${e.lastName}`.trim()]));
    for (const d of await expiringDocuments(30)) {
      await notify({
        audience: "staff",
        type: "document_expiring",
        title: `${d.title} expires ${d.expiryDate}`,
        body: `${empName.get(d.employeeId) ?? "An employee"} · ${d.category.replace(/_/g, " ")}.`,
        link: `/talentos/employees/${d.employeeId}?tab=documents`,
        entityType: "employee_document",
        entityId: d._id,
        dedupeKey: `docexp:${d._id}:${d.expiryDate}`,
      });
    }
  } catch {
    // Sweep failures must never break a page render.
  }
}
