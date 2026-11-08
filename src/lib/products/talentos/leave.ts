import { hrmsEvents } from "@/lib/notify/triggers/hrms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { emitEvent } from "@/lib/platform/events";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import {
  getOrgSettings,
  classifyDay,
  eachDateString,
  todayDateString,
  type OrgSettings,
} from "@/lib/products/talentos/settings";
import { holidaySetInRange } from "@/lib/products/talentos/holidays";
import { EMPLOYEES_COLLECTION, employeeFullName, type Employee } from "@/lib/products/talentos/employees";
import { DEPARTMENTS_COLLECTION, type Department } from "@/lib/products/talentos/departments";
import { ATTENDANCE_COLLECTION, writeLeaveAttendance, clearLeaveAttendance } from "@/lib/products/talentos/attendance";
import { notify, notifyEmployee } from "@/lib/products/talentos/notifications";
import { currentCompanyId } from "@/lib/platform/tenancy/context";

export const LEAVE_TYPES_COLLECTION = "hrms_leave_types";
export const LEAVE_BALANCES_COLLECTION = "hrms_leave_balances";
export const LEAVE_REQUESTS_COLLECTION = "hrms_leave_requests";

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

export interface LeaveType extends AuditFields {
  _id: string;
  code: string;
  label: string;
  paid: boolean;
  defaultAnnualQuota: number;
  allowNegativeBalance: boolean;
  colorClass: string;
  active: boolean;
}

const DEFAULT_LEAVE_TYPES: Omit<LeaveType, keyof AuditFields | "_id">[] = [
  { code: "casual", label: "Casual Leave", paid: true, defaultAnnualQuota: 12, allowNegativeBalance: false, colorClass: "bg-primary/15 text-primary", active: true },
  { code: "sick", label: "Sick Leave", paid: true, defaultAnnualQuota: 12, allowNegativeBalance: false, colorClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400", active: true },
  { code: "earned", label: "Earned Leave", paid: true, defaultAnnualQuota: 15, allowNegativeBalance: false, colorClass: "bg-green-500/15 text-green-600 dark:text-green-400", active: true },
  { code: "wfh", label: "Work From Home", paid: true, defaultAnnualQuota: 0, allowNegativeBalance: true, colorClass: "bg-secondary/60 text-secondary-foreground", active: true },
  { code: "unpaid", label: "Unpaid Leave", paid: false, defaultAnnualQuota: 0, allowNegativeBalance: true, colorClass: "bg-muted text-muted-foreground", active: true },
];

const leaveTypesSeeded = new Set<string>(); // company ids

async function getLeaveTypesCollection() {
  const db = await getDb();
  const collection = db.collection<LeaveType>(LEAVE_TYPES_COLLECTION);
  const companyId = await currentCompanyId();
  if (!leaveTypesSeeded.has(companyId)) {
    leaveTypesSeeded.add(companyId);
    await collection.createIndex({ code: 1 }, { unique: true }).catch(() => {});
    const count = await collection.countDocuments({});
    if (count === 0) {
      await collection
        .insertMany(DEFAULT_LEAVE_TYPES.map((t) => ({ _id: newId(), ...t, ...createStamp(null) })), { ordered: false })
        .catch(() => {});
    }
  }
  return collection;
}

export async function listLeaveTypes(includeInactive = false): Promise<LeaveType[]> {
  const collection = await getLeaveTypesCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (!includeInactive) filter.active = true;
  return collection.find(filter).sort({ label: 1 }).toArray();
}

export async function getLeaveType(code: string): Promise<LeaveType | null> {
  const collection = await getLeaveTypesCollection();
  return collection.findOne({ code, ...notDeleted });
}

export interface LeaveTypeInput {
  code: string;
  label: string;
  paid: boolean;
  defaultAnnualQuota: number;
  allowNegativeBalance: boolean;
  active: boolean;
}

export async function upsertLeaveType(input: LeaveTypeInput, actorId: string, id?: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getLeaveTypesCollection();
  const clash = await collection.findOne({ code: input.code, ...(id ? { _id: { $ne: id } } : {}), ...notDeleted });
  if (clash) return { ok: false, reason: `Leave type code "${input.code}" is already in use.` };

  if (id) {
    const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { ...input, ...updateStamp(actorId) } });
    return { ok: res.matchedCount === 1 };
  }
  await collection.insertOne({
    _id: newId(),
    ...input,
    colorClass: "bg-secondary/60 text-secondary-foreground",
    ...createStamp(actorId),
  });
  return { ok: true };
}

export async function deleteLeaveType(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  const collection = await getLeaveTypesCollection();
  const type = await collection.findOne({ _id: id, ...notDeleted });
  if (!type) return { ok: false, reason: "Leave type not found." };
  const inUse = await db.collection(LEAVE_REQUESTS_COLLECTION).countDocuments({ leaveTypeCode: type.code, status: { $in: ["pending", "approved"] } });
  if (inUse > 0) return { ok: false, reason: `${inUse} active leave request(s) use this type. Deactivate it instead.` };
  const res = await collection.updateOne({ _id: id }, { $set: { deletedAt: new Date(), active: false, ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

// ---------------------------------------------------------------------------
// Balances
// ---------------------------------------------------------------------------

export interface LeaveBalance extends AuditFields {
  _id: string;
  employeeId: string;
  leaveTypeCode: string;
  year: number;
  allocated: number;
  used: number;
  pending: number;
}

export interface BalanceView {
  leaveTypeCode: string;
  label: string;
  colorClass: string;
  paid: boolean;
  allocated: number;
  used: number;
  pending: number;
  available: number;
}

let balanceIndexEnsured = false;

async function getBalancesCollection() {
  const db = await getDb();
  const collection = db.collection<LeaveBalance>(LEAVE_BALANCES_COLLECTION);
  if (!balanceIndexEnsured) {
    balanceIndexEnsured = true;
    await collection.createIndex({ employeeId: 1, leaveTypeCode: 1, year: 1 }, { unique: true }).catch(() => {});
  }
  return collection;
}

export function currentYear(): number {
  return new Date().getUTCFullYear();
}

/** Upserts a balance row per active leave type for the employee/year. */
export async function ensureBalancesForYear(employeeId: string, year: number): Promise<void> {
  const [collection, types] = await Promise.all([getBalancesCollection(), listLeaveTypes()]);
  for (const type of types) {
    await collection.updateOne(
      { employeeId, leaveTypeCode: type.code, year },
      { $setOnInsert: { _id: newId(), employeeId, leaveTypeCode: type.code, year, allocated: type.defaultAnnualQuota, used: 0, pending: 0, ...createStamp(null) } },
      { upsert: true }
    );
  }
}

export async function getBalances(employeeId: string, year: number): Promise<BalanceView[]> {
  await ensureBalancesForYear(employeeId, year);
  const [collection, types] = await Promise.all([getBalancesCollection(), listLeaveTypes(true)]);
  const rows = await collection.find({ employeeId, year }).toArray();
  const byCode = new Map(rows.map((r) => [r.leaveTypeCode, r]));
  return types
    .filter((t) => t.active || byCode.has(t.code))
    .map((t) => {
      const r = byCode.get(t.code);
      const allocated = r?.allocated ?? t.defaultAnnualQuota;
      const used = r?.used ?? 0;
      const pending = r?.pending ?? 0;
      return {
        leaveTypeCode: t.code,
        label: t.label,
        colorClass: t.colorClass,
        paid: t.paid,
        allocated,
        used,
        pending,
        available: allocated - used - pending,
      };
    });
}

export async function setAllocation(employeeId: string, leaveTypeCode: string, year: number, allocated: number, actorId: string): Promise<void> {
  await ensureBalancesForYear(employeeId, year);
  const collection = await getBalancesCollection();
  await collection.updateOne(
    { employeeId, leaveTypeCode, year },
    { $set: { allocated: Math.max(0, Math.round(allocated * 2) / 2), ...updateStamp(actorId) } }
  );
}

async function applyBalanceDelta(
  employeeId: string,
  leaveTypeCode: string,
  year: number,
  delta: { pending?: number; used?: number }
): Promise<void> {
  await ensureBalancesForYear(employeeId, year);
  const collection = await getBalancesCollection();
  const inc: Record<string, number> = {};
  if (delta.pending) inc.pending = delta.pending;
  if (delta.used) inc.used = delta.used;
  if (Object.keys(inc).length === 0) return;
  await collection.updateOne({ employeeId, leaveTypeCode, year }, { $inc: inc, $set: { updatedAt: new Date() } });
}

// ---------------------------------------------------------------------------
// Leave requests
// ---------------------------------------------------------------------------

export { LEAVE_REQUEST_STATUSES, isValidLeaveStatus, getLeaveStatusMeta } from "@/lib/products/talentos/leave-status";
import type { LeaveRequestStatus } from "@/lib/products/talentos/leave-status";
export type { LeaveRequestStatus };

export interface LeaveRequest extends AuditFields {
  _id: string;
  employeeId: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  days: number;
  reason: string;
  status: LeaveRequestStatus;
  appliedBy: string | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  decisionNote: string | null;
}

export interface SerializedLeaveRequest extends Omit<LeaveRequest, "createdAt" | "updatedAt" | "deletedAt" | "decidedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  decidedAt: string | null;
  employeeName: string;
  employeeCode: string;
  leaveTypeLabel: string;
}

let requestIndexEnsured = false;

async function getRequestsCollection() {
  const db = await getDb();
  const collection = db.collection<LeaveRequest>(LEAVE_REQUESTS_COLLECTION);
  if (!requestIndexEnsured) {
    requestIndexEnsured = true;
    await Promise.all([
      collection.createIndex({ employeeId: 1, startDate: -1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ startDate: 1, endDate: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

/** Working days in [start, end] net of weekly-offs, holidays and half-day flags. */
export async function computeLeaveDays(
  startDate: string,
  endDate: string,
  halfDayStart: boolean,
  halfDayEnd: boolean,
  settings?: OrgSettings
): Promise<number> {
  const s = settings ?? (await getOrgSettings());
  const holidaySet = await holidaySetInRange(startDate, endDate);
  const dates = eachDateString(startDate, endDate);
  let days = 0;
  for (const d of dates) {
    if (classifyDay(d, s, holidaySet) === "working") days += 1;
  }
  if (days === 0) return 0;
  if (halfDayStart && classifyDay(startDate, s, holidaySet) === "working") days -= 0.5;
  if (halfDayEnd && startDate !== endDate && classifyDay(endDate, s, holidaySet) === "working") days -= 0.5;
  return Math.max(days, 0);
}

export interface CreateLeaveInput {
  employeeId: string;
  leaveTypeCode: string;
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  reason: string;
}

export async function createLeaveRequest(
  input: CreateLeaveInput,
  actorId: string
): Promise<{ ok: true; request: LeaveRequest } | { ok: false; reason: string }> {
  if (input.endDate < input.startDate) return { ok: false, reason: "End date is before start date." };

  const [type, days] = await Promise.all([
    getLeaveType(input.leaveTypeCode),
    computeLeaveDays(input.startDate, input.endDate, input.halfDayStart, input.halfDayEnd),
  ]);
  if (!type) return { ok: false, reason: "Unknown leave type." };
  if (days <= 0) return { ok: false, reason: "The selected range contains no working days." };

  const year = Number(input.startDate.slice(0, 4));

  // Overlap guard against other open requests for the same employee.
  const requests = await getRequestsCollection();
  const overlap = await requests.findOne({
    employeeId: input.employeeId,
    status: { $in: ["pending", "approved"] },
    startDate: { $lte: input.endDate },
    endDate: { $gte: input.startDate },
    ...notDeleted,
  });
  if (overlap) return { ok: false, reason: "This overlaps an existing pending or approved leave for this employee." };

  if (!type.allowNegativeBalance) {
    const balances = await getBalances(input.employeeId, year);
    const bal = balances.find((b) => b.leaveTypeCode === type.code);
    if (bal && bal.available < days) {
      return { ok: false, reason: `Insufficient balance: ${bal.available} day(s) available, ${days} requested.` };
    }
  }

  const doc: LeaveRequest = {
    _id: newId(),
    employeeId: input.employeeId,
    leaveTypeCode: input.leaveTypeCode,
    startDate: input.startDate,
    endDate: input.endDate,
    halfDayStart: input.halfDayStart,
    halfDayEnd: input.halfDayEnd,
    days,
    reason: input.reason,
    status: "pending",
    appliedBy: actorId,
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    ...createStamp(actorId),
  };
  await requests.insertOne(doc);
  await applyBalanceDelta(input.employeeId, type.code, year, { pending: days });

  const emp = await (await getDb()).collection<Employee>(EMPLOYEES_COLLECTION).findOne({ _id: input.employeeId });
  await notify({
    audience: "staff",
    type: "leave_requested",
    title: `${emp ? employeeFullName(emp) : "An employee"} requested ${type.label.toLowerCase()}`,
    body: `${days} day(s) · ${input.startDate}${input.startDate !== input.endDate ? ` – ${input.endDate}` : ""}`,
    link: "/talentos/leave?tab=requests",
    entityType: "leave_request",
    entityId: doc._id,
  });
  await emitEvent("leave.requested", { entity: { type: "leave_request", id: doc._id, label: emp ? employeeFullName(emp) : "An employee", url: "/talentos/leave?tab=requests" }, actorId, data: { leaveType: type.code, days, startDate: doc.startDate, endDate: doc.endDate, reason: doc.reason } });

  return { ok: true, request: doc };
}

export async function getLeaveRequest(id: string): Promise<LeaveRequest | null> {
  const collection = await getRequestsCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function decideLeaveRequest(
  id: string,
  decision: "approved" | "rejected",
  note: string | null,
  actorId: string
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getRequestsCollection();
  const req = await collection.findOne({ _id: id, ...notDeleted });
  if (!req) return { ok: false, reason: "Leave request not found." };
  if (req.status !== "pending") return { ok: false, reason: `Request is already ${req.status}.` };

  const year = Number(req.startDate.slice(0, 4));
  await collection.updateOne(
    { _id: id },
    { $set: { status: decision, decidedBy: actorId, decidedAt: new Date(), decisionNote: note, ...updateStamp(actorId) } }
  );

  if (decision === "approved") {
    await applyBalanceDelta(req.employeeId, req.leaveTypeCode, year, { pending: -req.days, used: req.days });
    await writeLeaveAttendance(req.employeeId, req.startDate, req.endDate, req._id, actorId);
  } else {
    await applyBalanceDelta(req.employeeId, req.leaveTypeCode, year, { pending: -req.days });
  }

  await notifyEmployee(req.employeeId, {
    type: "leave_decided",
    title: `Your leave was ${decision}`,
    body: `${req.days} day(s) from ${req.startDate}${note ? ` — ${note}` : ""}`,
    link: "/talentos/me/leave",
    entityType: "leave_request",
    entityId: req._id,
  });

  return { ok: true };
}

export async function cancelLeaveRequest(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getRequestsCollection();
  const req = await collection.findOne({ _id: id, ...notDeleted });
  if (!req) return { ok: false, reason: "Leave request not found." };
  if (req.status === "cancelled" || req.status === "rejected") return { ok: false, reason: `Request is already ${req.status}.` };

  const year = Number(req.startDate.slice(0, 4));
  if (req.status === "pending") {
    await applyBalanceDelta(req.employeeId, req.leaveTypeCode, year, { pending: -req.days });
  } else if (req.status === "approved") {
    await applyBalanceDelta(req.employeeId, req.leaveTypeCode, year, { used: -req.days });
    await clearLeaveAttendance(req._id);
  }
  await collection.updateOne({ _id: id }, { $set: { status: "cancelled", ...updateStamp(actorId) } });
  if (req.status === "approved") await hrmsEvents.leaveCancelled({ id: req._id, employeeId: req.employeeId, startDate: req.startDate, endDate: req.endDate, days: req.days });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface LeaveRequestFilter {
  status?: LeaveRequestStatus;
  employeeId?: string;
  leaveTypeCode?: string;
  from?: string;
  to?: string;
  restrictToEmployeeIds?: string[];
}

async function hydrateRequests(rows: LeaveRequest[]): Promise<SerializedLeaveRequest[]> {
  const db = await getDb();
  const empIds = Array.from(new Set(rows.map((r) => r.employeeId)));
  const [emps, types] = await Promise.all([
    db.collection<Employee>(EMPLOYEES_COLLECTION).find({ _id: { $in: empIds } }).toArray(),
    listLeaveTypes(true),
  ]);
  const empById = new Map(emps.map((e) => [e._id, e]));
  const typeByCode = new Map(types.map((t) => [t.code, t]));
  return rows.map((r) => {
    const e = empById.get(r.employeeId);
    return {
      ...r,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      employeeName: e ? employeeFullName(e) : "Unknown",
      employeeCode: e?.employeeCode ?? "—",
      leaveTypeLabel: typeByCode.get(r.leaveTypeCode)?.label ?? r.leaveTypeCode,
    };
  });
}

export async function listLeaveRequests(filter: LeaveRequestFilter = {}, page = 1, pageSize = 30) {
  const collection = await getRequestsCollection();
  const q: Record<string, unknown> = { ...notDeleted };
  if (filter.status) q.status = filter.status;
  if (filter.leaveTypeCode) q.leaveTypeCode = filter.leaveTypeCode;
  if (filter.employeeId) q.employeeId = filter.employeeId;
  if (filter.restrictToEmployeeIds) q.employeeId = q.employeeId ? q.employeeId : { $in: filter.restrictToEmployeeIds };
  if (filter.from || filter.to) {
    if (filter.from) q.endDate = { $gte: filter.from };
    if (filter.to) q.startDate = { $lte: filter.to };
  }

  const [rows, total] = await Promise.all([
    collection.find(q).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(q),
  ]);
  return { items: await hydrateRequests(rows), total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function getEmployeeLeaveHistory(employeeId: string, limit = 40): Promise<SerializedLeaveRequest[]> {
  const collection = await getRequestsCollection();
  const rows = await collection.find({ employeeId, ...notDeleted }).sort({ startDate: -1 }).limit(limit).toArray();
  return hydrateRequests(rows);
}

export async function getPendingLeaveCount(restrictToEmployeeIds?: string[]): Promise<number> {
  const collection = await getRequestsCollection();
  const q: Record<string, unknown> = { status: "pending", ...notDeleted };
  if (restrictToEmployeeIds) q.employeeId = { $in: restrictToEmployeeIds };
  return collection.countDocuments(q);
}

export interface LeaveCalendarEntry {
  requestId: string;
  employeeId: string;
  employeeName: string;
  leaveTypeCode: string;
  leaveTypeLabel: string;
  startDate: string;
  endDate: string;
  status: LeaveRequestStatus;
}

export async function getLeaveCalendar(from: string, to: string, restrictToEmployeeIds?: string[]): Promise<LeaveCalendarEntry[]> {
  const collection = await getRequestsCollection();
  const q: Record<string, unknown> = {
    status: { $in: ["approved", "pending"] },
    startDate: { $lte: to },
    endDate: { $gte: from },
    ...notDeleted,
  };
  if (restrictToEmployeeIds) q.employeeId = { $in: restrictToEmployeeIds };
  const rows = await collection.find(q).sort({ startDate: 1 }).toArray();
  const hydrated = await hydrateRequests(rows);
  return hydrated.map((r) => ({
    requestId: r._id,
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    leaveTypeCode: r.leaveTypeCode,
    leaveTypeLabel: r.leaveTypeLabel,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
  }));
}

export interface LeaveAnalytics {
  byType: { label: string; value: number }[];
  byDepartment: { label: string; value: number }[];
  byMonth: { date: string; count: number }[];
  approvalRate: number;
  totalRequests: number;
  totalDaysApproved: number;
}

export async function getLeaveAnalytics(from: string, to: string): Promise<LeaveAnalytics> {
  const db = await getDb();
  const collection = await getRequestsCollection();
  const [rows, types, depts, employees] = await Promise.all([
    collection.find({ startDate: { $lte: to }, endDate: { $gte: from }, ...notDeleted }).toArray(),
    listLeaveTypes(true),
    db.collection<Department>(DEPARTMENTS_COLLECTION).find(notDeleted).toArray(),
    db.collection<Employee>(EMPLOYEES_COLLECTION).find(notDeleted, { projection: { "professional.departmentId": 1 } }).toArray(),
  ]);

  const typeLabel = new Map(types.map((t) => [t.code, t.label]));
  const deptName = new Map(depts.map((d) => [d._id, d.name]));
  const empDept = new Map(employees.map((e) => [e._id, e.professional?.departmentId ?? null]));

  const byTypeMap = new Map<string, number>();
  const byDeptMap = new Map<string, number>();
  const byMonthMap = new Map<string, number>();
  let approved = 0;
  let decided = 0;
  let daysApproved = 0;

  for (const r of rows) {
    byTypeMap.set(r.leaveTypeCode, (byTypeMap.get(r.leaveTypeCode) ?? 0) + 1);
    const dId = empDept.get(r.employeeId);
    const dLabel = dId ? deptName.get(dId) ?? "Unknown" : "Unassigned";
    byDeptMap.set(dLabel, (byDeptMap.get(dLabel) ?? 0) + 1);
    const month = r.startDate.slice(0, 7);
    byMonthMap.set(month, (byMonthMap.get(month) ?? 0) + 1);
    if (r.status === "approved" || r.status === "rejected") decided += 1;
    if (r.status === "approved") {
      approved += 1;
      daysApproved += r.days;
    }
  }

  return {
    byType: Array.from(byTypeMap, ([code, value]) => ({ label: typeLabel.get(code) ?? code, value })).sort((a, b) => b.value - a.value),
    byDepartment: Array.from(byDeptMap, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    byMonth: Array.from(byMonthMap, ([date, count]) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date)),
    approvalRate: decided > 0 ? Math.round((approved / decided) * 100) : 0,
    totalRequests: rows.length,
    totalDaysApproved: daysApproved,
  };
}

/** Employee ids whose approved leave covers `date` (default today). */
export async function employeesOnLeave(date: string = todayDateString()): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .collection<{ _id: string; employeeId: string }>(ATTENDANCE_COLLECTION)
    .find({ date, status: "on_leave" }, { projection: { employeeId: 1 } })
    .toArray();
  return rows.map((r) => r.employeeId);
}
