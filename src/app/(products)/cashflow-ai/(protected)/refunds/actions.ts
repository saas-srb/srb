"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canMoveRefund } from "@/lib/fms-roles";
import { requestRefund, changeRefundStatus, getRefund, type RefundWriteData } from "@/lib/products/cashflow-ai/refunds";
import { isValidRefundStatus } from "@/lib/products/cashflow-ai/constants";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface RefundActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate() {
  revalidatePath("/cashflow-ai/refunds");
  revalidatePath("/cashflow-ai/receipts");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
}

export async function requestRefundAction(input: Record<string, unknown>): Promise<RefundActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const receiptId = String(input.receiptId ?? "");
  const amount = Number(input.amount);
  if (!receiptId) return { ok: false, fieldErrors: { receiptId: "Select the receipt to refund." } };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a refund amount." } };
  const reason = String(input.reason ?? "").trim();
  if (!reason) return { ok: false, fieldErrors: { reason: "Enter a reason." } };

  const data: RefundWriteData = { receiptId, amount, reason };
  const res = await requestRefund(data, user.id);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "refund", entityId: res.refund._id, entityLabel: res.refund.refundNumber });
  revalidate();
  return { ok: true, id: res.refund._id };
}

export async function changeRefundStatusAction(id: string, status: string, code?: string): Promise<RefundActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!isValidRefundStatus(status)) return { ok: false, error: "Unknown status." };

  const before = await getRefund(id);
  if (!before) return { ok: false, error: "Refund not found." };
  // The status it is moving FROM decides who may do it (see canMoveRefund): the UI hiding a button is never the boundary.
  if (!canMoveRefund(user, before.status, status)) throw new Error("Forbidden");
  // Moving to "processing" is what sends the money back to the customer.
  if (status === "processing") {
    const blocked = await paymentGate(user.id, code);
    if (blocked) return { ok: false, error: blocked };
  }

  const res = await changeRefundStatus(id, status, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: status === "completed" ? "approve" : status === "failed" ? "reject" : "status_change",
    entity: "refund",
    entityId: id,
    entityLabel: before?.refundNumber,
    summary: `status → ${status}`,
  });
  revalidate();
  return { ok: true, id };
}
