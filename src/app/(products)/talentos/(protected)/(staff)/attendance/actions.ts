"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { canManageAttendance, canViewAllEmployees } from "@/lib/hrms-roles";
import { getEmployee, descendantEmployeeIds, employeeFullName } from "@/lib/products/talentos/employees";
import {
  recordAttendance,
  bulkMarkAttendance,
  isValidAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/products/talentos/attendance";
import { validateAttendanceEntry } from "@/lib/products/talentos/validation-ops";
import { isDateString } from "@/lib/products/talentos/settings";
import { isMonthLocked } from "@/lib/products/talentos/payroll-run";
import { recordAudit } from "@/lib/products/talentos/audit";
import { MANUAL_ATTENDANCE_STATUSES } from "@/lib/products/talentos/attendance";

export interface AttendanceActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

async function requireAttendance() {
  const user = await getCurrentHrmsUser();
  if (!user) throw new Error("Unauthorized");
  if (!canManageAttendance(user)) throw new Error("Forbidden");
  return user;
}

/** For managers, confirm the employee is inside their reporting line. */
async function assertInScope(user: CurrentHrmsUser, employeeId: string): Promise<boolean> {
  if (canViewAllEmployees(user)) return true;
  if (!user.employeeId) return false;
  const ids = await descendantEmployeeIds(user.employeeId);
  return ids.includes(employeeId);
}

function revalidate() {
  revalidatePath("/talentos/attendance");
  revalidatePath("/talentos");
}

export async function recordAttendanceAction(
  employeeId: string,
  date: string,
  input: Record<string, unknown>
): Promise<AttendanceActionResult> {
  const user = await requireAttendance();
  if (!isDateString(date)) return { ok: false, error: "Invalid date." };
  if (await isMonthLocked(date.slice(0, 7))) return { ok: false, error: "Payroll for this month is finalised — attendance is locked." };
  if (!(await assertInScope(user, employeeId))) return { ok: false, error: "That employee is outside your reporting line." };

  const v = validateAttendanceEntry(input);
  if (!v.valid) return { ok: false, fieldErrors: v.errors };

  const result = await recordAttendance(employeeId, date, v.data, user.id);
  if (!result.ok) return { ok: false, error: result.reason };

  const emp = await getEmployee(employeeId);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "update",
    entity: "attendance",
    entityId: result.record._id,
    entityLabel: emp ? `${employeeFullName(emp)} · ${date}` : date,
    summary: `${v.data.status}${v.data.checkIn ? ` in ${v.data.checkIn}` : ""}${v.data.checkOut ? ` out ${v.data.checkOut}` : ""}${result.record.isLate ? ` (late ${result.record.lateByMinutes}m)` : ""}`,
  });

  revalidate();
  return { ok: true };
}

export async function bulkMarkAttendanceAction(
  date: string,
  employeeIds: string[],
  status: string
): Promise<AttendanceActionResult & { marked?: number }> {
  const user = await requireAttendance();
  if (!isDateString(date)) return { ok: false, error: "Invalid date." };
  if (await isMonthLocked(date.slice(0, 7))) return { ok: false, error: "Payroll for this month is finalised — attendance is locked." };
  if (!isValidAttendanceStatus(status) || !MANUAL_ATTENDANCE_STATUSES.includes(status as AttendanceStatus)) {
    return { ok: false, error: "Pick Present, Half Day or Absent." };
  }

  const scoped: string[] = [];
  for (const id of employeeIds) {
    if (await assertInScope(user, id)) scoped.push(id);
  }
  if (scoped.length === 0) return { ok: false, error: "No in-scope employees selected." };

  const marked = await bulkMarkAttendance(date, scoped, status as AttendanceStatus, user.id);
  await recordAudit({
    actorId: user.id,
    actorEmail: user.email,
    action: "bulk_mark",
    entity: "attendance",
    entityId: date,
    entityLabel: `${date} · ${marked} employee(s)`,
    summary: `bulk-marked ${status}`,
  });

  revalidate();
  return { ok: true, marked };
}
