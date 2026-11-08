"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageProcurement } from "@/lib/prms-roles";
import { createGoodsReceipt, deleteGoodsReceipt, getGoodsReceipt, type GrnLineInput } from "@/lib/products/spendiq/goods-receipts";
import { recordAudit } from "@/lib/products/spendiq/audit";

export interface GrnActionResult {
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

export async function createGrnAction(input: Record<string, unknown>): Promise<GrnActionResult> {
  const user = await requireManage();
  const poId = String(input.poId ?? "");
  if (!poId) return { ok: false, fieldErrors: { poId: "Select a purchase order." } };

  const rawLines = Array.isArray(input.lines) ? (input.lines as Record<string, unknown>[]) : [];
  const lines: GrnLineInput[] = rawLines
    .map((l) => ({
      itemIndex: Number(l.itemIndex),
      receivedQty: Number(l.receivedQty) || 0,
      acceptedQty: Number(l.acceptedQty) || 0,
      remarks: (l.remarks as string)?.trim() || null,
    }))
    .filter((l) => Number.isInteger(l.itemIndex) && l.receivedQty > 0);

  const res = await createGoodsReceipt(
    {
      poId,
      warehouseLocation: (input.warehouseLocation as string)?.trim() || null,
      receivedDate: (input.receivedDate as string) || new Date().toISOString().slice(0, 10),
      qualityChecked: input.qualityChecked === true || input.qualityChecked === "true",
      remarks: (input.remarks as string)?.trim() || null,
      lines,
    },
    user.id
  );
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "receive", entity: "goods_receipt", entityId: res.id!, entityLabel: null });
  revalidatePath("/spendiq/grn");
  revalidatePath("/spendiq/purchase-orders");
  revalidatePath("/spendiq");
  return { ok: true, id: res.id };
}

export async function deleteGrnAction(id: string): Promise<GrnActionResult> {
  const user = await requireManage();
  const before = await getGoodsReceipt(id);
  const res = await deleteGoodsReceipt(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "goods_receipt", entityId: id, entityLabel: before?.grnNumber });
  revalidatePath("/spendiq/grn");
  revalidatePath("/spendiq/purchase-orders");
  return { ok: true };
}
