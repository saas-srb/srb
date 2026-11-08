import "server-only";
import { getDb } from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/products/evaliq/db";
import { expireOverdue, type Assignment } from "@/lib/products/evaliq/assignments";
import { sweepExpiredAttempts } from "@/lib/products/evaliq/attempts";
import { releaseAfterClose } from "@/lib/products/evaliq/evaluation";
import { notifyCandidates } from "@/lib/products/evaliq/notifications";
import { getOtsSettings } from "@/lib/products/evaliq/settings";
import { recordAudit } from "@/lib/products/evaliq/audit";
import { testNames } from "@/lib/products/evaliq/tests";

/**
 * Time-driven OTS work, run by Vercel Cron (`/api/evaliq/cron`) AND — throttled
 * — after OTS / portal test page renders, so it keeps working on a
 * once-a-day cron plan:
 *   1. finalise attempts whose time ran out (TIMEOUT_AUTO_SUBMISSION);
 *   2. Assigned → Expired for missed windows, and tell the candidate;
 *   3. "test opens soon" and "deadline approaching" reminders (deduplicated);
 *   4. release "after the test closes" results.
 */
export async function runSweep(now = new Date()) {
  const db = await getDb();
  const col = db.collection<Assignment>(COLLECTIONS.assignments);
  const settings = await getOtsSettings();

  const timedOut = await sweepExpiredAttempts(now);
  const expired = await expireOverdue(now);

  // Expiry notices (once).
  const newlyExpired = await col.find({ status: "expired", expiredNotifiedAt: null, deletedAt: null }).limit(500).toArray();
  const names = await testNames(newlyExpired.map((a) => a.testId));
  if (newlyExpired.length) {
    await notifyCandidates(newlyExpired.map((a) => ({ ref: a.candidate, assignmentId: a._id, type: "ots_expired" as const, title: `Test expired: ${names.get(a.testId)?.name ?? "test"}`, body: "The window for this test closed before it was started.", dedupeKey: `ots_expired:${a._id}` })));
    await col.updateMany({ _id: { $in: newlyExpired.map((a) => a._id) } }, { $set: { expiredNotifiedAt: now } });
    for (const a of newlyExpired) await recordAudit({ actorId: "system", action: "expire", entity: "assignment", entityId: a._id, entityLabel: `${a.candidateLabel} · ${names.get(a.testId)?.name ?? ""}`, testId: a.testId, summary: "Assigned → Expired" });
  }

  // Deadline approaching.
  const horizon = new Date(now.getTime() + settings.reminderHoursBeforeDue * 3600_000);
  const dueSoon = await col.find({ status: { $in: ["assigned", "in_progress"] }, dueAt: { $gt: now, $lte: horizon }, remindedDueAt: null, deletedAt: null }).limit(500).toArray();
  const dueNames = await testNames(dueSoon.map((a) => a.testId));
  if (dueSoon.length) {
    await notifyCandidates(dueSoon.map((a) => ({ ref: a.candidate, assignmentId: a._id, type: "ots_due_soon" as const, title: `Due soon: ${dueNames.get(a.testId)?.name ?? "test"}`, body: `Complete it before ${a.dueAt!.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`, dedupeKey: `ots_due:${a._id}` })));
    await col.updateMany({ _id: { $in: dueSoon.map((a) => a._id) } }, { $set: { remindedDueAt: now } });
  }

  // Test approaching (opens within the next 24h).
  const opening = await col.find({ status: "assigned", startAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 3600_000) }, deletedAt: null }).limit(500).toArray();
  const openNames = await testNames(opening.map((a) => a.testId));
  if (opening.length)
    await notifyCandidates(opening.map((a) => ({ ref: a.candidate, assignmentId: a._id, type: "ots_starting" as const, title: `Opens soon: ${openNames.get(a.testId)?.name ?? "test"}`, body: `Available from ${a.startAt!.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.`, dedupeKey: `ots_start:${a._id}` })));

  const released = await releaseAfterClose();
  return { timedOut, expired, expiryNotices: newlyExpired.length, dueReminders: dueSoon.length, openingReminders: opening.length, released };
}

/** Runs the sweep at most once every 5 minutes across all instances (page-load trigger). */
export async function maybeSweep(): Promise<void> {
  try {
    const db = await getDb();
    const now = new Date();
    const claimed = await db
      .collection<{ _id: string; at?: Date }>(COLLECTIONS.counters)
      .findOneAndUpdate({ _id: "sweep", $or: [{ at: { $exists: false } }, { at: { $lt: new Date(now.getTime() - 5 * 60_000) } }] }, { $set: { at: now } }, { upsert: false, returnDocument: "after" });
    if (!claimed) {
      const exists = await db.collection<{ _id: string }>(COLLECTIONS.counters).findOne({ _id: "sweep" });
      if (exists) return;
      await db.collection<{ _id: string; at: Date }>(COLLECTIONS.counters).insertOne({ _id: "sweep", at: now }).catch(() => {});
    }
    await runSweep(now);
  } catch (err) {
    console.error("[ots sweep]", (err as Error)?.message);
  }
}
