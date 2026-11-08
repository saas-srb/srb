"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getAssignment, submitAssignment } from "@/lib/products/cohort-ai/assignments";
import { listEnrollmentsForStudent } from "@/lib/products/cohort-ai/enrollments";
import { recordAudit } from "@/lib/products/cohort-ai/audit";

const URL_RE = /^https?:\/\/[^\s.]+\.\S{2,}$/;

export interface SubmitResult {
  ok: boolean;
  error?: string;
}

export async function submitAssignmentAction(
  assignmentId: string,
  input: { submissionUrl: string; note: string }
): Promise<SubmitResult> {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) return { ok: false, error: "Not a student account." };

  const assignment = await getAssignment(assignmentId);
  if (!assignment) return { ok: false, error: "Assignment not found." };

  // Must be enrolled in the assignment's batch.
  const enrollments = await listEnrollmentsForStudent(user.studentId);
  if (!enrollments.some((e) => e.batchId === assignment.batchId)) {
    return { ok: false, error: "This assignment is not for your batch." };
  }

  const url = input.submissionUrl.trim();
  if (!url) return { ok: false, error: "Add a link to your submission." };
  if (!URL_RE.test(url)) return { ok: false, error: "Enter a full URL (https://…)." };

  await submitAssignment(assignmentId, user.studentId, { submissionUrl: url, note: input.note.trim() || null });
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "assignment",
    entityId: assignmentId,
    entityLabel: assignment.title,
    summary: "submission received",
  });
  revalidatePath("/cohort-ai/me/assignments");
  revalidatePath(`/cohort-ai/assignments/${assignmentId}`);
  return { ok: true };
}
