"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import {
  createAsset,
  updateAsset,
  assignAsset,
  returnAsset,
  changeAssetStatus,
  deleteAsset,
  getAsset,
  type AssetWriteData,
} from "@/lib/products/spendiq/assets";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { isValidDepreciationMethod, isValidAssetStatus, type AssetStatus } from "@/lib/products/spendiq/constants";

export interface AssetActionResult {
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
  revalidatePath("/spendiq/assets");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/assets/${id}`);
}

async function buildPayload(input: Record<string, unknown>): Promise<
  { ok: true; data: AssetWriteData } | { ok: false; fieldErrors: Record<string, string> }
> {
  const errors: Record<string, string> = {};
  const name = String(input.name ?? "").trim();
  if (!name) errors.name = "Name is required.";
  const category = String(input.category ?? "").trim();
  if (!category) errors.category = "Category is required.";
  const purchaseDate = String(input.purchaseDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) errors.purchaseDate = "Enter a valid date.";
  const purchaseCost = Number(input.purchaseCost);
  if (!Number.isFinite(purchaseCost) || purchaseCost < 0) errors.purchaseCost = "Enter a valid cost.";
  const depreciationMethod = String(input.depreciationMethod ?? "slm");
  if (!isValidDepreciationMethod(depreciationMethod)) errors.depreciationMethod = "Unknown method.";
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };

  const vendorId = (input.vendorId as string) || null;
  const vendor = vendorId ? await getVendor(vendorId) : null;

  return {
    ok: true,
    data: {
      name,
      category,
      brand: (input.brand as string)?.trim() || null,
      model: (input.model as string)?.trim() || null,
      serialNumber: (input.serialNumber as string)?.trim() || null,
      purchaseDate,
      purchaseCost,
      currency: String(input.currency ?? "INR"),
      vendorId,
      vendorName: vendor?.companyName ?? null,
      warrantyExpiry: (input.warrantyExpiry as string) || null,
      officeLocation: (input.officeLocation as string)?.trim() || null,
      depreciationMethod: depreciationMethod as AssetWriteData["depreciationMethod"],
      usefulLifeYears: Number(input.usefulLifeYears) || 5,
      salvageValue: Number(input.salvageValue) || 0,
      notes: (input.notes as string)?.trim() || null,
    },
  };
}

export async function saveAssetAction(input: Record<string, unknown>, id?: string): Promise<AssetActionResult> {
  const user = await requireManage();
  const built = await buildPayload(input);
  if (!built.ok) return { ok: false, fieldErrors: built.fieldErrors };

  if (id) {
    const before = await getAsset(id);
    if (!before) return { ok: false, error: "Asset not found." };
    const updated = await updateAsset(id, built.data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "asset", entityId: id, entityLabel: updated?.assetCode ?? before.assetCode });
    revalidate(id);
    return { ok: true, id };
  }
  const created = await createAsset(built.data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "asset", entityId: created._id, entityLabel: created.assetCode });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function assignAssetAction(id: string, employeeId: string, employeeName: string, note: string): Promise<AssetActionResult> {
  const user = await requireManage();
  const res = await assignAsset(id, { id: employeeId, name: employeeName }, note || null, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "assign", entity: "asset_assignment", entityId: id, entityLabel: employeeName });
  revalidate(id);
  return { ok: true, id };
}

export async function returnAssetAction(id: string, note: string): Promise<AssetActionResult> {
  const user = await requireManage();
  const res = await returnAsset(id, note || null, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "return", entity: "asset_assignment", entityId: id, entityLabel: null });
  revalidate(id);
  return { ok: true, id };
}

export async function changeAssetStatusAction(id: string, status: string, note: string): Promise<AssetActionResult> {
  const user = await requireManage();
  if (!isValidAssetStatus(status)) return { ok: false, error: "Unknown status." };
  const res = await changeAssetStatus(id, status as AssetStatus, note || null, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "asset", entityId: id, entityLabel: null, summary: `status → ${status}` });
  revalidate(id);
  return { ok: true, id };
}

export async function deleteAssetAction(id: string): Promise<AssetActionResult> {
  const user = await requireManage();
  const before = await getAsset(id);
  const res = await deleteAsset(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "asset", entityId: id, entityLabel: before?.assetCode });
  revalidate(id);
  return { ok: true };
}
