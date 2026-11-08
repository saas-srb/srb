"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { updateStudent, getStudent } from "@/lib/products/cohort-ai/students";
import { isValidStudentStatus } from "@/lib/products/cohort-ai/constants";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";

/**
 * Mirrors `src/app/cohort-ai/(protected)/(staff)/students/actions.ts`'s status-change
 * path (same `recordAudit`) but gated on the admin session. TMS's student data
 * layer has no delete function anywhere in the app — only create/update — so
 * this listing doesn't add one either; that's a real gap, not an oversight to
 * paper over.
 */

function revalidate() {
  revalidatePath("/commandos/tms/students");
}

export async function updateStudentStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.tms.students");
  if (!isValidStudentStatus(status)) return { ok: false, error: "Unknown status." };

  const before = await getStudent(id);
  if (!before) return { ok: false, error: "Student not found." };
  const updated = await updateStudent(id, { status }, admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "student",
    entityId: id,
    entityLabel: before.fullName,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: updated !== null };
}

export async function bulkUpdateStudentStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.tms.students");
  if (!isValidStudentStatus(status)) return { updated: 0 };

  let updated = 0;
  for (const id of ids) {
    const before = await getStudent(id);
    if (!before) continue;
    const result = await updateStudent(id, { status }, admin.id);
    if (result) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "student",
        entityId: id,
        entityLabel: before.fullName,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}
