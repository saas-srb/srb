"use server";

import { revalidatePath } from "next/cache";
import { requirePortalEmployee } from "@/lib/products/talentos/portal-guard";
import { createLeaveRequest, cancelLeaveRequest, getLeaveRequest, computeLeaveDays } from "@/lib/products/talentos/leave";
import { validateLeaveRequest } from "@/lib/products/talentos/validation-ops";
import { isMonthLocked } from "@/lib/products/talentos/payroll-run";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface PortalLeaveResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function previewMyLeaveDaysAction(input: {
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
}): Promise<{ days: number }> {
  await requirePortalEmployee();
  if (!input.startDate || !input.endDate || input.endDate < input.startDate) return { days: 0 };
  return { days: await computeLeaveDays(input.startDate, input.endDate, input.halfDayStart, input.halfDayEnd) };
}

export async function applyMyLeaveAction(input: Record<string, unknown>): Promise<PortalLeaveResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  // Force the employee id — ignore anything the client sent.
  const v = validateLeaveRequest({ ...input, employeeId });
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (await isMonthLocked(v.data.startDate.slice(0, 7))) {
    return { ok: false, error: "Payroll for that month is finalised — leave can't be filed for it." };
  }

  const result = await createLeaveRequest({ ...v.data, employeeId }, userId);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({
    actorId: userId,
    actorEmail: email,
    action: "create",
    entity: "leave_request",
    entityId: result.request._id,
    summary: `Self-applied ${result.request.days} day(s) ${v.data.leaveTypeCode}`,
  });
  revalidatePath("/talentos/me/leave");
  revalidatePath("/talentos/me");
  return { ok: true };
}

export async function cancelMyLeaveAction(id: string): Promise<PortalLeaveResult> {
  const { employeeId, userId, email } = await requirePortalEmployee();
  const req = await getLeaveRequest(id);
  if (!req || req.employeeId !== employeeId) return { ok: false, error: "Leave request not found." };
  if (req.status !== "pending") return { ok: false, error: "Only a pending request can be withdrawn." };

  const result = await cancelLeaveRequest(id, userId);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({ actorId: userId, actorEmail: email, action: "cancel", entity: "leave_request", entityId: id, summary: "Withdrawn by employee" });
  revalidatePath("/talentos/me/leave");
  revalidatePath("/talentos/me");
  return { ok: true };
}
