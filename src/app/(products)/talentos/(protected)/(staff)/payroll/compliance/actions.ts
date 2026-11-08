"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser } from "@/lib/hrms-auth";
import { canRunPayroll } from "@/lib/hrms-roles";
import { recordAudit } from "@/lib/products/talentos/audit";
import { deletePayment, recordPayment, validatePayment } from "@/lib/products/talentos/statutory-dues";

export interface DueResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requirePayroll() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canRunPayroll(user)) throw new Error("Forbidden");
  return user;
}

export async function recordPaymentAction(input: Record<string, unknown>): Promise<DueResult> {
  const user = await requirePayroll();
  const v = validatePayment(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  const r = await recordPayment(v.data, user.id);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "create", entity: "statutory_payment", entityId: r.id, entityLabel: `${v.data.kind.toUpperCase()} ${v.data.month}`, summary: `₹${v.data.amount} on ${v.data.paidOn}, ref ${v.data.reference}` });
  revalidatePath("/talentos/payroll/compliance");
  return { ok: true };
}

export async function deletePaymentAction(id: string): Promise<DueResult> {
  const user = await requirePayroll();
  const r = await deletePayment(id, user.id);
  if (!r.ok) return { ok: false, error: r.error ?? "Payment not found." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "statutory_payment", entityId: id, entityLabel: r.month });
  revalidatePath("/talentos/payroll/compliance");
  return { ok: true };
}
