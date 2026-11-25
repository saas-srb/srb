"use server";

import { revalidatePath } from "next/cache";
import { saveBillRecord, attachBillFile, decideBill, deleteBill } from "@/lib/products/spendiq/bill-write";
import { getCurrentPrmsUser } from "@/lib/prms-auth";
import { prmsCan } from "@/lib/prms-access";
import {
  getInvoice,
} from "@/lib/products/spendiq/invoices";
import { recordPayment, markPaymentProcessed, deletePayment, getPayment, type PaymentWriteData } from "@/lib/products/spendiq/payments";
import { recordAudit } from "@/lib/products/spendiq/audit";
import { notifyStaff } from "@/lib/products/spendiq/notifications";
import { isValidPaymentMethod } from "@/lib/products/spendiq/constants";

export interface InvoiceActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

async function requireFinance() {
  const user = await getCurrentPrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!prmsCan(user, "invoices.manage")) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/spendiq/invoices");
  revalidatePath("/spendiq");
  if (id) revalidatePath(`/spendiq/invoices/${id}`);
}

export async function saveInvoiceAction(input: Record<string, unknown>, id?: string): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const result = await saveBillRecord(user, input, id);
  if (result.ok) revalidate(result.id);
  return result;
}

export async function uploadInvoiceFileAction(id: string, formData: FormData): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const result = await attachBillFile(user, id, formData);
  if (result.ok) revalidate(id);
  return result;
}

export async function decideInvoiceAction(id: string, status: string): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const result = await decideBill(user, id, status);
  if (result.ok) revalidate(id);
  return result;
}

export async function deleteInvoiceAction(id: string): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const result = await deleteBill(user, id);
  if (result.ok) revalidate(undefined);
  return result;
}

export async function recordPaymentAction(input: Record<string, unknown>): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const method = String(input.method ?? "bank_transfer");
  if (!isValidPaymentMethod(method)) return { ok: false, error: "Unknown payment method." };
  const status = input.status === "scheduled" ? "scheduled" : "processed";
  const data: PaymentWriteData = {
    invoiceId: String(input.invoiceId ?? ""),
    amount: Number(input.amount) || 0,
    paymentDate: String(input.paymentDate ?? new Date().toISOString().slice(0, 10)),
    method,
    transactionReference: (input.transactionReference as string) || null,
    tdsDeducted: Number(input.tdsDeducted) || 0,
    status,
    notes: (input.notes as string) || null,
  };
  const res = await recordPayment(data, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "record", entity: "payment", entityId: res.id!, entityLabel: null, summary: `amount ${data.amount}` });
  const inv = await getInvoice(data.invoiceId);
  if (inv?.status === "paid") {
    await notifyStaff(
      { type: "invoice_paid", title: `Invoice ${inv.invoiceNumber} fully paid`, body: inv.vendorName, link: `/spendiq/invoices/${inv._id}`, dedupeKey: `invoice_paid:${inv._id}` },
      ["super_admin", "prms_admin", "finance"]
    );
  }
  revalidate(data.invoiceId);
  revalidatePath("/spendiq/payments");
  return { ok: true, id: data.invoiceId };
}

export async function processPaymentAction(id: string): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const res = await markPaymentProcessed(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  const p = await getPayment(id);
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "record", entity: "payment", entityId: id, entityLabel: p?.paymentCode, summary: "processed" });
  revalidatePath("/spendiq/payments");
  if (p) revalidate(p.invoiceId);
  return { ok: true, id };
}

export async function deletePaymentAction(id: string): Promise<InvoiceActionResult> {
  const user = await requireFinance();
  const p = await getPayment(id);
  const res = await deletePayment(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "payment", entityId: id, entityLabel: p?.paymentCode });
  revalidatePath("/spendiq/payments");
  if (p) revalidate(p.invoiceId);
  return { ok: true };
}
