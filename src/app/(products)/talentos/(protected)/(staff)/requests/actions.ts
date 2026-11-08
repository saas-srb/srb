"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { canApproveLeave, canViewAllEmployees } from "@/lib/hrms-roles";
import { descendantEmployeeIds } from "@/lib/products/talentos/employees";
import { paymentGate } from "@/lib/products/cashflow-ai/payment-guard";
import { recordAudit } from "@/lib/products/talentos/audit";
import { decideRequest, getRequest } from "@/lib/products/talentos/work-requests";

export interface DecideResult {
  ok: boolean;
  error?: string;
}

async function requireApprover() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canApproveLeave(user)) throw new Error("Forbidden");
  return user;
}

async function inScope(user: CurrentHrmsUser, employeeId: string): Promise<boolean> {
  if (canViewAllEmployees(user)) return true;
  if (!user.employeeId) return false;
  return (await descendantEmployeeIds(user.employeeId)).includes(employeeId);
}

export async function decideRequestAction(id: string, decision: "approved" | "rejected", note: string, opts: { approvedAmount?: number; payMonth?: string; payNow?: boolean; code?: string } = {}): Promise<DecideResult> {
  const user = await requireApprover();
  if (decision === "approved" && opts.payNow) {
    const blocked = await paymentGate(user.id, opts.code);
    if (blocked) return { ok: false, error: blocked };
  }
  const req = await getRequest(id);
  if (!req) return { ok: false, error: "Request not found." };
  if (!(await inScope(user, req.employeeId))) return { ok: false, error: "That request is outside your reporting line." };
  // Nobody approves their own request, whatever their role.
  if (user.employeeId && user.employeeId === req.employeeId) return { ok: false, error: "You cannot decide your own request. Ask another approver." };
  if (decision === "rejected" && !note.trim()) return { ok: false, error: "Say why it is rejected, so the employee knows." };

  const r = await decideRequest(id, decision, note.trim() || null, user.id, opts);
  if (!r.ok) return { ok: false, error: r.error };
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: decision === "approved" ? "approve" : "reject",
    entity: "work_request",
    entityId: id,
    entityLabel: req.kind,
    summary: decision === "approved" && req.kind === "expense" ? `approved ₹${r.request.approvedAmount} of ₹${req.amount}` : decision,
  });
  revalidatePath("/talentos/requests");
  revalidatePath("/talentos/me/requests");
  revalidatePath("/talentos/payroll/items");
  return { ok: true };
}
