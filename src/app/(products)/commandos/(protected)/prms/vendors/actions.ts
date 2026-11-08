"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { deleteVendor, getVendor, updateVendor, vendorPurchaseHistory } from "@/lib/products/spendiq/vendors";
import { isValidVendorStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary, listAudit, serializeAuditLog, type SerializedAuditLog } from "@/lib/products/spendiq/audit";

/** Mirrors `src/app/spendiq/(protected)/(staff)/vendors/actions.ts` (same
 * `recordAudit` trail, same guarded soft-delete) but gated on the admin
 * session. Full vendor editing (bank details, GSTIN, payment terms, …) stays
 * on the existing `/spendiq/vendors/[id]` page — this listing covers status,
 * delete, and read-only purchase history / audit trail. */

function revalidate() {
  revalidatePath("/commandos/prms/vendors");
}

export async function updateVendorStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.vendors");
  if (!isValidVendorStatus(status)) return { ok: false, error: "Unknown status." };

  const before = await getVendor(id);
  if (!before) return { ok: false, error: "Vendor not found." };
  const updated = await updateVendor(id, { status }, admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "vendor",
    entityId: id,
    entityLabel: before.companyName,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: updated !== null };
}

export async function deleteVendorAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.vendors");
  const before = await getVendor(id);
  const result = await deleteVendor(id, admin.id);
  if (!result.ok) return { ok: false, error: result.reason ?? "Could not delete vendor." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "vendor",
    entityId: id,
    entityLabel: before?.companyName ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkUpdateVendorStatusAction(ids: string[], status: string): Promise<{ updated: number }> {
  const admin = await requireWorkspaceAction("manage.prms.vendors");
  if (!isValidVendorStatus(status)) return { updated: 0 };

  let updated = 0;
  for (const id of ids) {
    const before = await getVendor(id);
    if (!before) continue;
    const result = await updateVendor(id, { status }, admin.id);
    if (result) {
      updated += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "status_change",
        entity: "vendor",
        entityId: id,
        entityLabel: before.companyName,
        summary: diffSummary({ status: before.status }, { status }, ["status"]),
      });
    }
  }
  revalidate();
  return { updated };
}

export async function bulkDeleteVendorsAction(ids: string[]): Promise<{ deleted: number; skipped: string[] }> {
  const admin = await requireWorkspaceAction("manage.prms.vendors");
  let deleted = 0;
  const skipped: string[] = [];
  for (const id of ids) {
    const before = await getVendor(id);
    const result = await deleteVendor(id, admin.id);
    if (result.ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "vendor",
        entityId: id,
        entityLabel: before?.companyName ?? null,
      });
    } else {
      skipped.push(before?.companyName ?? id);
    }
  }
  revalidate();
  return { deleted, skipped };
}

export async function getVendorActivityAction(id: string): Promise<SerializedAuditLog[]> {
  await requireWorkspaceAction("manage.prms.vendors");
  const { items } = await listAudit({ entity: "vendor", entityId: id, pageSize: 50 });
  return items.map(serializeAuditLog);
}

export async function getVendorPurchaseHistoryAction(id: string) {
  await requireWorkspaceAction("manage.prms.vendors");
  return vendorPurchaseHistory(id);
}
