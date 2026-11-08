"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManageProgramsBatches } from "@/lib/tms-roles";
import { createBatch, updateBatch, deleteBatch, getBatch } from "@/lib/products/cohort-ai/batches";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { validateBatch } from "@/lib/products/cohort-ai/validation";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";
import { writeBlockReason } from "@/lib/platform/billing/enforce";

export interface BatchActionResult {
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

function revalidate(id?: string, programId?: string) {
  revalidatePath("/cohort-ai/batches");
  revalidatePath("/cohort-ai/batches/calendar");
  revalidatePath("/cohort-ai");
  if (id) revalidatePath(`/cohort-ai/batches/${id}`);
  if (programId) revalidatePath(`/cohort-ai/programs/${programId}`);
}

export async function saveBatchAction(
  input: Record<string, unknown>,
  id?: string
): Promise<BatchActionResult> {
  const user = await requireManage();
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };
  const v = validateBatch(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const program = await getProgram(v.data.programId);
  if (!program) return { ok: false, fieldErrors: { programId: "That program no longer exists." } };

  if (id) {
    const before = await getBatch(id);
    if (!before) return { ok: false, error: "Batch not found." };
    const updated = await updateBatch(id, v.data, user.id);
    await recordAudit({
      actorId: user.id,
      actorEmail: user.email,
      action: "update",
      entity: "batch",
      entityId: id,
      entityLabel: v.data.name,
      summary: diffSummary(
        { name: before.name, status: before.status, capacity: before.capacity, mentorId: before.mentorId },
        { name: v.data.name, status: v.data.status, capacity: v.data.capacity, mentorId: v.data.mentorId },
        ["name", "status", "capacity", "mentorId"]
      ),
    });
    revalidate(id, v.data.programId);
    return { ok: true, id: updated?._id };
  }

  const created = await createBatch(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "batch",
    entityId: created._id,
    entityLabel: v.data.name,
    metadata: { programCode: program.programCode },
  });
  revalidate(created._id, v.data.programId);
  return { ok: true, id: created._id };
}

export async function deleteBatchAction(id: string): Promise<BatchActionResult> {
  const user = await requireManage();
  const before = await getBatch(id);
  const result = await deleteBatch(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete batch." };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "delete",
    entity: "batch",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate(id, before?.programId);
  return { ok: true };
}
