"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canApproveTransactions, canManageTransactions } from "@/lib/fms-roles";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordVendorPayment, markVendorPaymentProcessed } from "@/lib/products/cashflow-ai/vendor-payments";
import { isValidPaymentMethod, isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import type { PaymentWriteData } from "@/lib/products/spendiq/payments";

export interface VendorPaymentActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  paymentId?: string;
}

function revalidate(billId?: string) {
  revalidatePath("/cashflow-ai/bills");
  revalidatePath("/cashflow-ai/vendors");
  revalidatePath("/cashflow-ai/payables");
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
  if (billId) revalidatePath(`/cashflow-ai/bills/${billId}`);
}

export async function recordVendorPaymentAction(input: Record<string, unknown>): Promise<VendorPaymentActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const method = String(input.method ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, fieldErrors: { method: "Unknown payment method." } };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a payment amount." } };

  const billId = String(input.invoiceId ?? "");
  if (!billId) return { ok: false, fieldErrors: { invoiceId: "Missing bill reference." } };

  const status = input.status === "scheduled" ? "scheduled" : "processed";
  // Sending money to a vendor is the finance manager's act; an accountant can record a payment as scheduled, and the manager pays it.
  if (status === "processed") {
    if (!canApproveTransactions(user)) return { ok: false, error: "Only someone who can approve transactions can send a vendor payment. Record it as scheduled and ask them to pay it." };
    const blocked = await paymentGate(user.id, input.code);
    if (blocked) return { ok: false, error: blocked };
  }
  const data: PaymentWriteData = {
    invoiceId: billId,
    amount,
    paymentDate: String(input.paymentDate ?? new Date().toISOString().slice(0, 10)),
    method,
    transactionReference: (input.transactionReference as string)?.trim() || null,
    tdsDeducted: Number(input.tdsDeducted) || 0,
    status,
    notes: (input.notes as string)?.trim() || null,
  };

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: Parameters<typeof recordVendorPayment>[4] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const res = await recordVendorPayment(data, user.id, user.email, fundAccountId, fundAccountType);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "transaction",
    entityId: res.paymentId!,
    entityLabel: null,
    summary: `Vendor payment of ${amount} recorded via CashFlow (SpendIQ payment ${res.paymentId})`,
  });
  revalidate(billId);
  return { ok: true, paymentId: res.paymentId };
}

export async function markVendorPaymentProcessedAction(id: string, billId: string, code?: string): Promise<VendorPaymentActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canApproveTransactions(user)) throw new Error("Forbidden");
  const blocked = await paymentGate(user.id, code);
  if (blocked) return { ok: false, error: blocked };

  const res = await markVendorPaymentProcessed(id, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidate(billId);
  return { ok: true, paymentId: id };
}
