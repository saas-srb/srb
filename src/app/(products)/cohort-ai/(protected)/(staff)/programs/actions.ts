"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageProgramsBatches } from "@/lib/tms-roles";
import { createProgram, updateProgram, deleteProgram, getProgram } from "@/lib/products/cohort-ai/programs";
import { validateProgram } from "@/lib/products/cohort-ai/validation";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";

export interface ProgramActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentTmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageProgramsBatches(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/cohort-ai/programs");
  revalidatePath("/cohort-ai");
  if (id) revalidatePath(`/cohort-ai/programs/${id}`);
}

export async function saveProgramAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ProgramActionResult> {
  const user = await requireManage();
  const v = validateProgram(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getProgram(id);
    if (!before) return { ok: false, error: "Program not found." };
    const updated = await updateProgram(id, v.data, user.id);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "program",
      entityId: id,
      entityLabel: v.data.name,
      summary: diffSummary(
        { name: before.name, status: before.status, category: before.category, fees: before.fees },
        { name: v.data.name, status: v.data.status, category: v.data.category, fees: v.data.fees },
        ["name", "status", "category", "fees"]
      ),
    });
    revalidate(id);
    return { ok: true, id: updated?._id };
  }

  const created = await createProgram(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "program",
    entityId: created._id,
    entityLabel: v.data.name,
  });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteProgramAction(id: string): Promise<ProgramActionResult> {
  const user = await requireManage();
  const before = await getProgram(id);
  const result = await deleteProgram(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete program." };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "program",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate(id);
  return { ok: true };
}
