"use server";

import { revalidatePath } from "next/cache";
import { getCurrentFmsUser } from "@/lib/fms-auth";
import { canManageTransactions, canApproveTransactions } from "@/lib/fms-roles";
import { createDebitNote, issueDebitNote, cancelDebitNote, getDebitNote, type DebitNoteWriteData } from "@/lib/products/cashflow-ai/debit-notes";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";

export interface DebitNoteActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
}

function revalidate(billId?: string) {
  revalidatePath("/cashflow-ai/debit-notes");
  revalidatePath("/cashflow-ai/bills");
  revalidatePath("/cashflow-ai/vendors");
  revalidatePath("/cashflow-ai/payables");
  revalidatePath("/cashflow-ai");
  if (billId) revalidatePath(`/cashflow-ai/bills/${billId}`);
}

export async function createDebitNoteAction(input: Record<string, unknown>): Promise<DebitNoteActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageTransactions(user)) throw new Error("Forbidden");

  const billId = String(input.billId ?? "");
  const amount = Number(input.amount);
  if (!billId) return { ok: false, fieldErrors: { billId: "Select a bill." } };
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, fieldErrors: { amount: "Enter a debit amount." } };
  const reason = String(input.reason ?? "").trim();
  if (!reason) return { ok: false, fieldErrors: { reason: "Enter a reason." } };

  const data: DebitNoteWriteData = { billId, amount, reason };
  const created = await createDebitNote(data, user.id);
  if (!created.ok) return { ok: false, error: created.reason };

  const issued = await issueDebitNote(created.note._id, user.id);
  if (!issued.ok) return { ok: false, error: issued.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "approve",
    entity: "debit_note",
    entityId: created.note._id,
    entityLabel: created.note.debitNoteNumber,
    summary: `issued ${amount} against ${created.note.billNumber}`,
  });
  revalidate(billId);
  return { ok: true, id: created.note._id };
}

export async function cancelDebitNoteAction(id: string): Promise<DebitNoteActionResult> {
  const user = await getCurrentFmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canApproveTransactions(user)) throw new Error("Forbidden");

  const before = await getDebitNote(id);
  const res = await cancelDebitNote(id, user.id);
  if (!res.ok) return { ok: false, error: res.reason };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "reverse", entity: "debit_note", entityId: id, entityLabel: before?.debitNoteNumber });
  revalidate(before?.billId);
  return { ok: true };
}
