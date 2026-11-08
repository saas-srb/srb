"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import {
  getSubscription,
  updateSubscription,
  deleteSubscriptionRow,
  type SubscriptionWriteInput,
} from "@/lib/products/spendiq/software-subscriptions";
import { isValidResourceStatus, type ResourceStatus } from "@/lib/products/spendiq/constants";
import { recordAudit, diffSummary } from "@/lib/products/spendiq/audit";

function revalidate() {
  revalidatePath("/commandos/prms/subscriptions");
}

function toWriteInput(doc: Awaited<ReturnType<typeof getSubscription>>, status: ResourceStatus): SubscriptionWriteInput {
  const d = doc!;
  return {
    serviceName: d.serviceName,
    provider: d.provider,
    licenseCount: d.licenseCount,
    cost: d.cost,
    billingCycle: d.billingCycle,
    currency: d.currency,
    renewalDate: d.renewalDate,
    ownerEmployeeId: d.ownerEmployeeId,
    ownerName: d.ownerName,
    autoRenew: d.autoRenew,
    vendorId: d.vendorId,
    vendorName: d.vendorName,
    status,
    notes: d.notes,
  };
}

export async function updateSubscriptionStatusAction(id: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.subscriptions");
  if (!isValidResourceStatus(status)) return { ok: false, error: "Unknown status." };
  const before = await getSubscription(id);
  if (!before) return { ok: false, error: "Subscription not found." };
  await updateSubscription(id, toWriteInput(before, status), admin.id);
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "status_change",
    entity: "subscription",
    entityId: id,
    entityLabel: before.serviceName,
    summary: diffSummary({ status: before.status }, { status }, ["status"]),
  });
  revalidate();
  return { ok: true };
}

export async function deleteSubscriptionAction(id: string): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireWorkspaceAction("manage.prms.subscriptions");
  const before = await getSubscription(id);
  const ok = await deleteSubscriptionRow(id, admin.id);
  if (!ok) return { ok: false, error: "Could not delete subscription." };
  await recordAudit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "delete",
    entity: "subscription",
    entityId: id,
    entityLabel: before?.serviceName ?? null,
  });
  revalidate();
  return { ok: true };
}

export async function bulkDeleteSubscriptionsAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.prms.subscriptions");
  let deleted = 0;
  for (const id of ids) {
    const before = await getSubscription(id);
    const ok = await deleteSubscriptionRow(id, admin.id);
    if (ok) {
      deleted += 1;
      await recordAudit({
        actorId: admin.id,
        actorEmail: admin.email,
        action: "delete",
        entity: "subscription",
        entityId: id,
        entityLabel: before?.serviceName ?? null,
      });
    }
  }
  revalidate();
  return { deleted };
}
