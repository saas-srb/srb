"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { updateProgram, deleteProgram, getProgram } from "@/lib/products/cohort-ai/programs";
import { isValidProgramStatus } from "@/lib/products/cohort-ai/constants";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";

function revalidate() {
  revalidatePath("/commandos/tms/programs");
}

export async function updateProgramStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.tms.programs");
  if (!isValidProgramStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getProgram(id);
  if (!before) return { ok: false, error: "Program not found." };
  const updated = await updateProgram(id, { status }, admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "program",
    entityId: id,
    entityLabel: before.name,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: updated !== null };
}

export async function deleteProgramAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.tms.programs");
  const before = await getProgram(id);
  const result = await deleteProgram(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete program." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "program",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkUpdateProgramStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.tms.programs");
  if (!isValidProgramStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const before = await getProgram(id);
    if (!before) continue;
    const result = await updateProgram(id, { status }, admin.id);
    if (result) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "program",
        entityId: id,
        entityLabel: before.name,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteProgramsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.tms.programs");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getProgram(id);
    const result = await deleteProgram(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "program",
        entityId: id,
        entityLabel: before?.name ?? null,
      });
    } else {
      skipped.push(before?.name ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}
