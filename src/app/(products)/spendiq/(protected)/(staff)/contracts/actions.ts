"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { createContract, updateContract, deleteContractRow, attachContractDocument, getContract, type ContractWriteInput } from "@/lib/products/spendiq/contracts";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { isValidResourceStatus, type ResourceStatus } from "@/lib/products/spendiq/constants";
import { saveAttachmentFile, isAllowedAttachment } from "@/lib/products/spendiq/attachment-storage";

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

function revalidate(id?: string) {
  revalidatePath("/spendiq/contracts");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/contracts/${id}`);
}

export async function saveContractAction(input: Record<string, unknown>, id?: string): Promise<ResourceActionResult> {
  const user = await requireManage();
  const title = String(input.title ?? "").trim();
  if (!title) return { ok: false, fieldErrors: { title: "Title is required." } };
  const startDate = String(input.startDate ?? "");
  const endDate = String(input.endDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { ok: false, fieldErrors: { startDate: "Enter a valid date." } };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return { ok: false, fieldErrors: { endDate: "Enter a valid date." } };
  if (endDate < startDate) return { ok: false, fieldErrors: { endDate: "End date is before the start date." } };
  const status = String(input.status ?? "active");
  if (!isValidResourceStatus(status)) return { ok: false, fieldErrors: { status: "Unknown status." } };

  const vendorId = (input.vendorId as string) || null;
  const vendor = vendorId ? await getVendor(vendorId) : null;
  const data: ContractWriteInput = {
    title,
    contractType: String(input.contractType ?? "AMC"),
    vendorId,
    vendorName: vendor?.companyName ?? null,
    startDate,
    endDate,
    renewalDate: (input.renewalDate as string) || null,
    value: Number(input.value) || 0,
    currency: String(input.currency ?? "INR"),
    slaSummary: (input.slaSummary as string)?.trim() || null,
    autoRenew: input.autoRenew === true || input.autoRenew === "true",
    status: status as ResourceStatus,
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const before = await getContract(id);
    if (!before) return { ok: false, error: "Not found." };
    await updateContract(id, data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "contract", entityId: id, entityLabel: title });
    revalidate(id);
    return { ok: true, id };
  }
  const created = await createContract(data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "contract", entityId: created._id, entityLabel: created.contractCode });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function uploadContractDocumentAction(id: string, formData: FormData): Promise<ResourceActionResult> {
  const user = await requireManage();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const check = isAllowedAttachment(file);
  if (!check.ok) return { ok: false, error: check.error };
  const stored = await saveAttachmentFile(file);
  await attachContractDocument(id, stored.storageKey, stored.filename, user.id);
  revalidate(id);
  return { ok: true, id };
}

export async function deleteContractAction(id: string): Promise<ResourceActionResult> {
  const user = await requireManage();
  const before = await getContract(id);
  await deleteContractRow(id, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "contract", entityId: id, entityLabel: before?.contractCode ?? null });
  revalidate(id);
  return { ok: true };
}
