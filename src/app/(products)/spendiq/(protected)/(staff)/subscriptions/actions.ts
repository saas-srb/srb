"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { createSubscription, updateSubscription, deleteSubscriptionRow, getSubscription, type SubscriptionWriteInput } from "@/lib/products/spendiq/software-subscriptions";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { isValidResourceStatus, isValidBillingCycle, type ResourceStatus, type BillingCycle } from "@/lib/products/spendiq/constants";

export interface ResourceActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireManage() {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageProcurement(user)) throw new Error("Forbidden");
  return user;
}

function revalidate() {
  revalidatePath("/spendiq/subscriptions");
  revalidatePath("/spendiq");
}

export async function saveSubscriptionAction(input: Record<string, unknown>, id?: string): Promise<ResourceActionResult> {
  const user = await requireManage();
  const serviceName = String(input.serviceName ?? "").trim();
  if (!serviceName) return { ok: false, fieldErrors: { serviceName: "Service name is required." } };
  const billingCycle = String(input.billingCycle ?? "monthly");
  if (!isValidBillingCycle(billingCycle)) return { ok: false, fieldErrors: { billingCycle: "Unknown billing cycle." } };
  const status = String(input.status ?? "active");
  if (!isValidResourceStatus(status)) return { ok: false, fieldErrors: { status: "Unknown status." } };

  const vendorId = (input.vendorId as string) || null;
  const vendor = vendorId ? await getVendor(vendorId) : null;
  const data: SubscriptionWriteInput = {
    serviceName,
    provider: String(input.provider ?? "").trim(),
    licenseCount: Number(input.licenseCount) || 1,
    cost: Number(input.cost) || 0,
    billingCycle: billingCycle as BillingCycle,
    currency: String(input.currency ?? "INR"),
    renewalDate: (input.renewalDate as string) || null,
    ownerEmployeeId: (input.ownerEmployeeId as string) || null,
    ownerName: (input.ownerName as string)?.trim() || null,
    autoRenew: input.autoRenew === true || input.autoRenew === "true",
    vendorId,
    vendorName: vendor?.companyName ?? null,
    status: status as ResourceStatus,
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const before = await getSubscription(id);
    if (!before) return { ok: false, error: "Not found." };
    await updateSubscription(id, data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "subscription", entityId: id, entityLabel: serviceName });
    revalidate();
    return { ok: true, id };
  }
  const created = await createSubscription(data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "subscription", entityId: created._id, entityLabel: serviceName });
  revalidate();
  return { ok: true, id: created._id };
}

export async function deleteSubscriptionAction(id: string): Promise<ResourceActionResult> {
  const user = await requireManage();
  const before = await getSubscription(id);
  await deleteSubscriptionRow(id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "subscription", entityId: id, entityLabel: before?.serviceName ?? null });
  revalidate();
  return { ok: true };
}
