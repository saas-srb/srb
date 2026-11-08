"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { changeAssetStatus, deleteAsset, getAsset } from "@/lib/products/spendiq/assets";
import { isValidAssetStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

function revalidate() {
  revalidatePath("/commandos/prms/assets");
}

export async function updateAssetStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.assets");
  if (!isValidAssetStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getAsset(id);
  if (!before) return { ok: false, error: "Asset not found." };
  const result = await changeAssetStatus(id, status, "Changed by super admin", admin.id);
  if (!result.ok) return { ok: false, error: result.reason };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "asset",
    entityId: id,
    entityLabel: before.name,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: true };
}

export async function deleteAssetAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.assets");
  const before = await getAsset(id);
  const result = await deleteAsset(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete asset." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "asset",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkUpdateAssetStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.prms.assets");
  if (!isValidAssetStatus(status)) return { updated: 0 };
  let updated = 0;
  for (const id of ids) {
    const before = await getAsset(id);
    if (!before) continue;
    const result = await changeAssetStatus(id, status, "Changed by super admin", admin.id);
    if (result.ok) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "asset",
        entityId: id,
        entityLabel: before.name,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteAssetsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.assets");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getAsset(id);
    const result = await deleteAsset(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "asset",
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
