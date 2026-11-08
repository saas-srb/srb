"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { updateBatch, deleteBatch, getBatch } from "@/lib/products/cohort-ai/batches";
import { isValidBatchStatus } from "@/lib/products/cohort-ai/constants";
import { recordAudit, diffSummary } from "@/lib/products/cohort-ai/audit";

function revalidate() {
  revalidatePath("/commandos/tms/batches");
}

export async function updateBatchStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.tms.batches");
  if (!isValidBatchStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getBatch(id);
  if (!before) return { ok: false, error: "Batch not found." };
  const updated = await updateBatch(id, { status }, admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "batch",
    entityId: id,
    entityLabel: before.name,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: updated !== null };
}

export async function deleteBatchAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.tms.batches");
  const before = await getBatch(id);
  const result = await deleteBatch(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete batch." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "batch",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkUpdateBatchStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.tms.batches");
  if (!isValidBatchStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const before = await getBatch(id);
    if (!before) continue;
    const result = await updateBatch(id, { status }, admin.id);
    if (result) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "batch",
        entityId: id,
        entityLabel: before.name,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteBatchesAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.tms.batches");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getBatch(id);
    const result = await deleteBatch(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "batch",
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
