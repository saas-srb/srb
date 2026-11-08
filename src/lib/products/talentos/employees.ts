import { BillingLimitError, employeeBlockReason } from "@/lib/platform/billing/enforce";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { emitEvent } from "@/lib/platform/events";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/talentos/db";
import {
  DEFAULT_EMPLOYEE_STATUS,
  ACTIVE_EMPLOYEE_STATUSES,
  type EmployeeStatus,
  type EmploymentType,
  type Gender,
} from "@/lib/products/talentos/employee-status";

export const EMPLOYEES_COLLECTION = "hrms_employees";
const EMPLOYEE_CODE_PREFIX = "YO";

export interface EmergencyContact {
  name: string;
  relationship: string;
  phone: string;
}

export interface EmployeePersonal {
  dateOfBirth: string | null; // ISO yyyy-mm-dd
  gender: Gender | null;
  maritalStatus: string | null;
  personalEmail: string | null;
  phone: string | null;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  photoKey: string | null;
}

export interface EmployeeProfessional {
  departmentId: string | null;
  designationId: string | null;
  teamId: string | null;
  reportingManagerId: string | null;
  employmentType: EmploymentType | null;
  workLocation: string | null;
  joiningDate: string | null; // ISO yyyy-mm-dd
  probationEndDate: string | null;
  relievingDate: string | null;
}

export interface RecruitmentLink {
  applicationId: string;
  positionSlug: string | null;
  positionTitle: string | null;
  convertedAt: Date;
  convertedBy: string | null;
}

export interface Employee extends AuditFields {
  _id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  status: EmployeeStatus;
  personal: EmployeePersonal;
  professional: EmployeeProfessional;
  emergencyContacts: EmergencyContact[];
  recruitment: RecruitmentLink | null;
  /** Optional link back to the `admin_users` login that represents this person. */
  adminUserId: string | null;
}

export interface SerializedEmployee extends Omit<Employee, "createdAt" | "updatedAt" | "deletedAt" | "recruitment"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  recruitment: (Omit<RecruitmentLink, "convertedAt"> & { convertedAt: string }) | null;
}

export function serializeEmployee(e: Employee): SerializedEmployee {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    deletedAt: e.deletedAt ? e.deletedAt.toISOString() : null,
    recruitment: e.recruitment
      ? { ...e.recruitment, convertedAt: new Date(e.recruitment.convertedAt).toISOString() }
      : null,
  };
}

export function employeeFullName(e: Pick<Employee, "firstName" | "lastName">): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Employee>(EMPLOYEES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ employeeCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ workEmail: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ "professional.departmentId": 1 }).catch(() => {}),
      collection.createIndex({ "professional.reportingManagerId": 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateEmployeeCode(): Promise<string> {
  const seq = await nextSequence("employee_code");
  return formatCode(EMPLOYEE_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getEmployee(id: string): Promise<Employee | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getEmployeeByCode(code: string): Promise<Employee | null> {
  const collection = await getCollection();
  return collection.findOne({ employeeCode: code, ...notDeleted });
}

/**
 * All non-deleted employees, lightweight — for pickers (manager, team lead…) and for turning stored ids back into names.
 * `activeOnly` is for pickers that ASSIGN someone to something new: people who have left, or are suspended or deactivated, are left out.
 */
export async function listEmployeeOptions(opts: { activeOnly?: boolean } = {}): Promise<{ _id: string; employeeCode: string; name: string }[]> {
  const collection = await getCollection();
  const docs = await collection
    .find(opts.activeOnly ? { ...notDeleted, status: { $in: ACTIVE_EMPLOYEE_STATUSES } } : notDeleted, { projection: { firstName: 1, lastName: 1, employeeCode: 1 } })
    .sort({ firstName: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, employeeCode: d.employeeCode, name: employeeFullName(d) }));
}

export interface EmployeeFilter {
  search?: string;
  status?: EmployeeStatus;
  departmentId?: string;
  employmentType?: EmploymentType;
  /** Restricts results to this manager's reporting line (inclusive of deeper levels). */
  restrictToManagerId?: string;
}

async function buildFilter(opts: EmployeeFilter): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = { ...notDeleted };

  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ firstName: rx }, { lastName: rx }, { workEmail: rx }, { employeeCode: rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.departmentId) filter["professional.departmentId"] = opts.departmentId;
  if (opts.employmentType) filter["professional.employmentType"] = opts.employmentType;

  if (opts.restrictToManagerId) {
    const ids = await descendantEmployeeIds(opts.restrictToManagerId);
    filter._id = { $in: ids };
  }
  return filter;
}

export interface SearchEmployeesOptions extends EmployeeFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "firstName" | "employeeCode" | "joiningDate";
  sortDir?: "asc" | "desc";
}

export async function searchEmployees(opts: SearchEmployeesOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = await buildFilter(opts);

  const sortField = opts.sortBy === "firstName"
    ? "firstName"
    : opts.sortBy === "employeeCode"
      ? "employeeCode"
      : opts.sortBy === "joiningDate"
        ? "professional.joiningDate"
        : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportEmployees(opts: EmployeeFilter & { ids?: string[] } = {}): Promise<Employee[]> {
  const collection = await getCollection();
  const filter =
    opts.ids && opts.ids.length > 0
      ? { _id: { $in: opts.ids }, ...notDeleted }
      : await buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

// ---------------------------------------------------------------------------
// Reporting hierarchy (kept here to avoid a circular import with hierarchy.ts;
// hierarchy.ts owns the persisted closure table, this is the recursive read).
// ---------------------------------------------------------------------------

/** All employee ids at or below `managerId` in the reporting tree (BFS, cycle-safe). */
export async function descendantEmployeeIds(managerId: string): Promise<string[]> {
  const collection = await getCollection();
  const seen = new Set<string>([managerId]);
  let frontier = [managerId];
  while (frontier.length > 0) {
    const rows = await collection
      .find({ "professional.reportingManagerId": { $in: frontier }, ...notDeleted }, { projection: { _id: 1 } })
      .toArray();
    const next: string[] = [];
    for (const r of rows) {
      if (!seen.has(r._id)) {
        seen.add(r._id);
        next.push(r._id);
      }
    }
    frontier = next;
  }
  return Array.from(seen);
}

/** Guards against setting a manager that would create a cycle. */
export async function wouldCreateCycle(employeeId: string, newManagerId: string): Promise<boolean> {
  if (employeeId === newManagerId) return true;
  const descendants = await descendantEmployeeIds(employeeId);
  return descendants.includes(newManagerId);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface EmployeeWriteData {
  firstName: string;
  lastName: string;
  workEmail: string;
  status: EmployeeStatus;
  personal: EmployeePersonal;
  professional: EmployeeProfessional;
  emergencyContacts: EmergencyContact[];
}

export async function createEmployee(
  data: EmployeeWriteData,
  actorId: string,
  extra?: { recruitment?: RecruitmentLink | null }
): Promise<Employee> {
  // A one-person plan holds one employee record at most — enforced here so every path (form, import, AI, invitation) is covered.
  const blocked = await employeeBlockReason();
  if (blocked) throw new BillingLimitError("seats", blocked);
  const collection = await getCollection();
  const doc: Employee = {
    _id: newId(),
    employeeCode: await generateEmployeeCode(),
    firstName: data.firstName,
    lastName: data.lastName,
    workEmail: data.workEmail,
    status: data.status ?? DEFAULT_EMPLOYEE_STATUS,
    personal: data.personal,
    professional: data.professional,
    emergencyContacts: data.emergencyContacts ?? [],
    recruitment: extra?.recruitment ?? null,
    adminUserId: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await emitEvent("employee.created", { entity: { type: "employee", id: doc._id, label: `${doc.firstName} ${doc.lastName}`.trim(), url: `/talentos/employees/${doc._id}` }, actorId, data: { name: `${doc.firstName} ${doc.lastName}`.trim(), workEmail: doc.workEmail, employeeCode: doc.employeeCode } });
  return doc;
}

export async function updateEmployee(
  id: string,
  data: Partial<EmployeeWriteData>,
  actorId: string
): Promise<Employee | null> {
  const collection = await getCollection();
  const before = data.status ? await collection.findOne({ _id: id, ...notDeleted }, { projection: { status: 1 } }) : null;
  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (updated && data.status && before && before.status !== data.status) {
    await (await import("@/lib/products/commandos/account-status")).syncAccountFromEmployee(id, data.status, actorId, updated.professional.relievingDate ?? null);
  }
  return updated;
}

export async function changeEmployeeStatus(
  id: string,
  status: EmployeeStatus,
  actorId: string,
  relievingDate?: string | null
): Promise<Employee | null> {
  const collection = await getCollection();
  const set: Record<string, unknown> = { status, ...updateStamp(actorId) };
  if (relievingDate !== undefined) set["professional.relievingDate"] = relievingDate;
  const updated = await collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: set }, { returnDocument: "after" });
  // The person's account follows the HR file: someone relieved or terminated here can no longer sign in.
  if (updated) await (await import("@/lib/products/commandos/account-status")).syncAccountFromEmployee(id, status, actorId, relievingDate ?? updated.professional.relievingDate ?? null);
  return updated;
}

/** Soft-delete. Employees are never hard-removed so audit history stays intact. */
export async function deleteEmployee(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const reportCount = await collection.countDocuments({ "professional.reportingManagerId": id, ...notDeleted });
  if (reportCount > 0) {
    return { ok: false, reason: `${reportCount} employee(s) report to this person. Reassign them first.` };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

// ---------------------------------------------------------------------------
// Small aggregates reused by the dashboard + department views
// ---------------------------------------------------------------------------

export async function countEmployees(filter: EmployeeFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(await buildFilter(filter));
}

export async function countActiveEmployees(): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ status: { $in: ACTIVE_EMPLOYEE_STATUSES }, ...notDeleted });
}
