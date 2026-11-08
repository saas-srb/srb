"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { getDb } from "@/lib/mongodb";
import {
  createPurchaseOrder,
  updatePurchaseOrder,
  issuePurchaseOrder,
  setPurchaseOrderStatus,
  deletePurchaseOrder,
  getPurchaseOrder,
  type PoItemInput,
} from "@/lib/products/spendiq/purchase-orders";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { getRequisition } from "@/lib/products/spendiq/requisitions";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { notifyStaff } from "@/lib/products/spendiq/notifications";
import { DEFAULT_GST_RATE } from "@/lib/products/spendiq/constants";
import { writeBlockReason } from "@/lib/platform/billing/enforce";

export interface PoActionResult {
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
  revalidatePath("/spendiq/purchase-orders");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/purchase-orders/${id}`);
}

interface RawLine {
  description?: string;
  hsn?: string;
  quantity?: string | number;
  uom?: string;
  unitPrice?: string | number;
  gstRate?: string | number;
}

function parseLines(raw: unknown): PoItemInput[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawLine[])
    .map((l) => ({
      description: String(l.description ?? "").trim(),
      hsn: String(l.hsn ?? "").trim() || null,
      quantity: Number(l.quantity) || 0,
      uom: String(l.uom ?? "pcs"),
      unitPrice: Number(l.unitPrice) || 0,
      gstRate: Number.isFinite(Number(l.gstRate)) ? Number(l.gstRate) : DEFAULT_GST_RATE,
    }))
    .filter((l) => l.description && l.quantity > 0);
}

export async function savePurchaseOrderAction(
  input: Record<string, unknown>,
  id?: string
): Promise<PoActionResult> {
  const user = await requireManage();
  const readOnly = await writeBlockReason();
  if (readOnly) return { ok: false, error: readOnly };

  const vendorId = String(input.vendorId ?? "");
  const vendor = vendorId ? await getVendor(vendorId) : null;
  if (!vendor) return { ok: false, fieldErrors: { vendorId: "Select a vendor." } };

  const items = parseLines(input.items);
  if (items.length === 0) return { ok: false, fieldErrors: { items: "Add at least one line item." } };

  const payload = {
    vendorId,
    vendorName: vendor.companyName,
    requisitionId: (input.requisitionId as string) || null,
    departmentId: (input.departmentId as string) || null,
    departmentName: (input.departmentName as string) || null,
    projectId: (input.projectId as string) || null,
    projectName: (input.projectName as string) || null,
    items,
    discount: Number(input.discount) || 0,
    currency: String(input.currency ?? vendor.currency ?? "INR"),
    deliveryAddress: (input.deliveryAddress as string)?.trim() || null,
    deliveryDate: (input.deliveryDate as string) || null,
    paymentTerms: (input.paymentTerms as string) || vendor.paymentTerms || null,
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const res = await updatePurchaseOrder(id, payload, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "purchase_order", entityId: id, entityLabel: vendor.companyName });
    revalidate(id);
    return { ok: true, id };
  }

  const created = await createPurchaseOrder(payload, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "purchase_order", entityId: created._id, entityLabel: created.poNumber });

  // Mark the source requisition as converted.
  if (payload.requisitionId) {
    const conn = await getDb();
    await conn.collection<{ _id: string; status: string }>("prms_requisitions").updateOne(
      { _id: payload.requisitionId, status: "approved" },
      { $set: { status: "converted", updatedAt: new Date(), updatedBy: user.id } }
    );
  }

  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function issuePurchaseOrderAction(id: string): Promise<PoActionResult> {
  const user = await requireManage();
  const before = await getPurchaseOrder(id);
  const res = await issuePurchaseOrder(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "purchase_order", entityId: id, entityLabel: before?.poNumber, summary: "status: draft → issued" });
  await notifyStaff(
    { type: "po_issued", title: `${before?.poNumber} issued to ${before?.vendorName}`, body: `Total ${before?.currency} ${before?.totalAmount.toLocaleString("en-IN")}`, link: `/spendiq/purchase-orders/${id}`, dedupeKey: `po_issued:${id}` },
    ["super_admin", "prms_admin", "procurement_manager", "finance"]
  );
  revalidate(id);
  return { ok: true, id };
}

export async function cancelPurchaseOrderAction(id: string): Promise<PoActionResult> {
  const user = await requireManage();
  const before = await getPurchaseOrder(id);
  await setPurchaseOrderStatus(id, "cancelled", user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "purchase_order", entityId: id, entityLabel: before?.poNumber, summary: `status: ${before?.status} → cancelled` });
  revalidate(id);
  return { ok: true, id };
}

export async function closePurchaseOrderAction(id: string): Promise<PoActionResult> {
  const user = await requireManage();
  const before = await getPurchaseOrder(id);
  await setPurchaseOrderStatus(id, "closed", user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "status_change", entity: "purchase_order", entityId: id, entityLabel: before?.poNumber, summary: `status: ${before?.status} → closed` });
  revalidate(id);
  return { ok: true, id };
}

export async function deletePurchaseOrderAction(id: string): Promise<PoActionResult> {
  const user = await requireManage();
  const before = await getPurchaseOrder(id);
  const res = await deletePurchaseOrder(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "purchase_order", entityId: id, entityLabel: before?.poNumber });
  revalidate(id);
  return { ok: true };
}

/** Prefill data for "Create PO" from an approved requisition. */
export async function requisitionToPoPrefillAction(requisitionId: string) {
  await requireManage();
  const req = await getRequisition(requisitionId);
  if (!req) return null;
  return {
    requisitionId,
    departmentId: req.departmentId,
    departmentName: req.departmentName,
    projectId: req.projectId,
    projectName: req.projectName,
    preferredVendorId: req.preferredVendorId,
    currency: req.currency,
    line: {
      description: req.itemName,
      quantity: req.quantity,
      uom: req.uom,
      unitPrice: req.quantity > 0 ? Math.round((req.estimatedCost / req.quantity) * 100) / 100 : req.estimatedCost,
    },
  };
}
