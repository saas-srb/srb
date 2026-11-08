"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPmsUser } from "@/lib/pms-auth";
import { canReviewTimesheets } from "@/lib/pms-roles";
import { getEntry, reviewEntry } from "@/lib/products/sprintos/timesheets";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";

export interface ReviewActionResult {
  ok: boolean;
  error?: string;
}

async function requireReviewer() {
  const user = await getCurrentPmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canReviewTimesheets(user)) throw new Error("Forbidden");
  return user;
}

export async function reviewTimesheetAction(
  entryId: string,
  decision: "approved" | "rejected",
  note: string
): Promise<ReviewActionResult> {
  const user = await requireReviewer();
  if (decision !== "approved" && decision !== "rejected") return { ok: false, error: "Invalid decision." };

  const before = await getEntry(entryId);
  if (!before) return { ok: false, error: "Entry not found." };

  const updated = await reviewEntry(entryId, decision, note.trim() || null, user.id);
  if (!updated) return { ok: false, error: "Entry is no longer awaiting review." };

  await notifyEmployees([updated.employeeId], (uid) => ({
    recipientUserId: uid,
    type: "timesheet_reviewed",
    title: `Timesheet ${decision}: ${updated.hours}h on ${updated.date}`,
    body: note.trim() || null,
    link: "/sprintos/me/timesheet",
    projectId: updated.projectId,
  }), user.id);

  revalidatePath("/sprintos/timesheets");
  revalidatePath("/sprintos/costing");
  revalidatePath("/sprintos/me/timesheet");
  return { ok: true };
}

export async function bulkReviewTimesheetsAction(
  ids: string[],
  decision: "approved" | "rejected"
): Promise<ReviewActionResult> {
  await requireReviewer();
  const clean = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === "string");
  let done = 0;
  for (const id of clean) {
    const r = await reviewTimesheetAction(id, decision, "");
    if (r.ok) done += 1;
  }
  return { ok: true, error: done === 0 ? "Nothing to review." : undefined };
}
