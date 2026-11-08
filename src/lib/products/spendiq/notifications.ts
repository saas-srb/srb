import "server-only";
import { BLOCKED_STATUSES } from "@/lib/security/account-status";
import { signalNew } from "@/lib/notify/signals";
import { logBell, planNotification } from "@/lib/notify/center/store";
import { queuePush } from "@/lib/push/send";
import { categorizeType } from "@/lib/push/categories";
import { getDb } from "@/lib/mongodb";
import { newId } from "@/lib/products/spendiq/db";

/**
 * Per-recipient PRMS notifications. `recipientUserId` is an `admin_users` `_id`
 * (string) — staff product users and employee portal logins alike. Mirrors
 * `src/lib/cohort-ai/notifications.ts`.
 */

export const NOTIFICATIONS_COLLECTION = "prms_notifications";
const META_COLLECTION = "prms_meta";

export type NotificationAudience = "staff" | "employee";

export interface PrmsNotification {
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
  const collection = db.collection<PrmsNotification>(NOTIFICATIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ recipientUserId: 1, createdAt: -1 }).catch(() => {}),
      collection.createIndex({ recipientUserId: 1, read: 1 }).catch(() => {}),
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
    const plan = await planNotification({ type: input.type, title: input.title, body: input.body, link: input.link, product: "prms" });
    if (plan.inApp.on) await collection.insertOne({
      _id: newId(),
      recipientUserId: input.recipientUserId,
      audience: input.audience,
      type: input.type,
      title: plan.inApp.title,
      body: plan.inApp.body,
      link: input.link ?? null,
      read: false,
      ...(input.dedupeKey ? { dedupeKey: input.dedupeKey } : {}),
      createdAt: new Date(),
    } as PrmsNotification);
    await queuePush("staff", [input.recipientUserId], { category: categorizeType(input.type), title: input.title, body: input.body, url: input.link, tag: input.dedupeKey ?? undefined, event: input.type, product: "prms" });
    if (plan.inApp.on) await signalNew("prms", [input.recipientUserId], { type: input.type, title: plan.inApp.title, body: plan.inApp.body, link: input.link ?? null });
    await logBell(plan.inApp.on, { type: input.type, title: input.title, product: "prms", reason: plan.inApp.reason });
  } catch {
    // dup dedupeKey or transient error — ignore.
  }
}

/** Tell the person whose HR file is `employeeId` (whatever their role), if they have a login. `exceptUserId` is skipped. */
export async function notifyEmployeeLogin(employeeId: string, n: Omit<NotifyInput, "recipientUserId" | "audience">, exceptUserId?: string | null): Promise<void> {
  try {
    if (!employeeId) return;
    const user = await (await getDb()).collection<{ _id: unknown }>("admin_users").findOne({ employeeId, status: { $nin: BLOCKED_STATUSES } }, { projection: { _id: 1 } });
    if (!user || String(user._id) === exceptUserId) return;
    await notify({ ...n, recipientUserId: String(user._id), audience: "employee" });
  } catch {
    /* never breaks the action */
  }
}

/** Notify all PRMS staff, optionally narrowed to specific roles. */
export async function notifyStaff(
  n: Omit<NotifyInput, "recipientUserId" | "audience">,
  roles: string[] = ["super_admin", "prms_admin", "procurement_manager", "finance"]
): Promise<void> {
  try {
    const db = await getDb();
    const staff = await db
      .collection<{ _id: unknown }>("admin_users")
      .find({ roles: { $in: roles }, status: { $nin: BLOCKED_STATUSES } })
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

export async function listNotifications(recipientUserId: string, limit = 20): Promise<PrmsNotification[]> {
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
// Phase 1 has no time-based rules yet; renewal reminders (contracts / SaaS /
// infrastructure), invoice overdue alerts, low-stock alerts and recurring
// expense generation are added in phases 5 / 6 / 4 / 3 respectively.
// ---------------------------------------------------------------------------

export async function runPrmsSweep(): Promise<void> {
  try {
    const db = await getDb();
    const meta = db.collection<{ _id: string; lastRun: Date }>(META_COLLECTION);
    const now = new Date();
    const claim = await meta.findOneAndUpdate(
      { _id: "notification_sweep", lastRun: { $lt: new Date(now.getTime() - 60 * 60 * 1000) } },
      { $set: { lastRun: now } },
      { upsert: false, returnDocument: "after" }
    );
    if (!claim) {
      const existing = await meta.findOne({ _id: "notification_sweep" });
      if (existing) return; // someone else claimed within the hour
      await meta.updateOne({ _id: "notification_sweep" }, { $setOnInsert: { lastRun: now } }, { upsert: true });
    }

    await runSweepJobs();
  } catch {
    // Sweep failures must never break a page render.
  }
}

async function runSweepJobs(): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Phase 3 — generate due recurring expenses.
  try {
    const { generateDueRecurringExpenses } = await import("@/lib/products/spendiq/expenses");
    const n = await generateDueRecurringExpenses();
    if (n > 0) {
      await notifyStaff(
        {
          type: "recurring_expenses_generated",
          title: `${n} recurring expense${n === 1 ? "" : "s"} generated`,
          body: "Awaiting approval in Expense Management.",
          link: "/spendiq/expenses?approvalStatus=pending",
          dedupeKey: `recurring_expenses:${today}`,
        },
        ["super_admin", "prms_admin", "procurement_manager", "finance"]
      );
    }
  } catch {
    /* ignore */
  }

  // Phase 5 — renewal reminders (infrastructure / SaaS / third-party / contracts).
  try {
    const db = await getDb();
    const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    for (const col of ["prms_infrastructure", "prms_software_subscriptions", "prms_third_party_services", "prms_contracts"]) {
      const rows = await db
        .collection<{ _id: string; name?: string; serviceName?: string; provider?: string; renewalDate?: string; endDate?: string }>(col)
        .find({ deletedAt: null, status: { $in: ["active", "expiring"] }, $or: [{ renewalDate: { $lte: soon, $gte: today } }, { endDate: { $lte: soon, $gte: today } }] })
        .limit(50)
        .toArray()
        .catch(() => []);
      for (const r of rows) {
        await notifyStaff(
          {
            type: "resource_renewal",
            title: `Renewal due: ${r.name ?? r.serviceName ?? r.provider ?? "resource"}`,
            body: `Renews on ${r.renewalDate ?? r.endDate}`,
            link: `/spendiq/${col.replace("prms_", "").replace(/_/g, "-")}`,
            dedupeKey: `renewal:${col}:${r._id}:${r.renewalDate ?? r.endDate}`,
          },
          ["super_admin", "prms_admin", "procurement_manager", "finance"]
        );
      }
    }
  } catch {
    /* ignore */
  }

  // Phase 4 — low-stock alerts.
  try {
    const db = await getDb();
    const low = await db
      .collection<{ _id: string; name?: string; currentStock?: number; minStock?: number }>("prms_inventory_items")
      .find({ deletedAt: null, $expr: { $lte: ["$currentStock", "$minStock"] } })
      .limit(50)
      .toArray()
      .catch(() => []);
    if (low.length > 0) {
      await notifyStaff(
        {
          type: "low_stock",
          title: `${low.length} inventory item${low.length === 1 ? "" : "s"} at or below minimum stock`,
          body: low.slice(0, 5).map((i) => i.name).filter(Boolean).join(", "),
          link: "/spendiq/inventory",
          dedupeKey: `low_stock:${today}`,
        },
        ["super_admin", "prms_admin", "procurement_manager"]
      );
    }
  } catch {
    /* ignore */
  }

  // Phase 4 — refresh asset book values.
  try {
    const { refreshAssetValuations } = await import("@/lib/products/spendiq/assets");
    await refreshAssetValuations();
  } catch {
    /* ignore */
  }

  // Phase 7 — refresh budget consumption + overspend alerts.
  try {
    const { refreshBudgetConsumption } = await import("@/lib/products/spendiq/budgets");
    await refreshBudgetConsumption();
    const db = await getDb();
    const over = await db
      .collection<{ _id: string; name?: string; allocatedAmount?: number; consumedAmount?: number }>("prms_budgets")
      .find({ deletedAt: null, $expr: { $gt: ["$consumedAmount", "$allocatedAmount"] }, periodEnd: { $gte: new Date() } })
      .limit(50)
      .toArray()
      .catch(() => []);
    for (const b of over) {
      await notifyStaff(
        {
          type: "budget_overspent",
          title: `Budget overspent: ${b.name ?? "budget"}`,
          body: `Consumed ${Math.round(b.consumedAmount ?? 0).toLocaleString("en-IN")} of ${Math.round(b.allocatedAmount ?? 0).toLocaleString("en-IN")}`,
          link: "/spendiq/budgets",
          dedupeKey: `budget_overspent:${b._id}:${today.slice(0, 7)}`,
        },
        ["super_admin", "prms_admin", "finance"]
      );
    }
  } catch {
    /* ignore */
  }

  // Phase 6 — mark overdue invoices + alert.
  try {
    const db = await getDb();
    const invoices = db.collection<{ _id: string; invoiceNumber?: string; dueDate?: string; status?: string }>("prms_invoices");
    await invoices
      .updateMany(
        { deletedAt: null, status: { $in: ["pending", "approved", "partially_paid"] }, dueDate: { $lt: today } },
        { $set: { status: "overdue", updatedAt: new Date() } }
      )
      .catch(() => {});
    const overdue = await invoices.countDocuments({ deletedAt: null, status: "overdue" }).catch(() => 0);
    if (overdue > 0) {
      await notifyStaff(
        {
          type: "invoices_overdue",
          title: `${overdue} invoice${overdue === 1 ? " is" : "s are"} overdue`,
          body: "Review Accounts Payable.",
          link: "/spendiq/invoices?status=overdue",
          dedupeKey: `invoices_overdue:${today}`,
        },
        ["super_admin", "prms_admin", "finance"]
      );
    }
  } catch {
    /* ignore */
  }
}
