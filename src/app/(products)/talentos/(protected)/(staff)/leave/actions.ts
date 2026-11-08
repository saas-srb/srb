"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { canApproveLeave, canViewAllEmployees, canManageEmployees } from "@/lib/hrms-roles";
import { descendantEmployeeIds, getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import {
  createLeaveRequest,
  decideLeaveRequest,
  cancelLeaveRequest,
  getLeaveRequest,
  computeLeaveDays,
  setAllocation,
} from "@/lib/products/talentos/leave";
import { validateLeaveRequest } from "@/lib/products/talentos/validation-ops";
import { isDateString } from "@/lib/products/talentos/settings";
import { isMonthLocked } from "@/lib/products/talentos/payroll-run";
import { recordAudit } from "@/lib/products/talentos/audit";

export interface LeaveActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireLeave() {
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

function revalidate(employeeId?: string) {
  revalidatePath("/talentos/leave");
  revalidatePath("/talentos");
  revalidatePath("/talentos/attendance");
  if (employeeId) revalidatePath(`/talentos/employees/${employeeId}`);
}

export async function previewLeaveDaysAction(input: {
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
}): Promise<{ days: number }> {
  await requireLeave();
  if (!isDateString(input.startDate) || !isDateString(input.endDate) || input.endDate < input.startDate) {
    return { days: 0 };
  }
  const days = await computeLeaveDays(input.startDate, input.endDate, input.halfDayStart, input.halfDayEnd);
  return { days };
}

export async function fileLeaveAction(input: Record<string, unknown>): Promise<LeaveActionResult> {
  const user = await requireLeave();
  const v = validateLeaveRequest(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  if (!(await inScope(user, v.data.employeeId))) return { ok: false, error: "That employee is outside your reporting line." };
  if (await isMonthLocked(v.data.startDate.slice(0, 7))) {
    return { ok: false, error: "Payroll for that month is finalised — leave can't be filed for it." };
  }

  const result = await createLeaveRequest(v.data, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  const emp = await getEmployee(v.data.employeeId);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "leave_request",
    entityId: result.request._id,
    entityLabel: emp ? `${employeeFullName(emp)} · ${v.data.leaveTypeCode}` : v.data.leaveTypeCode,
    summary: `${result.request.days} day(s), ${v.data.startDate} → ${v.data.endDate}`,
  });

  revalidate(v.data.employeeId);
  return { ok: true };
}

export async function decideLeaveAction(id: string, decision: "approved" | "rejected", note: string): Promise<LeaveActionResult> {
  const user = await requireLeave();
  const req = await getLeaveRequest(id);
  if (!req) return { ok: false, error: "Leave request not found." };
  if (!(await inScope(user, req.employeeId))) return { ok: false, error: "That request is outside your reporting line." };
  if (decision === "approved" && (await isMonthLocked(req.startDate.slice(0, 7)))) {
    return { ok: false, error: "Payroll for that month is finalised — this leave can no longer be approved." };
  }

  const result = await decideLeaveRequest(id, decision, note.trim() || null, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  const emp = await getEmployee(req.employeeId);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: decision === "approved" ? "approve" : "reject",
    entity: "leave_request",
    entityId: id,
    entityLabel: emp ? `${employeeFullName(emp)} · ${req.leaveTypeCode}` : req.leaveTypeCode,
    summary: note.trim() ? `${decision}: ${note.trim()}` : decision,
  });

  revalidate(req.employeeId);
  return { ok: true };
}

export async function cancelLeaveAction(id: string): Promise<LeaveActionResult> {
  const user = await requireLeave();
  const req = await getLeaveRequest(id);
  if (!req) return { ok: false, error: "Leave request not found." };
  if (!(await inScope(user, req.employeeId))) return { ok: false, error: "That request is outside your reporting line." };

  const result = await cancelLeaveRequest(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "cancel",
    entity: "leave_request",
    entityId: id,
    summary: "Leave request cancelled",
  });

  revalidate(req.employeeId);
  return { ok: true };
}

export async function setLeaveAllocationAction(
  employeeId: string,
  leaveTypeCode: string,
  year: number,
  allocated: number
): Promise<LeaveActionResult> {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageEmployees(user)) throw new Error("Forbidden");

  if (!Number.isFinite(allocated) || allocated < 0 || allocated > 365) return { ok: false, error: "Enter an allocation between 0 and 365." };

  await setAllocation(employeeId, leaveTypeCode, year, allocated, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "leave_request",
    entityId: `${employeeId}:${leaveTypeCode}:${year}`,
    summary: `allocation → ${allocated} (${leaveTypeCode} ${year})`,
  });

  revalidate(employeeId);
  return { ok: true };
}
