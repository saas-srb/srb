"use server";

import { getDepartment } from "@/lib/platform/organization";
import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canApproveTransactions } from "@/lib/fms-access";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  changeTransactionStatus,
  type TransactionWriteData,
} from "@/lib/products/cashflow-ai/transactions";
import {
  isValidTransactionType,
  isValidPaymentMethod,
  isValidSourceModule,
  isValidTransactionStatus,
  isValidFundAccountType,
  DEFAULT_CURRENCY,
} from "@/lib/products/cashflow-ai/constants";
import { saveAttachmentFile, isAllowedAttachment } from "@/lib/products/cashflow-ai/attachment-storage";
import { getTransaction } from "@/lib/products/cashflow-ai/transactions";

export interface TransactionActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(id?: string) {
  revalidatePath("/cashflow-ai/transactions");
  revalidatePath("/cashflow-ai");
  revalidatePath("/cashflow-ai/customers");
  revalidatePath("/cashflow-ai/vendors");
  if (id) revalidatePath(`/cashflow-ai/transactions/${id}`);
}

function buildPayload(input: Record<string, unknown>, dept: { department: string | null; departmentId: string | null }): { ok: true; data: TransactionWriteData } | { ok: false; fieldErrors: Record<string, string> } {
  const errors: Record<string, string> = {};

  const type = String(input.type ?? "");
  if (!isValidTransactionType(type)) errors.type = "Select a transaction type.";

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter a valid amount.";

  const paymentMethod = String(input.paymentMethod ?? "bank_transfer");
  if (!isValidPaymentMethod(paymentMethod)) errors.paymentMethod = "Unknown payment method.";

  const sourceModule = String(input.sourceModule ?? "fms");
  if (!isValidSourceModule(sourceModule)) errors.sourceModule = "Unknown source module.";

  const transactionDateRaw = String(input.transactionDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(transactionDateRaw)) errors.transactionDate = "Enter a valid date.";

  const postingDateRaw = String(input.postingDate ?? transactionDateRaw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(postingDateRaw)) errors.postingDate = "Enter a valid date.";

  const fundAccountKey = String(input.fundAccountKey ?? "");
  let fundAccountId: string | null = null;
  let fundAccountType: TransactionWriteData["fundAccountType"] = null;
  if (fundAccountKey) {
    const [type, accountId] = fundAccountKey.split(":");
    if (isValidFundAccountType(type) && accountId) {
      fundAccountType = type;
      fundAccountId = accountId;
    }
  }

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };

  return {
    ok: true,
    data: {
      type: type as TransactionWriteData["type"],
      transactionDate: new Date(`${transactionDateRaw}T00:00:00`),
      postingDate: new Date(`${postingDateRaw}T00:00:00`),
      amount,
      currency: String(input.currency ?? DEFAULT_CURRENCY),
      paymentMethod: paymentMethod as TransactionWriteData["paymentMethod"],
      sourceModule: sourceModule as TransactionWriteData["sourceModule"],
      sourceRecordId: (input.sourceRecordId as string)?.trim() || null,
      customerId: (input.customerId as string) || null,
      vendorId: (input.vendorId as string) || null,
      employeeId: (input.employeeId as string)?.trim() || null,
      projectId: (input.projectId as string) || null,
      ...dept,
      accountId: (input.accountId as string) || null,
      fundAccountId,
      fundAccountType,
      taxAmount: Number.isFinite(Number(input.taxAmount)) ? Number(input.taxAmount) : 0,
      referenceNumber: (input.referenceNumber as string)?.trim() || null,
      description: (input.description as string)?.trim() || null,
      attachments: [],
    },
  };
}

export async function saveTransactionAction(input: Record<string, unknown>, id?: string): Promise<TransactionActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const built = buildPayload(input, await resolveDepartment(input));
  if (!built.ok) return { ok: false, fieldErrors: built.fieldErrors };

  if (id) {
    const res = await updateTransaction(id, built.data, user.id, user.email);
    if (!res) return { ok: false, error: "Transaction not found." };
    if ("ok" in res && res.ok === false) return { ok: false, error: res.reason };
    revalidate(id);
    return { ok: true, id };
  }

  const created = await createTransaction(built.data, user.id, user.email);
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function deleteTransactionAction(id: string): Promise<TransactionActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");
  const res = await deleteTransaction(id, user.id, user.email);
  if (!res.ok) return { ok: false, error: res.reason };
  revalidate(id);
  return { ok: true };
}

export async function changeTransactionStatusAction(id: string, toStatus: string): Promise<TransactionActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!isValidTransactionStatus(toStatus)) return { ok: false, error: "Unknown status." };

  // Approving / rejecting requires approval authority; every other move
  // (submit, schedule, complete, cancel, reverse, reconcile) just needs
  // general transaction-management access.
  const needsApproval = toStatus === "approved" || toStatus === "rejected";
  if (needsApproval ? !canApproveTransactions(user) : !canManageTransactions(user)) throw new Error("Forbidden");

  const res = await changeTransactionStatus(id, toStatus, user.id, user.email);
  if (!res) return { ok: false, error: "Transaction not found." };
  if ("ok" in res && res.ok === false) return { ok: false, error: res.reason };
  revalidate(id);
  return { ok: true, id };
}

export async function uploadTransactionAttachmentAction(id: string, formData: FormData): Promise<TransactionActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const existing = await getTransaction(id);
  if (!existing) return { ok: false, error: "Transaction not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const check = isAllowedAttachment(file);
  if (!check.ok) return { ok: false, error: check.error };
  const stored = await saveAttachmentFile(file);

  const res = await updateTransaction(
    id,
    {
      type: existing.type,
      transactionDate: existing.transactionDate,
      postingDate: existing.postingDate,
      amount: existing.amount,
      currency: existing.currency,
      paymentMethod: existing.paymentMethod,
      sourceModule: existing.sourceModule,
      sourceRecordId: existing.sourceRecordId,
      customerId: existing.customerId,
      vendorId: existing.vendorId,
      employeeId: existing.employeeId,
      projectId: existing.projectId,
      department: existing.department,
      departmentId: existing.departmentId ?? null,
      accountId: existing.accountId,
      taxAmount: existing.taxAmount,
      referenceNumber: existing.referenceNumber,
      description: existing.description,
      attachments: [...existing.attachments, stored],
    },
    user.id,
    user.email
  );
  if (!res) return { ok: false, error: "Transaction not found." };
  if ("ok" in res && res.ok === false) return { ok: false, error: res.reason };
  revalidate(id);
  return { ok: true, id };
}

/** The department chosen in the picker: the id is stored and the name is kept beside it (older rows only have the name). */
async function resolveDepartment(input: Record<string, unknown>): Promise<{ department: string | null; departmentId: string | null }> {
  const id = typeof input.departmentId === "string" ? input.departmentId.trim() : "";
  if (id) {
    const d = await getDepartment(id);
    if (d) return { department: d.name, departmentId: d._id };
  }
  const text = typeof input.department === "string" ? input.department.trim() : "";
  return { department: text || null, departmentId: null };
}
