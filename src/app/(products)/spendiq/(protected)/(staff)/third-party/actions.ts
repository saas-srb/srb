"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { createThirdPartyService, updateThirdPartyService, deleteThirdPartyRow, getThirdPartyService, type ThirdPartyWriteInput } from "@/lib/products/spendiq/third-party-services";
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
  revalidatePath("/spendiq/third-party");
  revalidatePath("/spendiq");
}

export async function saveThirdPartyAction(input: Record<string, unknown>, id?: string): Promise<ResourceActionResult> {
  const user = await requireManage();
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, fieldErrors: { name: "Name is required." } };
  const billingCycle = String(input.billingCycle ?? "monthly");
  if (!isValidBillingCycle(billingCycle)) return { ok: false, fieldErrors: { billingCycle: "Unknown billing cycle." } };
  const status = String(input.status ?? "active");
  if (!isValidResourceStatus(status)) return { ok: false, fieldErrors: { status: "Unknown status." } };

  const vendorId = (input.vendorId as string) || null;
  const vendor = vendorId ? await getVendor(vendorId) : null;
  const data: ThirdPartyWriteInput = {
    name,
    serviceType: String(input.serviceType ?? "").trim(),
    provider: String(input.provider ?? "").trim(),
    cost: Number(input.cost) || 0,
    billingCycle: billingCycle as BillingCycle,
    currency: String(input.currency ?? "INR"),
    slaSummary: (input.slaSummary as string)?.trim() || null,
    renewalDate: (input.renewalDate as string) || null,
    autoRenew: input.autoRenew === true || input.autoRenew === "true",
    vendorId,
    vendorName: vendor?.companyName ?? null,
    status: status as ResourceStatus,
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const before = await getThirdPartyService(id);
    if (!before) return { ok: false, error: "Not found." };
    await updateThirdPartyService(id, data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "third_party_service", entityId: id, entityLabel: name });
    revalidate();
    return { ok: true, id };
  }
  const created = await createThirdPartyService(data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "third_party_service", entityId: created._id, entityLabel: name });
  revalidate();
  return { ok: true, id: created._id };
}

export async function deleteThirdPartyAction(id: string): Promise<ResourceActionResult> {
  const user = await requireManage();
  const before = await getThirdPartyService(id);
  await deleteThirdPartyRow(id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "third_party_service", entityId: id, entityLabel: before?.name ?? null });
  revalidate();
  return { ok: true };
}
