"use server";

import { revalidatePath } from "next/cache";
import { getCurrentTmsUser } from "@/lib/tms-auth";
import { canManagePayments } from "@/lib/tms-roles";
import {
  createPaymentPlan,
  updatePaymentPlan,
  deletePaymentPlan,
  getPaymentPlan,
  addInstallment,
  removeInstallment,
} from "@/lib/products/cohort-ai/payments";
import { getStudent } from "@/lib/products/cohort-ai/students";
import { getProgram } from "@/lib/products/cohort-ai/programs";
import { validatePaymentPlan, validateInstallment } from "@/lib/products/cohort-ai/validation";
import { recordAudit } from "@/lib/products/cohort-ai/audit";
import { notifyStudent } from "@/lib/products/cohort-ai/notifications";

export interface PaymentActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  id?: string;
  invoiceNumber?: string;
}

async function requireManage() {
  const user = await getCurrentTmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManagePayments(user)) throw new Error("Forbidden");
  return user;
}

function revalidate(id?: string) {
  revalidatePath("/cohort-ai/payments");
  revalidatePath("/cohort-ai/me/payments");
  revalidatePath("/cohort-ai");
  if (id) revalidatePath(`/cohort-ai/payments/${id}`);
}

export async function savePaymentPlanAction(
  input: Record<string, unknown>,
  id?: string
): Promise<PaymentActionResult> {
  const user = await requireManage();
  const v = validatePaymentPlan(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (id) {
    const before = await getPaymentPlan(id);
    if (!before) return { ok: false, error: "Payment plan not found." };
    await updatePaymentPlan(id, { totalFees: v.data.totalFees, discount: v.data.discount, notes: v.data.notes, currency: v.data.currency }, user.id);
    await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "payment", entityId: id, entityLabel: null, summary: `fees ${before.totalFees} → ${v.data.totalFees}` });
    revalidate(id);
    return { ok: true, id };
  }

  const [student, program] = await Promise.all([getStudent(v.data.studentId), getProgram(v.data.programId)]);
  if (!student) return { ok: false, fieldErrors: { studentId: "Student not found." } };
  if (!program) return { ok: false, fieldErrors: { programId: "Program not found." } };

  const plan = await createPaymentPlan(v.data, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "payment",
    entityId: plan._id,
    entityLabel: `${student.fullName} · ${program.name}`,
    summary: `fees ${plan.totalFees} ${plan.currency}`,
  });
  revalidate(plan._id);
  return { ok: true, id: plan._id };
}

export async function addInstallmentAction(
  planId: string,
  input: Record<string, unknown>
): Promise<PaymentActionResult> {
  const user = await requireManage();
  const v = validateInstallment(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = await addInstallment(planId, v.data, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  const plan = await getPaymentPlan(planId);
  if (plan) {
    await notifyStudent(plan.studentId, {
      type: "payment_recorded",
      title: "Payment received",
      body: `${v.data.amount} ${plan.currency} · receipt ${result.invoiceNumber}`,
      link: "/cohort-ai/me/payments",
      dedupeKey: `payment_recorded:${result.invoiceNumber}`,
    });
  }

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "record",
    entity: "payment",
    entityId: planId,
    entityLabel: result.invoiceNumber,
    summary: `${v.data.amount} received via ${v.data.method}`,
  });
  revalidate(planId);
  return { ok: true, id: planId, invoiceNumber: result.invoiceNumber };
}

export async function removeInstallmentAction(planId: string, installmentId: string): Promise<PaymentActionResult> {
  const user = await requireManage();
  const ok = await removeInstallment(planId, installmentId, user.id);
  if (!ok) return { ok: false, error: "Could not remove that payment." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "update", entity: "payment", entityId: planId, entityLabel: null, summary: "installment removed" });
  revalidate(planId);
  return { ok: true, id: planId };
}

export async function deletePaymentPlanAction(id: string): Promise<PaymentActionResult> {
  const user = await requireManage();
  const ok = await deletePaymentPlan(id, user.id);
  if (!ok) return { ok: false, error: "Could not delete." };
  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "delete", entity: "payment", entityId: id, entityLabel: null });
  revalidate(id);
  return { ok: true };
}
