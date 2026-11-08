"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { deleteRequisition, getRequisition } from "@/lib/products/spendiq/requisitions";
import { recordAudit } from "@/lib/products/spendiq/audit";

/**
 * Requisitions go through a real multi-level approval workflow
 * (`decideRequisition`, department-manager → procurement-manager levels) that
 * depends on the deciding user's PRMS role — not something to replicate
 * generically here. This listing covers search/filter/export/delete; the
 * approve/reject decision itself stays on the native `/spendiq/requisitions/[id]`
 * page, deep-linked from "View full details".
 */

function revalidate() {
  revalidatePath("/commandos/prms/requisitions");
}

export async function deleteRequisitionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.requisitions");
  const before = await getRequisition(id);
  const result = await deleteRequisition(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete requisition." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "requisition",
    entityId: id,
    entityLabel: before?.prCode ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkDeleteRequisitionsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.requisitions");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getRequisition(id);
    const result = await deleteRequisition(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "requisition",
        entityId: id,
        entityLabel: before?.prCode ?? null,
      });
    } else {
      skipped.push(before?.prCode ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}
