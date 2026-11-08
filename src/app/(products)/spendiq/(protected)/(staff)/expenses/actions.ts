"use server";

import { revalidatePath } from "next/cache";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { canManageExpenses, hasPrmsStaffRole } from "@/lib/prms-roles";
import {
  createExpense,
  updateExpense,
  decideExpense,
  markExpenseReimbursed,
  setRecurringActive,
  deleteExpense,
  getExpense,
  type ExpenseWriteData,
} from "@/lib/products/spendiq/expenses";
import { getVendor } from "@/lib/products/spendiq/vendors";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { notify, notifyStaff } from "@/lib/products/spendiq/notifications";
import { isValidExpenseCategory, isValidPaymentMethod, isValidRecurrenceInterval, DEFAULT_GST_RATE } from "@/lib/products/spendiq/constants";
import { saveAttachmentFile, isAllowedAttachment } from "@/lib/products/spendiq/attachment-storage";

export interface ExpenseActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : email;
}

function revalidate(id?: string) {
  revalidatePath("/spendiq/expenses");
  revalidatePath("/spendiq/me/expenses");
  revalidatePath("/spendiq");
  if (id) {
    revalidatePath(`/spendiq/expenses/${id}`);
    revalidatePath(`/spendiq/me/expenses/${id}`);
  }
}

async function buildPayload(input: Record<string, unknown>): Promise<
  { ok: true; data: ExpenseWriteData; fieldErrors?: never } | { ok: false; fieldErrors: Record<string, string> }
> {
  const errors: Record<string, string> = {};
  const category = String(input.category ?? "");
  if (!isValidExpenseCategory(category)) errors.category = "Select a category.";
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Enter a valid amount.";
  const paymentMethod = String(input.paymentMethod ?? "bank_transfer");
  if (!isValidPaymentMethod(paymentMethod)) errors.paymentMethod = "Unknown payment method.";
  const expenseDate = String(input.expenseDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) errors.expenseDate = "Enter a valid date.";
  const expenseType = input.expenseType === "recurring" ? "recurring" : "one_time";
  const recurrenceInterval = input.recurrenceInterval ? String(input.recurrenceInterval) : null;
  if (expenseType === "recurring" && !isValidRecurrenceInterval(recurrenceInterval)) {
    errors.recurrenceInterval = "Choose a recurrence interval.";
  }

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };

  const vendorId = (input.vendorId as string) || null;
  const vendor = vendorId ? await getVendor(vendorId) : null;

  return {
    ok: true,
    data: {
      category,
      subcategory: (input.subcategory as string)?.trim() || null,
      vendorId,
      vendorName: vendor?.companyName ?? null,
      departmentId: (input.departmentId as string) || null,
      departmentName: (input.departmentName as string) || null,
      projectId: (input.projectId as string) || null,
      projectName: (input.projectName as string) || null,
      amount,
      gstRate: Number.isFinite(Number(input.gstRate)) ? Number(input.gstRate) : DEFAULT_GST_RATE,
      currency: String(input.currency ?? "INR"),
      paymentMethod,
      invoiceNumber: (input.invoiceNumber as string)?.trim() || null,
      expenseDate,
      description: (input.description as string)?.trim() || null,
      expenseType,
      recurrenceInterval: expenseType === "recurring" ? (recurrenceInterval as ExpenseWriteData["recurrenceInterval"]) : null,
    },
  };
}

export async function saveExpenseAction(
  input: Record<string, unknown>,
  id?: string
): Promise<ExpenseActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");

  const isStaff = hasPrmsStaffRole(user.roles);
  const built = await buildPayload(input);
  if (!built.ok) return { ok: false, fieldErrors: built.fieldErrors };

  if (id) {
    const before = await getExpense(id);
    if (!before) return { ok: false, error: "Expense not found." };
    if (before.raisedByUserId !== user.id && !isStaff) throw new Error("Forbidden");
    const res = await updateExpense(id, built.data, user.id);
    if (!res.ok) return { ok: false, error: res.reason };
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "expense", entityId: id, entityLabel: before.expenseCode });
    revalidate(id);
    return { ok: true, id };
  }

  // Staff with expense authority can auto-approve their own direct entries.
  const autoApprove = canManageExpenses(user) && input.autoApprove === true;
  const created = await createExpense(built.data, { userId: user.id, name: nameFromEmail(user.email) }, user.id, autoApprove);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "expense", entityId: created._id, entityLabel: created.expenseCode });
  if (!autoApprove) {
    await notifyStaff(
      { type: "expense_submitted", title: `Expense ${created.expenseCode} awaiting approval`, body: `${created.currency} ${created.totalAmount.toLocaleString("en-IN")}`, link: `/spendiq/expenses/${created._id}`, dedupeKey: `expense_submitted:${created._id}` },
      ["super_admin", "prms_admin", "finance", "procurement_manager"]
    );
  }
  revalidate(created._id);
  return { ok: true, id: created._id };
}

export async function uploadExpenseInvoiceAction(id: string, formData: FormData): Promise<ExpenseActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  const before = await getExpense(id);
  if (!before) return { ok: false, error: "Expense not found." };
  if (before.raisedByUserId !== user.id && !hasPrmsStaffRole(user.roles)) throw new Error("Forbidden");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file." };
  const check = isAllowedAttachment(file);
  if (!check.ok) return { ok: false, error: check.error };
  const stored = await saveAttachmentFile(file);
  await updateExpense(id, {
    category: before.category,
    subcategory: before.subcategory,
    vendorId: before.vendorId,
    vendorName: before.vendorName,
    departmentId: before.departmentId,
    departmentName: before.departmentName,
    projectId: before.projectId,
    projectName: before.projectName,
    amount: before.amount,
    gstRate: before.gstRate,
    currency: before.currency,
    paymentMethod: before.paymentMethod,
    invoiceNumber: before.invoiceNumber,
    invoiceStorageKey: stored.storageKey,
    invoiceFilename: stored.filename,
    expenseDate: before.expenseDate.toISOString().slice(0, 10),
    description: before.description,
    expenseType: before.expenseType,
    recurrenceInterval: before.recurrence?.interval ?? null,
  }, user.id);
  revalidate(id);
  return { ok: true, id };
}

export async function decideExpenseAction(id: string, approve: boolean, note: string): Promise<ExpenseActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageExpenses(user)) throw new Error("Forbidden");
  const res = await decideExpense(id, approve, note || null, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: approve ? "approve" : "reject", entity: "expense", entityId: id, entityLabel: res.expense?.expenseCode });
  // The submitter is notified by `decideExpense` itself (so the Workspace and bulk paths notify too).
  revalidate(id);
  return { ok: true, id };
}

export async function reimburseExpenseAction(id: string): Promise<ExpenseActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageExpenses(user)) throw new Error("Forbidden");
  const res = await markExpenseReimbursed(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "record", entity: "expense", entityId: id, entityLabel: null, summary: "marked reimbursed" });
  revalidate(id);
  return { ok: true, id };
}

export async function toggleRecurringExpenseAction(id: string, active: boolean): Promise<ExpenseActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageExpenses(user)) throw new Error("Forbidden");
  await setRecurringActive(id, active, user.id);
  revalidate(id);
  return { ok: true, id };
}

export async function deleteExpenseAction(id: string): Promise<ExpenseActionResult> {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  const before = await getExpense(id);
  if (!before) return { ok: false, error: "Expense not found." };
  if (before.raisedByUserId !== user.id && !hasPrmsStaffRole(user.roles)) throw new Error("Forbidden");
  const res = await deleteExpense(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "expense", entityId: id, entityLabel: before.expenseCode });
  revalidate(id);
  return { ok: true };
}
