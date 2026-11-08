"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { setPurchaseOrderStatus, deletePurchaseOrder, getPurchaseOrder } from "@/lib/products/spendiq/purchase-orders";
import { isValidPoStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

function revalidate() {
  revalidatePath("/commandos/prms/purchase-orders");
}

export async function updatePoStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.purchase-orders");
  if (!isValidPoStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getPurchaseOrder(id);
  if (!before) return { ok: false, error: "Purchase order not found." };
  const result = await setPurchaseOrderStatus(id, status, admin.id);
  if (result.ok) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "status_change",
      entity: "purchase_order",
      entityId: id,
      entityLabel: before.poNumber,
      summary: diffSummary({ status: before.status }, { status }, ["status"]),
    });
  }
  revalidate();
  return result;
}

export async function deletePoAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.purchase-orders");
  const before = await getPurchaseOrder(id);
  const result = await deletePurchaseOrder(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete purchase order." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "purchase_order",
    entityId: id,
    entityLabel: before?.poNumber ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkUpdatePoStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.prms.purchase-orders");
  if (!isValidPoStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const before = await getPurchaseOrder(id);
    if (!before) continue;
    const result = await setPurchaseOrderStatus(id, status, admin.id);
    if (result.ok) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "purchase_order",
        entityId: id,
        entityLabel: before.poNumber,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeletePosAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.purchase-orders");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getPurchaseOrder(id);
    const result = await deletePurchaseOrder(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "purchase_order",
        entityId: id,
        entityLabel: before?.poNumber ?? null,
      });
    } else {
      skipped.push(before?.poNumber ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}
