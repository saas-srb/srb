"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { getEntry, reviewEntry, deleteEntry } from "@/lib/products/sprintos/timesheets";
import { notifyEmployees } from "@/lib/products/sprintos/notifications";

/** Mirrors `src/app/sprintos/(protected)/(staff)/timesheets/review-actions.ts`
 * (same guarded `reviewEntry` — only a "submitted" entry can be
 * approved/rejected — and the same employee notification) but gated on the
 * admin session. */

function revalidate() {
  revalidatePath("/commandos/pms/timesheets");
}

export async function reviewTimesheetAction(
  entryId: string,
  decision: "approved" | "rejected",
  note: string
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.pms.timesheets");
  const updated = await reviewEntry(entryId, decision, note.trim() || null, admin.id);
  if (!updated) return { ok: false, error: "Entry is no longer awaiting review." };

  await notifyEmployees(
    [updated.employeeId],
    (uid) => ({
      recipientUserId: uid,
      type: "timesheet_reviewed",
      title: `Timesheet ${decision}: ${updated.hours}h on ${updated.date}`,
      body: note.trim() || null,
      link: "/sprintos/me/timesheet",
      projectId: updated.projectId,
    }),
    admin.id
  );

  revalidate();
  return { ok: true };
}

export async function bulkReviewTimesheetsAction(
  ids: string[],
  decision: "approved" | "rejected"
): Promise<{ reviewed: number; skipped: number }> {
  await requireWorkspaceAction("manage.pms.timesheets");
  let reviewed = 0;
  for (const id of ids) {
    const result = await reviewTimesheetAction(id, decision, "");
    if (result.ok) reviewed += 1;
  }
  return { reviewed, skipped: ids.length - reviewed };
}

export async function deleteTimesheetEntryAction(id: string): Promise<{ ok: boolean }> {
  const admin = await requireWorkspaceAction("manage.pms.timesheets");
  const result = await deleteEntry(id, admin.id);
  revalidate();
  return result;
}

export async function bulkDeleteTimesheetEntriesAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.pms.timesheets");
  let deleted = 0;
  for (const id of ids) {
    const before = await getEntry(id);
    if (!before) continue;
    const result = await deleteEntry(id, admin.id);
    if (result.ok) deleted += 1;
  }
  revalidate();
  return { deleted };
}
