"use server";

import { revalidatePath } from "next/cache";
import { getCurrentHrmsUser, type CurrentHrmsUser } from "@/lib/hrms-auth";
import { hrCan } from "@/lib/talentos-access";
import { hrReach, reaches } from "@/lib/products/talentos/scope";
import { getEmployee, employeeFullName } from "@/lib/products/talentos/employees";
import {
  recordAttendance,
  bulkMarkAttendance,
  isValidAttendanceStatus,
  type AttendanceStatus,
} from "@/lib/products/talentos/attendance";
import { clockIn, clockOut } from "@/lib/products/talentos/self-service";
import { validateAttendanceEntry } from "@/lib/products/talentos/validation-ops";
import { isDateString, getOrgSettings } from "@/lib/products/talentos/settings";
import { nowInOrgTz } from "@/lib/products/talentos/time";
import { isMonthLocked } from "@/lib/products/talentos/payroll-run";
import { recordAudit } from "@/lib/products/talentos/audit";
import { MANUAL_ATTENDANCE_STATUSES } from "@/lib/products/talentos/attendance";

export interface AttendanceActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

export interface ClockResult {
  ok: boolean;
  time?: string;
  error?: string;
}

async function signedIn(): Promise<CurrentHrmsUser> {
  const user = await getCurrentHrmsUser();
  if (!user || user.mustChangePassword) throw new Error("Unauthorized");
  return user;
}

/** The person who records attendance for others: holds attendance.manage; whom they may record for is checked per employee (their reporting line, or everyone). */
async function requireAttendance() {
  const user = await signedIn();
  if (!hrCan(user, "attendance.manage")) throw new Error("Forbidden");
  return user;
}

function revalidate() {
  revalidatePath("/talentos/attendance");
  revalidatePath("/talentos");
}

async function assertUnlocked(): Promise<string | null> {
  const { date } = nowInOrgTz((await getOrgSettings()).timezone);
  if (await isMonthLocked(date.slice(0, 7))) return "Payroll for this month is finalised — attendance is locked.";
  return null;
}

/** The person's own check-in (the employee id always comes from the session, never from the client). */
export async function clockInAction(): Promise<ClockResult> {
  const user = await signedIn();
  if (!hrCan(user, "attendance.punch") || !user.employeeId) throw new Error("Forbidden");
  const locked = await assertUnlocked();
  if (locked) return { ok: false, error: locked };

  const result = await clockIn(user.employeeId);
  if (!result.ok) return result;

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "clock_in", entity: "attendance", entityId: user.employeeId, summary: `Clocked in ${result.time}` });
  revalidatePath("/talentos");
  revalidatePath("/talentos/attendance");
  return result;
}

export async function clockOutAction(): Promise<ClockResult> {
  const user = await signedIn();
  if (!hrCan(user, "attendance.punch") || !user.employeeId) throw new Error("Forbidden");
  const locked = await assertUnlocked();
  if (locked) return { ok: false, error: locked };

  const result = await clockOut(user.employeeId);
  if (!result.ok) return result;

  await recordAudit({ actorId: user.id, actorEmail: user.email, action: "clock_out", entity: "attendance", entityId: user.employeeId, summary: `Clocked out ${result.time}` });
  revalidatePath("/talentos");
  revalidatePath("/talentos/attendance");
  return result;
}

export async function recordAttendanceAction(
  employeeId: string,
  date: string,
  input: Record<string, unknown>
): Promise<AttendanceActionResult> {
  const user = await requireAttendance();
  if (!isDateString(date)) return { ok: false, error: "Invalid date." };
  if (await isMonthLocked(date.slice(0, 7))) return { ok: false, error: "Payroll for this month is finalised — attendance is locked." };
  if (!reaches(await hrReach(user, "attendance"), employeeId)) return { ok: false, error: "That employee is outside your reporting line." };

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

  const reach = await hrReach(user, "attendance");
  const scoped = employeeIds.filter((id) => reaches(reach, id));
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
