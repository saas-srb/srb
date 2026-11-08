"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { getStudent, updateStudent } from "@/lib/products/cohort-ai/students";
import { validateStudent } from "@/lib/products/cohort-ai/validation";
import { recordAudit } from "@/lib/products/cohort-ai/audit";

export interface ProfileActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Student self-service profile update. Restricted to the signed-in student's
 * own record; lifecycle `status` is never touched here (staff-only).
 */
export async function updateOwnProfileAction(input: Record<string, unknown>): Promise<ProfileActionResult> {
  const user = await getCurrentTmsUser();
  if (!user?.studentId) return { ok: false, error: "Not a student account." };

  const current = await getStudent(user.studentId);
  if (!current) return { ok: false, error: "Student record not found." };

  const v = validateStudent({ ...input, status: current.status });
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  // Keep the staff-managed fields as they are.
  await updateStudent(
    user.studentId,
    {
      fullName: v.data.fullName,
      email: v.data.email,
      mobile: v.data.mobile,
      address: v.data.address,
      education: v.data.education,
      guardian: v.data.guardian,
      links: v.data.links,
    },
    user.id
  );
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "student",
    entityId: user.studentId,
    entityLabel: v.data.fullName,
    summary: "profile updated by student",
  });
  revalidatePath("/cohort-ai/me/profile");
  revalidatePath("/cohort-ai/me");
  return { ok: true };
}
