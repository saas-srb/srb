"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import {
  createInventoryItem,
  updateInventoryItem,
  recordInventoryTransaction,
  deleteInventoryItem,
  getInventoryItem,
} from "@/lib/products/spendiq/inventory";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { isValidInventoryTxnType, type InventoryTxnType } from "@/lib/products/spendiq/constants";

export interface InventoryActionResult {
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
  revalidatePath("/spendiq/inventory");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/inventory/${id}`);
}

export async function saveInventoryItemAction(input: Record<string, unknown>, id?: string): Promise<InventoryActionResult> {
  const user = await requireManage();
  const name = String(input.name ?? "").trim();
  if (!name) return { ok: false, fieldErrors: { name: "Name is required." } };

  const vendorId = (input.vendorId as string) || null;
  const vendor = vendorId ? await getVendor(vendorId) : null;
  const data = {
    name,
    category: (input.category as string)?.trim() || null,
    uom: String(input.uom ?? "pcs"),
    unitCost: Number(input.unitCost) || 0,
    minStock: Number(input.minStock) || 0,
    vendorId,
    vendorName: vendor?.companyName ?? null,
    location: (input.location as string)?.trim() || null,
    notes: (input.notes as string)?.trim() || null,
  };

  if (id) {
    const before = await getInventoryItem(id);
    if (!before) return { ok: false, error: "Item not found." };
    const updated = await updateInventoryItem(id, data, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "inventory_item", entityId: id, entityLabel: updated?.name ?? name });
    revalidate(id);
    return { ok: true, id };
  }
  const created = await createInventoryItem(data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "inventory_item", entityId: created._id, entityLabel: created.itemCode });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function recordInventoryTransactionAction(itemId: string, input: Record<string, unknown>): Promise<InventoryActionResult> {
  const user = await requireManage();
  const type = String(input.type ?? "");
  if (!isValidInventoryTxnType(type)) return { ok: false, error: "Unknown transaction type." };
  const res = await recordInventoryTransaction(
    itemId,
    {
      type: type as InventoryTxnType,
      quantity: Number(input.quantity) || 0,
      unitCost: input.unitCost ? Number(input.unitCost) : null,
      reference: (input.reference as string) || null,
      note: (input.note as string) || null,
    },
    user.id
  );
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "record", entity: "inventory_transaction", entityId: itemId, entityLabel: type });
  revalidate(itemId);
  return { ok: true, id: itemId };
}

export async function deleteInventoryItemAction(id: string): Promise<InventoryActionResult> {
  const user = await requireManage();
  const before = await getInventoryItem(id);
  const res = await deleteInventoryItem(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "inventory_item", entityId: id, entityLabel: before?.itemCode });
  revalidate(id);
  return { ok: true };
}
