"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import {
  getInfrastructureResource,
  updateInfrastructure,
  deleteInfrastructureRow,
  type InfraWriteInput,
} from "@/lib/products/spendiq/infrastructure";
import { isValidResourceStatus, type ResourceStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

function revalidate() {
  revalidatePath("/commandos/prms/infrastructure");
}

function toWriteInput(doc: Awaited<ReturnType<typeof getInfrastructureResource>>, status: ResourceStatus): InfraWriteInput {
  const d = doc!;
  return {
    name: d.name,
    provider: d.provider,
    resourceType: d.resourceType,
    region: d.region,
    cost: d.cost,
    billingCycle: d.billingCycle,
    currency: d.currency,
    renewalDate: d.renewalDate,
    autoRenew: d.autoRenew,
    vendorId: d.vendorId,
    vendorName: d.vendorName,
    status,
    notes: d.notes,
  };
}

export async function updateInfrastructureStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.infrastructure");
  if (!isValidResourceStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getInfrastructureResource(id);
  if (!before) return { ok: false, error: "Resource not found." };
  await updateInfrastructure(id, toWriteInput(before, status), admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "infrastructure",
    entityId: id,
    entityLabel: before.name,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: true };
}

export async function deleteInfrastructureAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.infrastructure");
  const before = await getInfrastructureResource(id);
  const ok = await deleteInfrastructureRow(id, admin.id);
  if (!ok) return { ok: false, error: "Could not delete resource." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "infrastructure",
    entityId: id,
    entityLabel: before?.name ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkDeleteInfrastructureAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.prms.infrastructure");
  let deleted = 0;
  for (const id of ids) {
    const before = await getInfrastructureResource(id);
    const ok = await deleteInfrastructureRow(id, admin.id);
    if (ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "infrastructure",
        entityId: id,
        entityLabel: before?.name ?? null,
      });
    }
  }
  revalidate();
  return { deleted };
}
