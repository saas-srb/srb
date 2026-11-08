"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspaceAction } from "@/lib/products/commandos/access";
import { deletePaymentPlan, getPaymentPlan } from "@/lib/products/cohort-ai/payments";
import { recordAudit } from "@/lib/products/cohort-ai/audit";

function revalidate() {
  revalidatePath("/commandos/tms/payments");
}

export async function deletePaymentPlanAction(id: string): Promise<{ ok: boolean }> {
  const admin = await requireWorkspaceAction("manage.tms.payments");
  const before = await getPaymentPlan(id);
  const ok = await deletePaymentPlan(id, admin.id);
  if (ok) {
    await recordAudit({
      actorId: admin.id,
      actorEmail: admin.email,
      action: "delete",
      entity: "payment",
      entityId: id,
      entityLabel: before ? `Plan for student ${before.studentId}` : null,
    });
  }
  revalidate();
  return { ok };
}

export async function bulkDeletePaymentPlansAction(ids: string[]): Promise<{ deleted: number }> {
  const admin = await requireWorkspaceAction("manage.tms.payments");
  let deleted = 0;
  for (const id of ids) {
    const ok = await deletePaymentPlan(id, admin.id);
    if (ok) deleted += 1;
  }
  revalidate();
  return { deleted };
}
