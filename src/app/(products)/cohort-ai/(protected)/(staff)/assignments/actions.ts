"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import {
  createAssignment,
  updateAssignment,
  deleteAssignment,
  getAssignment,
  reviewSubmission,
} from "@/lib/products/cohort-ai/assignments";
import { getBatch } from "@/lib/products/cohort-ai/batches";
import { validateAssignment } from "@/lib/products/cohort-ai/validation";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";
import { notifyBatchStudents } from "@/lib/products/cohort-ai/notifications";

export interface AssignmentActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentTmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTraining(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/cohort-ai/assignments");
  revalidatePath("/cohort-ai/me/assignments");
  if (id) revalidatePath(`/cohort-ai/assignments/${id}`);
}

export async function saveAssignmentAction(
  input: Record<string, unknown>,
  id?: string
): Promise<AssignmentActionResult> {
  const user = await requireManage();
  const v = validateAssignment(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const batch = await getBatch(v.data.batchId);
  if (!batch) return { ok: false, fieldErrors: { batchId: "That batch no longer exists." } };

  if (id) {
    const before = await getAssignment(id);
    if (!before) return { ok: false, error: "Assignment not found." };
    const updated = await updateAssignment(id, v.data, user.id);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "assignment",
      entityId: id,
      entityLabel: v.data.title,
      summary: diffSummary(
        { title: before.title, dueDate: before.dueDate, maxMarks: before.maxMarks },
        { title: v.data.title, dueDate: v.data.dueDate, maxMarks: v.data.maxMarks },
        ["title", "dueDate", "maxMarks"]
      ),
    });
    revalidate(id);
    return { ok: true, id: updated?._id };
  }

  const created = await createAssignment(v.data, batch.programId, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "assignment",
    entityId: created._id,
    entityLabel: v.data.title,
    metadata: { batchCode: batch.batchCode },
  });
  await notifyBatchStudents(v.data.batchId, {
    type: "assignment_posted",
    title: "New assignment",
    body: `${v.data.title}${v.data.dueDate ? ` · due ${v.data.dueDate}` : ""}`,
    link: "/cohort-ai/me/assignments",
    dedupeKey: `assignment_posted:${created._id}`,
  });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteAssignmentAction(id: string): Promise<AssignmentActionResult> {
  const user = await requireManage();
  const before = await getAssignment(id);
  const ok = await deleteAssignment(id, user.id);
  if (!ok) return { ok: false, error: "Could not delete assignment." };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "assignment",
    entityId: id,
    entityLabel: before?.title ?? null,
  });
  revalidate(id);
  return { ok: true };
}

export async function reviewSubmissionAction(
  assignmentId: string,
  studentId: string,
  input: { marks: string; feedback: string; approved: boolean }
): Promise<AssignmentActionResult> {
  const user = await requireManage();
  const assignment = await getAssignment(assignmentId);
  if (!assignment) return { ok: false, error: "Assignment not found." };

  const marksNum = input.marks.trim() === "" ? null : Number(input.marks);
  if (marksNum !== null && (!Number.isFinite(marksNum) || marksNum < 0 || marksNum > assignment.maxMarks)) {
    return { ok: false, error: `Marks must be between 0 and ${assignment.maxMarks}.` };
  }

  const updated = await reviewSubmission(
    assignmentId,
    studentId,
    { marks: marksNum, feedback: input.feedback.trim() || null, approved: input.approved },
    user.id
  );
  if (!updated) return { ok: false, error: "No submission to review yet." };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "assignment",
    entityId: assignmentId,
    entityLabel: assignment.title,
    summary: input.approved ? `reviewed (${marksNum ?? "no"} marks)` : "sent back for rework",
  });
  revalidate(assignmentId);
  return { ok: true, id: assignmentId };
}
