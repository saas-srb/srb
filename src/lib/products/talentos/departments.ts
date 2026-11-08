import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";

/**
 * Master data: departments, designations (job titles, scoped to a department)
 * and teams. All three follow the same soft-delete + audit-field shape.
 */

export const DEPARTMENTS_COLLECTION = "hrms_departments";
export const DESIGNATIONS_COLLECTION = "hrms_designations";
export const TEAMS_COLLECTION = "hrms_teams";
const EMPLOYEES_COLLECTION = "hrms_employees";

export interface Department extends AuditFields {
  _id: string;
  name: string;
  code: string;
  description: string | null;
  headEmployeeId: string | null;
}

export interface Designation extends AuditFields {
  _id: string;
  title: string;
  departmentId: string;
  level: string | null;
}

export interface Team extends AuditFields {
  _id: string;
  name: string;
  departmentId: string;
  leadEmployeeId: string | null;
}

let indexesEnsured = false;

async function collections() {
  const db = await getDb();
  const departments = db.collection<Department>(DEPARTMENTS_COLLECTION);
  const designations = db.collection<Designation>(DESIGNATIONS_COLLECTION);
  const teams = db.collection<Team>(TEAMS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      departments.createIndex({ name: 1 }).catch(() => {}),
      designations.createIndex({ departmentId: 1 }).catch(() => {}),
      teams.createIndex({ departmentId: 1 }).catch(() => {}),
    ]);
  }
  return { db, departments, designations, teams };
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export interface DepartmentWithCounts extends Department {
  employeeCount: number;
  designationCount: number;
  teamCount: number;
}

export async function listDepartments(): Promise<Department[]> {
  const { departments } = await collections();
  return departments.find(notDeleted).sort({ name: 1 }).toArray();
}

export async function listDepartmentsWithCounts(): Promise<DepartmentWithCounts[]> {
  const { departments, designations, teams, db } = await collections();
  const employees = db.collection(EMPLOYEES_COLLECTION);
  const [deptList, empCounts, desigCounts, teamCounts] = await Promise.all([
    departments.find(notDeleted).sort({ name: 1 }).toArray(),
    employees
      .aggregate<{ _id: string; count: number }>([
        { $match: { deletedAt: null } },
        { $group: { _id: "$professional.departmentId", count: { $sum: 1 } } },
      ])
      .toArray(),
    designations
      .aggregate<{ _id: string; count: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$departmentId", count: { $sum: 1 } } }])
      .toArray(),
    teams
      .aggregate<{ _id: string; count: number }>([{ $match: { deletedAt: null } }, { $group: { _id: "$departmentId", count: { $sum: 1 } } }])
      .toArray(),
  ]);

  const empMap = new Map(empCounts.map((r) => [r._id, r.count]));
  const desigMap = new Map(desigCounts.map((r) => [r._id, r.count]));
  const teamMap = new Map(teamCounts.map((r) => [r._id, r.count]));

  return deptList.map((d) => ({
    ...d,
    employeeCount: empMap.get(d._id) ?? 0,
    designationCount: desigMap.get(d._id) ?? 0,
    teamCount: teamMap.get(d._id) ?? 0,
  }));
}

export async function getDepartment(id: string): Promise<Department | null> {
  const { departments } = await collections();
  return departments.findOne({ _id: id, ...notDeleted });
}

export async function createDepartment(
  data: { name: string; code: string; description?: string | null; headEmployeeId?: string | null },
  actorId: string
): Promise<Department> {
  const { departments } = await collections();
  const doc: Department = {
    _id: newId(),
    name: data.name,
    code: data.code,
    description: data.description ?? null,
    headEmployeeId: data.headEmployeeId ?? null,
    ...createStamp(actorId),
  };
  await departments.insertOne(doc);
  return doc;
}

export async function updateDepartment(
  id: string,
  data: Partial<Pick<Department, "name" | "code" | "description" | "headEmployeeId">>,
  actorId: string
): Promise<Department | null> {
  const { departments } = await collections();
  return departments.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Soft-deletes. Refuses when employees, designations or teams still reference it. */
export async function deleteDepartment(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const { departments, designations, teams, db } = await collections();
  const employees = db.collection(EMPLOYEES_COLLECTION);
  const [empCount, desigCount, teamCount] = await Promise.all([
    employees.countDocuments({ "professional.departmentId": id, deletedAt: null }),
    designations.countDocuments({ departmentId: id, deletedAt: null }),
    teams.countDocuments({ departmentId: id, deletedAt: null }),
  ]);
  if (empCount > 0) return { ok: false, reason: `${empCount} employee(s) are still assigned to this department.` };
  if (desigCount > 0) return { ok: false, reason: `${desigCount} designation(s) belong to this department.` };
  if (teamCount > 0) return { ok: false, reason: `${teamCount} team(s) belong to this department.` };

  const res = await departments.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

// ---------------------------------------------------------------------------
// Designations
// ---------------------------------------------------------------------------

export async function listDesignations(): Promise<Designation[]> {
  const { designations } = await collections();
  return designations.find(notDeleted).sort({ title: 1 }).toArray();
}

export async function createDesignation(
  data: { title: string; departmentId: string; level?: string | null },
  actorId: string
): Promise<Designation> {
  const { designations } = await collections();
  const doc: Designation = {
    _id: newId(),
    title: data.title,
    departmentId: data.departmentId,
    level: data.level ?? null,
    ...createStamp(actorId),
  };
  await designations.insertOne(doc);
  return doc;
}

export async function updateDesignation(
  id: string,
  data: Partial<Pick<Designation, "title" | "departmentId" | "level">>,
  actorId: string
): Promise<Designation | null> {
  const { designations } = await collections();
  return designations.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export async function deleteDesignation(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const { designations, db } = await collections();
  const employees = db.collection(EMPLOYEES_COLLECTION);
  const empCount = await employees.countDocuments({ "professional.designationId": id, deletedAt: null });
  if (empCount > 0) return { ok: false, reason: `${empCount} employee(s) hold this designation.` };
  const res = await designations.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

export async function listTeams(): Promise<Team[]> {
  const { teams } = await collections();
  return teams.find(notDeleted).sort({ name: 1 }).toArray();
}

export async function createTeam(
  data: { name: string; departmentId: string; leadEmployeeId?: string | null },
  actorId: string
): Promise<Team> {
  const { teams } = await collections();
  const doc: Team = {
    _id: newId(),
    name: data.name,
    departmentId: data.departmentId,
    leadEmployeeId: data.leadEmployeeId ?? null,
    ...createStamp(actorId),
  };
  await teams.insertOne(doc);
  return doc;
}

export async function updateTeam(
  id: string,
  data: Partial<Pick<Team, "name" | "departmentId" | "leadEmployeeId">>,
  actorId: string
): Promise<Team | null> {
  const { teams } = await collections();
  return teams.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export async function deleteTeam(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const { teams, db } = await collections();
  const employees = db.collection(EMPLOYEES_COLLECTION);
  const empCount = await employees.countDocuments({ "professional.teamId": id, deletedAt: null });
  if (empCount > 0) return { ok: false, reason: `${empCount} employee(s) are still in this team.` };
  const res = await teams.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return { ok: res.modifiedCount === 1 };
}

/** Convenience lookup maps for rendering names from ids. */
export async function masterLookups() {
  const [departments, designations, teams] = await Promise.all([listDepartments(), listDesignations(), listTeams()]);
  return {
    departments,
    designations,
    teams,
    departmentName: (id: string | null | undefined) => departments.find((d) => d._id === id)?.name ?? "—",
    designationTitle: (id: string | null | undefined) => designations.find((d) => d._id === id)?.title ?? "—",
    teamName: (id: string | null | undefined) => teams.find((t) => t._id === id)?.name ?? "—",
  };
}
