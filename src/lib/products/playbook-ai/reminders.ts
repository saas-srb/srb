import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS, todayIso, addDaysIso, notDeleted } from "@/lib/products/playbook-ai/db";
import { daysBetween, isExpiringSoon, isReviewOverdue } from "@/lib/products/playbook-ai/lifecycle";
import { getSettings } from "@/lib/products/playbook-ai/settings";
import { sweepStatuses } from "@/lib/products/playbook-ai/sops";
import { recordAudit } from "@/lib/products/playbook-ai/audit";
import { notifySopUsers } from "@/lib/products/playbook-ai/notifications";
import type { AssignmentDoc, SopDoc } from "@/lib/products/playbook-ai/types";

/**
 * Daily housekeeping (called by `/api/playbook-ai/cron`, and safe to call manually):
 *  1. persist date-driven status changes (published → active, → expired)
 *  2. remind assignees whose acknowledgement is due soon or overdue
 *  3. remind SOP owners about upcoming / overdue reviews and expiry
 * Every reminder is throttled (per assignment via `lastReminderAt`, per SOP
 * via a dedupe key), so running it twice in a day sends nothing extra.
 */
export async function runSopReminders(): Promise<{ statusChanges: number; assigneeReminders: number; ownerReminders: number }> {
  const statusChanges = await sweepStatuses(true);
  const settings = await getSettings();
  const today = todayIso();
  const db = await getDb();

  // --- assignees ---------------------------------------------------------
  const assignments = db.collection<AssignmentDoc>(COLLECTIONS.assignments);
  const sops = db.collection<SopDoc>(COLLECTIONS.sops);
  const soonCutoff = addDaysIso(today, 3);
  const repeatBefore = new Date(Date.now() - settings.reminderRepeatDays * 86_400_000);
  const due = await assignments
    .find({ acknowledgedAt: null, dueDate: { $ne: null, $lte: soonCutoff }, $or: [{ lastReminderAt: null }, { lastReminderAt: { $lt: repeatBefore } }] })
    .limit(2000)
    .toArray();
  const liveIds = new Set(
    (await sops.find({ _id: { $in: Array.from(new Set(due.map((d) => d.sopId))) }, status: { $in: ["published", "active"] }, ...notDeleted }, { projection: { _id: 1 } }).toArray()).map((s) => s._id)
  );
  let assigneeReminders = 0;
  for (const a of due) {
    if (!liveIds.has(a.sopId)) continue;
    const overdue = (a.dueDate as string) < today;
    await notifySopUsers([a.userId], {
      type: overdue ? "sop_overdue" : "sop_reminder",
      title: overdue ? `Overdue: acknowledge ${a.sopCode}` : `Due soon: acknowledge ${a.sopCode}`,
      body: overdue ? `This was due ${a.dueDate} (${daysBetween(a.dueDate as string, today)} day(s) ago).` : `Please read and acknowledge by ${a.dueDate}.`,
      link: `/playbook-ai/library/${a.sopId}`,
      dedupeKey: `sop-remind:${a._id}:${today}`,
    });
    await assignments.updateOne({ _id: a._id }, { $set: { lastReminderAt: new Date() } });
    assigneeReminders += 1;
  }

  // --- owners ------------------------------------------------------------
  const live = await sops
    .find({ status: { $in: ["published", "active", "expired"] }, ...notDeleted }, { projection: { "live.sections": 0, "draft.sections": 0 } })
    .toArray();
  let ownerReminders = 0;
  for (const s of live) {
    const items: { type: "sop_review_due" | "sop_expiring"; title: string; body: string; key: string }[] = [];
    if (isReviewOverdue(s, today)) {
      items.push({ type: "sop_review_due", title: `Review overdue: ${s.code}`, body: `"${s.title}" was due for review on ${s.reviewDate}. Review it and update the review date (or publish a new version).`, key: `sop-review-overdue:${s._id}:${s.reviewDate}:${today.slice(0, 7)}` });
    } else if (s.reviewDate && s.status !== "expired" && daysBetween(today, s.reviewDate) >= 0 && daysBetween(today, s.reviewDate) <= settings.expiringSoonDays) {
      items.push({ type: "sop_review_due", title: `Review coming up: ${s.code}`, body: `"${s.title}" is due for review on ${s.reviewDate}.`, key: `sop-review-soon:${s._id}:${s.reviewDate}` });
    }
    if (isExpiringSoon(s, today, settings.expiringSoonDays)) {
      items.push({ type: "sop_expiring", title: `Expiring soon: ${s.code}`, body: `"${s.title}" expires on ${s.expiryDate}.`, key: `sop-expiring:${s._id}:${s.expiryDate}` });
    }
    for (const it of items) {
      await notifySopUsers([s.ownerId], { type: it.type, title: it.title, body: it.body, link: `/playbook-ai/library/${s._id}`, dedupeKey: it.key });
      ownerReminders += 1;
    }
  }

  if (assigneeReminders || ownerReminders || statusChanges) {
    await recordAudit({
      actorId: "system",
      actorEmail: "system",
      action: "reminder",
      entity: "settings",
      entityId: "reminders",
      summary: `Daily run: ${statusChanges} status change(s), ${assigneeReminders} assignee reminder(s), ${ownerReminders} owner notice(s)`,
    });
  }
  return { statusChanges, assigneeReminders, ownerReminders };
}
