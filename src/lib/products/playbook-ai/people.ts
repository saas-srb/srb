import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { EMPLOYEES_COLLECTION, type Employee, employeeFullName } from "@/lib/products/talentos/employees";
import { DEPARTMENTS_COLLECTION, DESIGNATIONS_COLLECTION, TEAMS_COLLECTION } from "@/lib/products/talentos/departments";
import { ACTIVE_EMPLOYEE_STATUSES } from "@/lib/products/talentos/employee-status";

/**
 * Read-only bridge to HRMS. HRMS owns employees, departments, teams,
 * designations and the reporting structure; the SOP product only ever READS
 * them (never writes) so ownership is not duplicated. An SOP-side "person" is
 * an `admin_users` login, because acknowledging needs an authenticated user.
 */

export interface EmployeeContext {
  employeeId: string;
  name: string;
  hrmsDepartmentId: string | null;
  teamId: string | null;
  designationId: string | null;
  designationTitle: string | null;
  reportingManagerId: string | null;
}

/** Finds the HRMS employee behind a login: `admin_users.employeeId`, else the employee's `adminUserId`, else work email. */
export async function getEmployeeContextForUser(user: {
  id: string;
  email: string;
  employeeId?: string | null;
}): Promise<EmployeeContext | null> {
  const db = await getDb();
  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);
  const base = { deletedAt: null } as const;
  let emp: Employee | null = null;
  if (user.employeeId) emp = await employees.findOne({ _id: user.employeeId, ...base });
  if (!emp) emp = await employees.findOne({ adminUserId: user.id, ...base });
  if (!emp) emp = await employees.findOne({ workEmail: user.email.toLowerCase(), ...base });
  if (!emp) return null;

  let designationTitle: string | null = null;
  const designationId = emp.professional?.designationId ?? null;
  if (designationId) {
    const d = await db
      .collection<{ _id: string; title: string }>(DESIGNATIONS_COLLECTION)
      .findOne({ _id: designationId }, { projection: { title: 1 } });
    designationTitle = d?.title ?? null;
  }
  return {
    employeeId: emp._id,
    name: employeeFullName(emp),
    hrmsDepartmentId: emp.professional?.departmentId ?? null,
    teamId: emp.professional?.teamId ?? null,
    designationId,
    designationTitle,
    reportingManagerId: emp.professional?.reportingManagerId ?? null,
  };
}

/** HRMS departments this employee is the head of. */
export async function headedHrmsDepartmentIds(employeeId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .collection<{ _id: string }>(DEPARTMENTS_COLLECTION)
    .find({ headEmployeeId: employeeId, deletedAt: null }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((r) => r._id);
}

export interface PersonRef {
  userId: string;
  email: string;
  name: string;
  employeeId: string | null;
  hrmsDepartmentId: string | null;
  teamId: string | null;
  designationId: string | null;
}

/**
 * Every active employee that has a login, as assignable people. Employees
 * without a login are returned in `withoutLogin` so the UI can say so instead
 * of silently skipping them.
 */
export async function listAssignablePeople(filter?: {
  hrmsDepartmentIds?: string[];
  teamIds?: string[];
  designationIds?: string[];
  employeeIds?: string[];
}): Promise<{ people: PersonRef[]; withoutLogin: number }> {
  const db = await getDb();
  const empFilter: Record<string, unknown> = { deletedAt: null, status: { $in: ACTIVE_EMPLOYEE_STATUSES } };
  const and: Record<string, unknown>[] = [];
  if (filter?.hrmsDepartmentIds) and.push({ "professional.departmentId": { $in: filter.hrmsDepartmentIds } });
  if (filter?.teamIds) and.push({ "professional.teamId": { $in: filter.teamIds } });
  if (filter?.designationIds) and.push({ "professional.designationId": { $in: filter.designationIds } });
  if (filter?.employeeIds) and.push({ _id: { $in: filter.employeeIds } });
  if (and.length) empFilter.$and = and;

  const employees = await db.collection<Employee>(EMPLOYEES_COLLECTION).find(empFilter).toArray();
  if (employees.length === 0) return { people: [], withoutLogin: 0 };

  const empIds = employees.map((e) => e._id);
  const adminIds = employees.map((e) => e.adminUserId).filter((v): v is string => !!v && ObjectId.isValid(v));
  const users = await db
    .collection<{ _id: ObjectId; email: string; employeeId?: string | null }>("admin_users")
    .find(
      { $or: [{ employeeId: { $in: empIds } }, ...(adminIds.length ? [{ _id: { $in: adminIds.map((i) => new ObjectId(i)) } }] : [])] },
      { projection: { email: 1, employeeId: 1 } }
    )
    .toArray();

  const userByEmployee = new Map<string, { _id: ObjectId; email: string }>();
  for (const u of users) if (u.employeeId) userByEmployee.set(u.employeeId, u);
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  const people: PersonRef[] = [];
  let withoutLogin = 0;
  for (const e of employees) {
    const u = userByEmployee.get(e._id) ?? (e.adminUserId ? userById.get(e.adminUserId) : undefined);
    if (!u) {
      withoutLogin += 1;
      continue;
    }
    people.push({
      userId: u._id.toString(),
      email: u.email,
      name: employeeFullName(e),
      employeeId: e._id,
      hrmsDepartmentId: e.professional?.departmentId ?? null,
      teamId: e.professional?.teamId ?? null,
      designationId: e.professional?.designationId ?? null,
    });
  }
  return { people, withoutLogin };
}

export async function listHrmsTeams(): Promise<{ _id: string; name: string; departmentId: string }[]> {
  const db = await getDb();
  return db
    .collection<{ _id: string; name: string; departmentId: string }>(TEAMS_COLLECTION)
    .find({ deletedAt: null }, { projection: { name: 1, departmentId: 1 } })
    .sort({ name: 1 })
    .toArray();
}

export async function listHrmsDesignations(): Promise<{ _id: string; title: string; departmentId: string }[]> {
  const db = await getDb();
  return db
    .collection<{ _id: string; title: string; departmentId: string }>(DESIGNATIONS_COLLECTION)
    .find({ deletedAt: null }, { projection: { title: 1, departmentId: 1 } })
    .sort({ title: 1 })
    .toArray();
}

export async function listHrmsDepartments(): Promise<{ _id: string; name: string; code: string; headEmployeeId: string | null }[]> {
  const db = await getDb();
  return db
    .collection<{ _id: string; name: string; code: string; headEmployeeId: string | null }>(DEPARTMENTS_COLLECTION)
    .find({ deletedAt: null }, { projection: { name: 1, code: 1, headEmployeeId: 1 } })
    .sort({ name: 1 })
    .toArray();
}

/** Display names for a set of `admin_users` ids (owner / author / assignee labels). */
export async function userNames(userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const valid = Array.from(new Set(userIds.filter((i) => ObjectId.isValid(i))));
  if (valid.length === 0) return out;
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; email: string; employeeId?: string | null }>("admin_users")
    .find({ _id: { $in: valid.map((i) => new ObjectId(i)) } }, { projection: { email: 1, employeeId: 1 } })
    .toArray();
  const empIds = users.map((u) => u.employeeId).filter((v): v is string => !!v);
  const emps = empIds.length
    ? await db
        .collection<Employee>(EMPLOYEES_COLLECTION)
        .find({ _id: { $in: empIds } }, { projection: { firstName: 1, lastName: 1 } })
        .toArray()
    : [];
  const empName = new Map(emps.map((e) => [e._id, employeeFullName(e)]));
  for (const u of users) out.set(u._id.toString(), (u.employeeId && empName.get(u.employeeId)) || u.email);
  return out;
}

/** Everyone who could own / author / be granted an SOP: any login (id + label). */
export async function listUserOptions(): Promise<{ id: string; label: string; email: string }[]> {
  const db = await getDb();
  const users = await db
    .collection<{ _id: ObjectId; email: string; roles?: string[] }>("admin_users")
    .find({}, { projection: { email: 1, roles: 1 } })
    .sort({ email: 1 })
    .toArray();
  const names = await userNames(users.map((u) => u._id.toString()));
  return users
    .filter((u) => (u.roles ?? []).length > 0)
    .map((u) => ({ id: u._id.toString(), label: names.get(u._id.toString()) ?? u.email, email: u.email }));
}
