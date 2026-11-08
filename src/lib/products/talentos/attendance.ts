import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import {
  getOrgSettings,
  classifyDay,
  parseHHmm,
  eachDateString,
  monthBounds,
  todayDateString,
  type OrgSettings,
} from "@/lib/products/talentos/settings";
import { holidaySetInRange } from "@/lib/products/talentos/holidays";
import { EMPLOYEES_COLLECTION, descendantEmployeeIds, employeeFullName, type Employee } from "@/lib/products/talentos/employees";
import { ACTIVE_EMPLOYEE_STATUSES } from "@/lib/products/talentos/employee-status";

export const ATTENDANCE_COLLECTION = "hrms_attendance";
export const ATTENDANCE_LOGS_COLLECTION = "hrms_attendance_logs";

export {
  ATTENDANCE_STATUSES,
  isValidAttendanceStatus,
  getAttendanceStatusMeta,
  MANUAL_ATTENDANCE_STATUSES,
} from "@/lib/products/talentos/attendance-status";
import type { AttendanceStatus } from "@/lib/products/talentos/attendance-status";
export type { AttendanceStatus };

export interface AttendanceRecord extends AuditFields {
  _id: string;
  employeeId: string;
  date: string; // "yyyy-mm-dd"
  status: AttendanceStatus;
  checkIn: string | null; // "HH:mm"
  checkOut: string | null;
  breakMinutes: number;
  workedMinutes: number;
  isLate: boolean;
  lateByMinutes: number;
  isEarlyDeparture: boolean;
  earlyByMinutes: number;
  source: "manual" | "bulk" | "leave" | "auto" | "self";
  leaveRequestId: string | null;
  note: string | null;
}

export interface SerializedAttendanceRecord extends Omit<AttendanceRecord, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<AttendanceRecord>(ATTENDANCE_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ employeeId: 1, date: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ date: 1 }).catch(() => {}),
      collection.createIndex({ leaveRequestId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

interface AttendanceLog {
  _id: string;
  attendanceId: string;
  employeeId: string;
  date: string;
  type: "in" | "out" | "break" | "correction";
  time: string | null;
  by: string;
  note: string | null;
  at: Date;
}

async function appendLog(entry: Omit<AttendanceLog, "_id" | "at" | "note"> & { note?: string | null }) {
  const db = await getDb();
  await db.collection<AttendanceLog>(ATTENDANCE_LOGS_COLLECTION).insertOne({
    _id: newId(),
    ...entry,
    note: entry.note ?? null,
    at: new Date(),
  });
}

export function serializeAttendance(r: AttendanceRecord): SerializedAttendanceRecord {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

interface DerivedTimes {
  workedMinutes: number;
  isLate: boolean;
  lateByMinutes: number;
  isEarlyDeparture: boolean;
  earlyByMinutes: number;
  autoStatus: AttendanceStatus | null;
}

function derive(
  checkIn: string | null,
  checkOut: string | null,
  breakMinutes: number,
  settings: OrgSettings
): DerivedTimes {
  let workedMinutes = 0;
  let isLate = false;
  let lateByMinutes = 0;
  let isEarlyDeparture = false;
  let earlyByMinutes = 0;

  if (checkIn && checkOut) {
    workedMinutes = Math.max(0, parseHHmm(checkOut) - parseHHmm(checkIn) - Math.max(0, breakMinutes));
  }
  if (checkIn) {
    const lateThreshold = parseHHmm(settings.shiftStart) + settings.graceMinutes;
    const diff = parseHHmm(checkIn) - lateThreshold;
    if (diff > 0) {
      isLate = true;
      lateByMinutes = diff;
    }
  }
  if (checkOut) {
    const earlyThreshold = parseHHmm(settings.shiftEnd) - settings.earlyDepartureMinutes;
    const diff = earlyThreshold - parseHHmm(checkOut);
    if (diff > 0) {
      isEarlyDeparture = true;
      earlyByMinutes = diff;
    }
  }

  let autoStatus: AttendanceStatus | null = null;
  if (checkIn && checkOut) {
    const hours = workedMinutes / 60;
    autoStatus = hours >= settings.fullDayHours ? "present" : "half_day";
  }
  return { workedMinutes, isLate, lateByMinutes, isEarlyDeparture, earlyByMinutes, autoStatus };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface RecordAttendanceInput {
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number;
  note: string | null;
}

export async function recordAttendance(
  employeeId: string,
  date: string,
  input: RecordAttendanceInput,
  actorId: string
): Promise<{ ok: true; record: AttendanceRecord } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ employeeId, date });
  if (existing && existing.source === "leave") {
    return { ok: false, reason: "This day is covered by an approved leave. Cancel the leave to edit attendance." };
  }

  const settings = await getOrgSettings();
  const breakMinutes = Math.max(0, Math.round(input.breakMinutes || 0));
  const d = derive(input.checkIn, input.checkOut, breakMinutes, settings);

  // If the user picked "present"/"half_day" but times imply otherwise, trust the
  // explicit choice for status but keep the derived late/early/worked figures.
  let status = input.status;
  if (status === "present" && d.autoStatus === "half_day") status = "half_day";

  const now = new Date();
  const base = {
    employeeId,
    date,
    status,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    breakMinutes,
    workedMinutes: d.workedMinutes,
    isLate: d.isLate,
    lateByMinutes: d.lateByMinutes,
    isEarlyDeparture: d.isEarlyDeparture,
    earlyByMinutes: d.earlyByMinutes,
    source: "manual" as const,
    leaveRequestId: null,
    note: input.note,
    updatedAt: now,
    updatedBy: actorId,
  };

  let record: AttendanceRecord;
  if (existing) {
    record = { ...existing, ...base };
    await collection.updateOne({ _id: existing._id }, { $set: base });
  } else {
    record = { _id: newId(), ...base, ...createStamp(actorId) };
    await collection.insertOne(record);
  }

  await appendLog({
    attendanceId: record._id,
    employeeId,
    date,
    type: existing ? "correction" : input.checkIn ? "in" : "correction",
    time: input.checkIn ?? input.checkOut ?? null,
    by: actorId,
    note: input.note,
  });

  return { ok: true, record };
}

export async function bulkMarkAttendance(
  date: string,
  employeeIds: string[],
  status: AttendanceStatus,
  actorId: string
): Promise<number> {
  const collection = await getCollection();
  let count = 0;
  for (const employeeId of employeeIds) {
    const existing = await collection.findOne({ employeeId, date });
    if (existing && existing.source === "leave") continue;
    const now = new Date();
    const base = {
      employeeId,
      date,
      status,
      checkIn: null,
      checkOut: null,
      breakMinutes: 0,
      workedMinutes: 0,
      isLate: false,
      lateByMinutes: 0,
      isEarlyDeparture: false,
      earlyByMinutes: 0,
      source: "bulk" as const,
      leaveRequestId: null,
      note: null,
      updatedAt: now,
      updatedBy: actorId,
    };
    if (existing) await collection.updateOne({ _id: existing._id }, { $set: base });
    else await collection.insertOne({ _id: newId(), ...base, ...createStamp(actorId) });
    count += 1;
  }
  return count;
}

/** Called by leave approval — writes `on_leave` rows for working days in the span. */
export async function writeLeaveAttendance(
  employeeId: string,
  startDate: string,
  endDate: string,
  leaveRequestId: string,
  actorId: string
): Promise<void> {
  const collection = await getCollection();
  const settings = await getOrgSettings();
  const holidaySet = await holidaySetInRange(startDate, endDate);
  for (const date of eachDateString(startDate, endDate)) {
    if (classifyDay(date, settings, holidaySet) !== "working") continue;
    const now = new Date();
    const base = {
      employeeId,
      date,
      status: "on_leave" as const,
      checkIn: null,
      checkOut: null,
      breakMinutes: 0,
      workedMinutes: 0,
      isLate: false,
      lateByMinutes: 0,
      isEarlyDeparture: false,
      earlyByMinutes: 0,
      source: "leave" as const,
      leaveRequestId,
      note: null,
      updatedAt: now,
      updatedBy: actorId,
    };
    await collection.updateOne(
      { employeeId, date },
      { $set: base, $setOnInsert: { _id: newId(), createdAt: now, createdBy: actorId, deletedAt: null } },
      { upsert: true }
    );
  }
}

/** Called by leave cancellation — removes rows this leave generated. */
export async function clearLeaveAttendance(leaveRequestId: string): Promise<void> {
  const collection = await getCollection();
  await collection.deleteMany({ leaveRequestId, source: "leave" });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function inScopeEmployees(opts: {
  departmentId?: string;
  restrictToManagerId?: string;
}): Promise<Employee[]> {
  const db = await getDb();
  const q: Record<string, unknown> = { status: { $in: ACTIVE_EMPLOYEE_STATUSES }, ...notDeleted };
  if (opts.departmentId) q["professional.departmentId"] = opts.departmentId;
  if (opts.restrictToManagerId) {
    const ids = await descendantEmployeeIds(opts.restrictToManagerId);
    q._id = { $in: ids };
  }
  return db.collection<Employee>(EMPLOYEES_COLLECTION).find(q).sort({ firstName: 1 }).toArray();
}

export interface RegisterRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  departmentId: string | null;
  dayClass: "working" | "weekly_off" | "holiday";
  record: SerializedAttendanceRecord | null;
  effectiveStatus: AttendanceStatus;
}

export async function getDailyRegister(
  date: string,
  opts: { departmentId?: string; restrictToManagerId?: string } = {}
): Promise<{ rows: RegisterRow[]; dayClass: "working" | "weekly_off" | "holiday" }> {
  const [settings, employees] = await Promise.all([getOrgSettings(), inScopeEmployees(opts)]);
  const holidaySet = await holidaySetInRange(date, date);
  const dayClass = classifyDay(date, settings, holidaySet);

  const collection = await getCollection();
  const empIds = employees.map((e) => e._id);
  const records = await collection.find({ date, employeeId: { $in: empIds } }).toArray();
  const byEmp = new Map(records.map((r) => [r.employeeId, r]));

  const rows: RegisterRow[] = employees.map((e) => {
    const rec = byEmp.get(e._id) ?? null;
    let effectiveStatus: AttendanceStatus;
    if (rec) effectiveStatus = rec.status;
    else if (dayClass === "holiday") effectiveStatus = "holiday";
    else if (dayClass === "weekly_off") effectiveStatus = "weekly_off";
    else effectiveStatus = "absent";
    return {
      employeeId: e._id,
      employeeName: employeeFullName(e),
      employeeCode: e.employeeCode,
      departmentId: e.professional?.departmentId ?? null,
      dayClass,
      record: rec ? serializeAttendance(rec) : null,
      effectiveStatus,
    };
  });

  return { rows, dayClass };
}

export interface MonthCell {
  date: string;
  dayClass: "working" | "weekly_off" | "holiday";
  status: AttendanceStatus | null;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  isLate: boolean;
  lateByMinutes: number;
}

export interface MonthSummary {
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  lateCount: number;
  workingDays: number;
  avgWorkedMinutes: number;
}

export async function getEmployeeMonth(
  employeeId: string,
  month: string
): Promise<{ cells: MonthCell[]; summary: MonthSummary }> {
  const { from, to } = monthBounds(month);
  const [settings, collection] = await Promise.all([getOrgSettings(), getCollection()]);
  const holidaySet = await holidaySetInRange(from, to);
  const records = await collection.find({ employeeId, date: { $gte: from, $lte: to } }).toArray();
  const byDate = new Map(records.map((r) => [r.date, r]));

  const cells: MonthCell[] = eachDateString(from, to).map((date) => {
    const dayClass = classifyDay(date, settings, holidaySet);
    const r = byDate.get(date);
    return {
      date,
      dayClass,
      status: r?.status ?? null,
      checkIn: r?.checkIn ?? null,
      checkOut: r?.checkOut ?? null,
      workedMinutes: r?.workedMinutes ?? 0,
      isLate: r?.isLate ?? false,
      lateByMinutes: r?.lateByMinutes ?? 0,
    };
  });

  let present = 0, halfDay = 0, absent = 0, onLeave = 0, lateCount = 0, workingDays = 0, workedSum = 0, workedDays = 0;
  for (const c of cells) {
    if (c.dayClass === "working") workingDays += 1;
    if (c.status === "present") present += 1;
    else if (c.status === "half_day") halfDay += 1;
    else if (c.status === "absent") absent += 1;
    else if (c.status === "on_leave") onLeave += 1;
    else if (c.dayClass === "working" && !c.status) absent += 1;
    if (c.isLate) lateCount += 1;
    if (c.workedMinutes > 0) {
      workedSum += c.workedMinutes;
      workedDays += 1;
    }
  }

  return {
    cells,
    summary: {
      present,
      halfDay,
      absent,
      onLeave,
      lateCount,
      workingDays,
      avgWorkedMinutes: workedDays > 0 ? Math.round(workedSum / workedDays) : 0,
    },
  };
}

export interface MonthlyReportRow {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  present: number;
  halfDay: number;
  absent: number;
  onLeave: number;
  lateCount: number;
  workingDays: number;
}

export async function getMonthlyReport(
  month: string,
  opts: { departmentId?: string; restrictToManagerId?: string } = {}
): Promise<MonthlyReportRow[]> {
  const { from, to } = monthBounds(month);
  const [settings, employees, collection] = await Promise.all([getOrgSettings(), inScopeEmployees(opts), getCollection()]);
  const holidaySet = await holidaySetInRange(from, to);
  const workingDays = eachDateString(from, to).filter((d) => classifyDay(d, settings, holidaySet) === "working").length;

  const empIds = employees.map((e) => e._id);
  const records = await collection.find({ date: { $gte: from, $lte: to }, employeeId: { $in: empIds } }).toArray();
  const byEmp = new Map<string, AttendanceRecord[]>();
  for (const r of records) {
    const list = byEmp.get(r.employeeId) ?? [];
    list.push(r);
    byEmp.set(r.employeeId, list);
  }

  return employees.map((e) => {
    const recs = byEmp.get(e._id) ?? [];
    let present = 0, halfDay = 0, absent = 0, onLeave = 0, lateCount = 0;
    for (const r of recs) {
      if (r.status === "present") present += 1;
      else if (r.status === "half_day") halfDay += 1;
      else if (r.status === "absent") absent += 1;
      else if (r.status === "on_leave") onLeave += 1;
      if (r.isLate) lateCount += 1;
    }
    const markedWorking = present + halfDay + absent + onLeave;
    absent += Math.max(0, workingDays - markedWorking);
    return {
      employeeId: e._id,
      employeeName: employeeFullName(e),
      employeeCode: e.employeeCode,
      present,
      halfDay,
      absent,
      onLeave,
      lateCount,
      workingDays,
    };
  });
}

export interface TodaySnapshot {
  presentToday: number;
  onLeaveToday: number;
  lateToday: number;
  headcount: number;
}

export async function getTodaySnapshot(restrictToManagerId?: string): Promise<TodaySnapshot> {
  const date = todayDateString();
  const [employees, collection] = await Promise.all([
    inScopeEmployees({ restrictToManagerId }),
    getCollection(),
  ]);
  const empIds = employees.map((e) => e._id);
  const records = await collection.find({ date, employeeId: { $in: empIds } }).toArray();
  let presentToday = 0, onLeaveToday = 0, lateToday = 0;
  for (const r of records) {
    if (r.status === "present" || r.status === "half_day") presentToday += 1;
    if (r.status === "on_leave") onLeaveToday += 1;
    if (r.isLate) lateToday += 1;
  }
  return { presentToday, onLeaveToday, lateToday, headcount: employees.length };
}

export interface AttendanceOverviewPoint {
  date: string;
  present: number;
  half_day: number;
  absent: number;
  on_leave: number;
}

export async function getAttendanceOverview(
  from: string,
  to: string,
  opts: { restrictToManagerId?: string } = {}
): Promise<AttendanceOverviewPoint[]> {
  const [settings, employees, collection] = await Promise.all([
    getOrgSettings(),
    inScopeEmployees(opts),
    getCollection(),
  ]);
  const empIds = new Set(employees.map((e) => e._id));
  const holidaySet = await holidaySetInRange(from, to);
  const records = await collection.find({ date: { $gte: from, $lte: to }, employeeId: { $in: Array.from(empIds) } }).toArray();

  const byDate = new Map<string, { present: number; half_day: number; absent: number; on_leave: number }>();
  for (const d of eachDateString(from, to)) {
    if (classifyDay(d, settings, holidaySet) !== "working") continue;
    byDate.set(d, { present: 0, half_day: 0, absent: 0, on_leave: 0 });
  }
  for (const r of records) {
    const bucket = byDate.get(r.date);
    if (!bucket) continue;
    if (r.status === "present") bucket.present += 1;
    else if (r.status === "half_day") bucket.half_day += 1;
    else if (r.status === "on_leave") bucket.on_leave += 1;
    else if (r.status === "absent") bucket.absent += 1;
  }
  // Unmarked working-day employees count as absent.
  for (const [, bucket] of byDate) {
    const marked = bucket.present + bucket.half_day + bucket.absent + bucket.on_leave;
    bucket.absent += Math.max(0, empIds.size - marked);
  }
  return Array.from(byDate, ([date, v]) => ({ date, ...v })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function getAttendanceLogs(attendanceId: string) {
  const db = await getDb();
  return db
    .collection(ATTENDANCE_LOGS_COLLECTION)
    .find({ attendanceId })
    .sort({ at: -1 })
    .toArray();
}
