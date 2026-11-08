"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions } from "@/lib/fms-roles";
import { recordReceipt, voidReceipt, clearCheque, bounceCheque, type RecordReceiptData } from "@/lib/products/cashflow-ai/receipts";
import { listOutstandingInvoicesForCustomer, serializeInvoice, type SerializedInvoice } from "@/lib/products/cashflow-ai/invoices";
import { getClient } from "@/lib/products/sprintos/clients";
import { isValidPaymentMethod, isValidFundAccountType } from "@/lib/products/cashflow-ai/constants";
import { addReceiptDocument } from "@/lib/products/cashflow-ai/receipts";
import { isAllowedAttachment, saveAttachmentFile } from "@/lib/products/cashflow-ai/attachment-storage";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface ReceiptActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireFinance() {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");
  return user;
}

function revalidate() {
  revalidatePath("/cashflow-ai/receipts");
  revalidatePath("/cashflow-ai/invoices");
  revalidatePath("/cashflow-ai/customers");
  revalidatePath("/cashflow-ai/receivables");
  revalidatePath("/cashflow-ai");
}

export async function listOutstandingInvoicesAction(customerId: string): Promise<SerializedInvoice[]> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!customerId) return [];
  const invoices = await listOutstandingInvoicesForCustomer(customerId);
  return invoices.map(serializeInvoice);
}

export async function recordReceiptAction(input: Record<string, unknown>): Promise<ReceiptActionResult> {
  const user = await requireFinance();

  const customerId = String(input.customerId ?? "");
  const customer = customerId ? await getClient(customerId) : null;
  if (!customer) return { ok: false, fieldErrors: { customerId: "Select a customer." } };

  const receiptDate = String(input.receiptDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate)) return { ok: false, fieldErrors: { receiptDate: "Enter a valid date." } };

  const method = String(input.method ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, fieldErrors: { method: "Unknown payment method." } };

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a receipt amount." } };

  const tdsDeducted = input.tdsDeducted === undefined || input.tdsDeducted === "" ? 0 : Number(input.tdsDeducted);
  if (!Number.isFinite(tdsDeducted) || tdsDeducted < 0) return { ok: false, fieldErrors: { tdsDeducted: "Enter the TDS amount, or leave it empty." } };

  const allocationsRaw = Array.isArray(input.allocations) ? (input.allocations as { invoiceId: string; amount: string }[]) : [];
  const allocations = allocationsRaw
    .map((a) => ({ invoiceId: a.invoiceId, amount: Number(a.amount) || 0 }))
    .filter((a) => a.amount > 0);

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: RecordReceiptData["fundAccountType"] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  const data: RecordReceiptData = {
    customerId,
    customerName: customer.companyName,
    receiptDate,
    amount,
    method,
    transactionReference: (input.transactionReference as string)?.trim() || null,
    allocations,
    currency: String(input.currency ?? customer.billing?.currency ?? "INR"),
    fundAccountId,
    fundAccountType,
    chequeNumber: (input.chequeNumber as string)?.trim() || null,
    chequeDate: (input.chequeDate as string)?.trim() || null,
    chequeBank: (input.chequeBank as string)?.trim() || null,
    tdsDeducted,
    tdsSection: (input.tdsSection as string)?.trim() || null,
    notes: (input.notes as string)?.trim() || null,
  };

  const res = await recordReceipt(data, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "receipt",
    entityId: res.receipt._id,
    entityLabel: res.receipt.receiptNumber,
  });
  revalidate();
  return { ok: true, id: res.receipt._id };
}

export async function voidReceiptAction(id: string): Promise<ReceiptActionResult> {
  const user = await requireFinance();
  const res = await voidReceipt(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidate();
  return { ok: true };
}

export async function clearChequeAction(id: string, clearedOn: string): Promise<ReceiptActionResult> {
  const user = await requireFinance();
  const res = await clearCheque(id, clearedOn, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "receipt", entityId: id, entityLabel: "Cheque cleared" });
  revalidate();
  return { ok: true };
}

export async function bounceChequeAction(id: string, reason: string): Promise<ReceiptActionResult> {
  const user = await requireFinance();
  const res = await bounceCheque(id, reason, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "receipt", entityId: id, entityLabel: "Cheque bounced", summary: reason.slice(0, 200) });
  revalidate();
  return { ok: true };
}

export async function uploadReceiptDocumentAction(id: string, formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireFinance();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const check = isAllowedAttachment(file);
  if (!check.ok) return check;
  const stored = await saveAttachmentFile(file);
  const res = await addReceiptDocument(id, stored, user.id, user.email);
  if (!res.ok) {
    // the file was stored but cannot be attached: do not leave it behind
    const { deleteAttachmentFile } = await import("@/lib/products/cashflow-ai/attachment-storage");
    await deleteAttachmentFile(stored.storageKey).catch(() => {});
    return res;
  }
  revalidatePath(`/cashflow-ai/receipts/${id}`);
  revalidatePath("/cashflow-ai/compliance", "layout");
  return { ok: true };
}
