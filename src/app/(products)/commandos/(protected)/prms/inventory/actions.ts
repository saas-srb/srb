"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { deleteInventoryItem, getInventoryItem } from "@/lib/products/spendiq/inventory";
import { recordAudit } from "@/lib/products/spendiq/audit";

function revalidate() {
  revalidatePath("/commandos/prms/inventory");
}

export async function deleteInventoryItemAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.inventory");
  const before = await getInventoryItem(id);
  const result = await deleteInventoryItem(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete item." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "inventory_item",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkDeleteInventoryItemsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.inventory");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getInventoryItem(id);
    const result = await deleteInventoryItem(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "inventory_item",
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
