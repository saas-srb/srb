"use server";

import { revalidatePath } from "next/cache";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { issueSaasCreditNote, markSaasInvoicePaid, voidSaasInvoice, type InvoiceActionResult } from "@/lib/platform/billing/invoices";

/** All three are audited inside the billing layer (`invoice.mark_paid`, `invoice.void`, `invoice.credit_note`). */

export async function markInvoicePaidAction(id: string, paymentRef: string): Promise<InvoiceActionResult> {
  const user = await requirePlatformPermission("invoices.manage");
  const res = await markSaasInvoicePaid(String(id), { paymentRef: String(paymentRef ?? ""), actorId: user.id });
  if (res.ok) revalidatePath("/console/invoices", "layout");
  return res;
}

export async function voidInvoiceAction(id: string, reason: string): Promise<InvoiceActionResult> {
  const user = await requirePlatformPermission("invoices.manage");
  const res = await voidSaasInvoice(String(id), { reason: String(reason ?? ""), actorId: user.id });
  if (res.ok) revalidatePath("/console/invoices", "layout");
  return res;
}

/** `amountRupees` blank = credit everything not yet credited. */
export async function creditNoteAction(id: string, amountRupees: string, reason: string): Promise<InvoiceActionResult<{ id: string; number: string }>> {
  const user = await requirePlatformPermission("invoices.manage");
  const raw = String(amountRupees ?? "").replace(/[,\s₹]/g, "");
  let amount: number | null = null;
  if (raw) {
    if (!/^\d+(\.\d{1,2})?$/.test(raw)) return { ok: false, error: "Enter an amount in rupees, e.g. 1180 or 1180.50." };
    amount = Math.round(Number(raw) * 100);
  }
  const res = await issueSaasCreditNote({ invoiceId: String(id), amount, reason: String(reason ?? ""), actorId: user.id });
  if (!res.ok) return res;
  revalidatePath("/console/invoices", "layout");
  return { ok: true, id: res.creditNote.id, number: res.creditNote.number };
}
