"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canApproveTransactions } from "@/lib/fms-roles";
import {
  requestAdvance,
  changeAdvanceStatus,
  recordRepayment,
  getAdvance,
  type AdvanceWriteData,
} from "@/lib/products/cashflow-ai/employee-advances";
import { isValidAdvanceStatus, isValidPaymentMethod, isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface AdvanceActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(id?: string) {
  revalidatePath("/cashflow-ai/advances");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
  if (id) revalidatePath(`/cashflow-ai/advances/${id}`);
}

export async function requestAdvanceAction(input: Record<string, unknown>): Promise<AdvanceActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const employeeId = String(input.employeeId ?? "");
  const employeeName = String(input.employeeName ?? "").trim();
  if (!employeeId || !employeeName) return { ok: false, fieldErrors: { employeeId: "Select an employee." } };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter an advance amount." } };

  const reason = String(input.reason ?? "").trim();
  if (!reason) return { ok: false, fieldErrors: { reason: "Enter a reason." } };

  const data: AdvanceWriteData = { employeeId, employeeName, amount, reason };
  const created = await requestAdvance(data, user.id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "transaction", entityId: created._id, entityLabel: created.advanceNumber });
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function changeAdvanceStatusAction(id: string, status: string, fundAccountKey?: string, code?: string): Promise<AdvanceActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!isValidAdvanceStatus(status)) return { ok: false, error: "Unknown status." };

  // Sending the advance is money leaving: the finance manager, with a confirmation code.
  const sendsMoney = status === "disbursed";
  const needsApproval = status === "approved" || status === "rejected" || sendsMoney;
  if (needsApproval ? !canApproveTransactions(user) : !canManageTransactions(user)) throw new Error("Forbidden");

  if (sendsMoney) {
    const blocked = await paymentGate(user.id, code);
    if (blocked) return { ok: false, error: blocked };
  }
  let fundAccountId: string | null = null;
  let fundAccountType: Parameters<typeof changeAdvanceStatus>[5] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const before = await getAdvance(id);
  const res = await changeAdvanceStatus(id, status, user.id, user.email, fundAccountId, fundAccountType);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: status === "approved" ? "approve" : status === "rejected" ? "reject" : "status_change",
    entity: "transaction",
    entityId: id,
    entityLabel: before?.advanceNumber,
    summary: `status → ${status}`,
  });
  revalidate(id);
  return { ok: true, id };
}

export async function recordRepaymentAction(id: string, input: Record<string, unknown>): Promise<AdvanceActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const method = String(input.method ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, fieldErrors: { method: "Unknown payment method." } };
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a repayment amount." } };

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: Parameters<typeof recordRepayment>[1]["fundAccountType"] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const res = await recordRepayment(
    id,
    {
      amount,
      method,
      transactionReference: (input.transactionReference as string)?.trim() || null,
      date: String(input.date ?? new Date().toISOString().slice(0, 10)),
      fundAccountId,
      fundAccountType,
    },
    user.id,
    user.email
  );
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "record", entity: "transaction", entityId: id, summary: `repayment of ${amount}` });
  revalidate(id);
  return { ok: true, id };
}
