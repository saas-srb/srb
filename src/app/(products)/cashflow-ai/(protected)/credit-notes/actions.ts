"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canApproveTransactions } from "@/lib/fms-roles";
import { createCreditNote, issueCreditNote, cancelCreditNote, getCreditNote, type CreditNoteWriteData } from "@/lib/products/cashflow-ai/credit-notes";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface CreditNoteActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(invoiceId?: string) {
  revalidatePath("/cashflow-ai/credit-notes");
  revalidatePath("/cashflow-ai/invoices");
  revalidatePath("/cashflow-ai/receivables");
  revalidatePath("/cashflow-ai");
  if (invoiceId) revalidatePath(`/cashflow-ai/invoices/${invoiceId}`);
}

export async function createCreditNoteAction(input: Record<string, unknown>): Promise<CreditNoteActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const invoiceId = String(input.invoiceId ?? "");
  const amount = Number(input.amount);
  if (!invoiceId) return { ok: false, fieldErrors: { invoiceId: "Select an invoice." } };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a credit amount." } };
  const reason = String(input.reason ?? "").trim();
  if (!reason) return { ok: false, fieldErrors: { reason: "Enter a reason." } };

  const data: CreditNoteWriteData = { invoiceId, amount, reason };
  const created = await createCreditNote(data, user.id);
  if (!created.ok) return { ok: false, error: created.reason };

  // Issue immediately — a credit note created through this form is already a
  // decided correction, not a draft awaiting a separate review step.
  const issued = await issueCreditNote(created.note._id, user.id);
  if (!issued.ok) return { ok: false, error: issued.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "approve",
    entity: "credit_note",
    entityId: created.note._id,
    entityLabel: created.note.creditNoteNumber,
    summary: `issued ${amount} against ${created.note.invoiceNumber}`,
  });
  revalidate(invoiceId);
  return { ok: true, id: created.note._id };
}

export async function cancelCreditNoteAction(id: string): Promise<CreditNoteActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canApproveTransactions(user)) throw new Error("Forbidden");

  const before = await getCreditNote(id);
  const res = await cancelCreditNote(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "reverse", entity: "credit_note", entityId: id, entityLabel: before?.creditNoteNumber });
  revalidate(before?.invoiceId);
  return { ok: true };
}
