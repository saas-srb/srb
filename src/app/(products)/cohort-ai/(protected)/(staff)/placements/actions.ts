"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageTraining } from "@/lib/tms-roles";
import { createPlacement, updatePlacement, deletePlacement, getPlacement } from "@/lib/products/cohort-ai/placements";
import { getStudent } from "@/lib/products/cohort-ai/students";
import { validatePlacement } from "@/lib/products/cohort-ai/validation";
import { recordAudit } from "@/lib/products/cohort-ai/audit";

export interface PlacementActionResult {
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

function revalidate() {
  revalidatePath("/cohort-ai/placements");
  revalidatePath("/cohort-ai");
}

export async function savePlacementAction(input: Record<string, unknown>, id?: string): Promise<PlacementActionResult> {
  const user = await requireManage();
  const v = validatePlacement(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const student = await getStudent(v.data.studentId);
  if (!student) return { ok: false, fieldErrors: { studentId: "Student not found." } };

  if (id) {
    const before = await getPlacement(id);
    if (!before) return { ok: false, error: "Placement not found." };
    await updatePlacement(id, v.data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "placement", entityId: id, entityLabel: `${student.fullName} @ ${v.data.company}` });
    revalidate();
    return { ok: true, id };
  }

  const rec = await createPlacement(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "placement",
    entityId: rec._id,
    entityLabel: `${student.fullName} @ ${v.data.company}`,
    summary: `${v.data.role}${v.data.packageLpa ? ` · ${v.data.packageLpa} LPA` : ""}`,
  });
  revalidate();
  return { ok: true, id: rec._id };
}

export async function deletePlacementAction(id: string): Promise<PlacementActionResult> {
  const user = await requireManage();
  const ok = await deletePlacement(id, user.id);
  if (!ok) return { ok: false, error: "Could not delete." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "placement", entityId: id, entityLabel: null });
  revalidate();
  return { ok: true };
}
