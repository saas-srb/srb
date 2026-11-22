"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach, reaches, requireHrAct } from "@/lib/products/talentos/scope";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
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

/** The signed-in person. Every action below then checks the micro feature it needs and whose record it touches (own / reporting line / everyone). */
async function signedIn(): Promise<CurrentHrmsUser> {
  const user = await getCurrentHrmsUser();
  if (!user || user.mustChangePassword) throw new Error("Unauthorized");
  return user;
}

function revalidate(employeeId?: string) {
  revalidatePath("/talentos/leave");
  revalidatePath("/talentos");
  revalidatePath("/talentos/attendance");
  if (employeeId) revalidatePath(`/talentos/employees/${employeeId}`);
}

/** Days a leave would take (a preview for the form): for the person's own leave or for someone they may file for. */
export async function previewLeaveDaysAction(input: {
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
}): Promise<{ days: number }> {
  const user = await signedIn();
  if (!hrCan(user, "leave.apply") && !hrCan(user, "leave.approve")) throw new Error("Forbidden");
  if (!isDateString(input.startDate) || !isDateString(input.endDate) || input.endDate < input.startDate) {
    return { days: 0 };
  }
  return { days: await computeLeaveDays(input.startDate, input.endDate, input.halfDayStart, input.halfDayEnd) };
}

/** Apply for the person's OWN leave (the employee id is forced; anything the client sent is ignored). */
export async function applyMyLeaveAction(input: Record<string, unknown>): Promise<LeaveActionResult> {
  const user = await signedIn();
  if (!hrCan(user, "leave.apply")) throw new Error("Forbidden");
  if (!user.employeeId) throw new Error("Forbidden");
  const employeeId = user.employeeId;
  const v = validateLeaveRequest({ ...input, employeeId });
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  if (await isMonthLocked(v.data.startDate.slice(0, 7))) {
    return { ok: false, error: "Payroll for that month is finalised — leave can't be filed for it." };
  }

  const result = await createLeaveRequest({ ...v.data, employeeId }, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "create",
    entity: "leave_request",
    entityId: result.request._id,
    summary: `Self-applied ${result.request.days} day(s) ${v.data.leaveTypeCode}`,
  });
  revalidate(employeeId);
  return { ok: true };
}

/** File leave on behalf of someone in the person's scope (their reporting line, or everyone). */
export async function fileLeaveAction(input: Record<string, unknown>): Promise<LeaveActionResult> {
  const user = await signedIn();
  const v = validateLeaveRequest(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };
  try { await requireHrAct(user, "leave", "leave.approve", v.data.employeeId); } catch { return { ok: false, error: "That employee is outside your reporting line." }; }
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
  const user = await signedIn();
  if (!hrCan(user, "leave.approve")) throw new Error("Forbidden");
  const req = await getLeaveRequest(id);
  if (!req) return { ok: false, error: "Leave request not found." };
  // Only people in the person's scope (their reporting line, or everyone) are decided.
  if (!reaches(await hrReach(user, "leave"), req.employeeId)) return { ok: false, error: "That request is outside your reporting line." };
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

/** Withdraw the person's own pending request. */
export async function cancelMyLeaveAction(id: string): Promise<LeaveActionResult> {
  const user = await signedIn();
  if (!hrCan(user, "leave.apply")) throw new Error("Forbidden");
  const req = await getLeaveRequest(id);
  if (!req || !user.employeeId || req.employeeId !== user.employeeId) return { ok: false, error: "Leave request not found." };
  if (req.status !== "pending") return { ok: false, error: "Only a pending request can be withdrawn." };

  const result = await cancelLeaveRequest(id, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "cancel", entity: "leave_request", entityId: id, summary: "Withdrawn by employee" });
  revalidate(req.employeeId);
  return { ok: true };
}

/** Cancel a request of someone in the person's scope. */
export async function cancelLeaveAction(id: string): Promise<LeaveActionResult> {
  const user = await signedIn();
  if (!hrCan(user, "leave.approve")) throw new Error("Forbidden");
  const req = await getLeaveRequest(id);
  if (!req) return { ok: false, error: "Leave request not found." };
  if (!reaches(await hrReach(user, "leave"), req.employeeId)) return { ok: false, error: "That request is outside your reporting line." };

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

/** Change an employee's yearly allocation (the same right as editing employees). */
export async function setLeaveAllocationAction(
  employeeId: string,
  leaveTypeCode: string,
  year: number,
  allocated: number
): Promise<LeaveActionResult> {
  const user = await signedIn();
  if (!hrCan(user, "employees.manage")) throw new Error("Forbidden");

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
