import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/talentos/db";
import { recordAudit } from "@/lib/products/talentos/audit";
import { DEFAULT_DEPARTMENTS } from "./defaults";
import {
  OrgError, cleanCode, cleanName, findDuplicate, makeCode, usageReason, EMPTY_USAGE,
  type OrgKind, type Usage,
} from "./rules";

/**
 * THE organization service: departments, teams and designations for the current company.
 *
 * - One store per entity. The data stays in the canonical `hrms_*` collections (least risky: nothing
 *   moves, every existing id keeps working); this module is the only code that reads or writes them
 *   for master-data purposes. Products call these functions or `OrgPicker`; they never keep copies.
 * - Company scoping comes from `getDb()` (the scoped database), so one company never sees another's rows.
 * - Names are unique: departments per company, teams and designations per department (compared
 *   case-insensitively with spaces collapsed).
 * - "Delete" is an archive (soft delete) and is refused while the row is in use; `restore*` brings it back.
 * - Every change writes an audit event. No permission checks here: callers do their own.
 */

export const DEPARTMENTS_COLLECTION = "hrms_departments";
export const DESIGNATIONS_COLLECTION = "hrms_designations";
export const TEAMS_COLLECTION = "hrms_teams";
const EMPLOYEES = "hrms_employees";
const PEOPLE = "admin_users";
const SOP_DEPARTMENTS = "sop_departments";
const SOPS = "sops";

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

export interface Actor {
  id: string;
  email?: string | null;
}
type ActorArg = string | Actor | null;
const actorId = (a: ActorArg): string | null => (a && typeof a === "object" ? a.id : a);
const actorEmail = (a: ActorArg): string | null => (a && typeof a === "object" ? a.email ?? null : null);

async function cols() {
  const db = await getDb();
  return {
    db,
    departments: db.collection<Department>(DEPARTMENTS_COLLECTION),
    designations: db.collection<Designation>(DESIGNATIONS_COLLECTION),
    teams: db.collection<Team>(TEAMS_COLLECTION),
  };
}

async function audit(a: ActorArg, action: "create" | "update" | "delete", entity: OrgKind, id: string, label: string, summary: string) {
  const who = actorId(a);
  if (!who) return; // system seeding: no person to attribute
  await recordAudit({ actorId: who, actorEmail: actorEmail(a), action, entity, entityId: id, entityLabel: label, summary });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listDepartments(opts: { includeArchived?: boolean } = {}): Promise<Department[]> {
  const { departments } = await cols();
  return departments.find(opts.includeArchived ? {} : notDeleted).sort({ name: 1 }).toArray();
}
export async function getDepartment(id: string): Promise<Department | null> {
  const { departments } = await cols();
  return departments.findOne({ _id: id, ...notDeleted });
}
export async function listDesignations(opts: { includeArchived?: boolean; departmentId?: string } = {}): Promise<Designation[]> {
  const { designations } = await cols();
  const q = { ...(opts.includeArchived ? {} : notDeleted), ...(opts.departmentId ? { departmentId: opts.departmentId } : {}) };
  return designations.find(q).sort({ title: 1 }).toArray();
}
export async function listTeams(opts: { includeArchived?: boolean; departmentId?: string } = {}): Promise<Team[]> {
  const { teams } = await cols();
  const q = { ...(opts.includeArchived ? {} : notDeleted), ...(opts.departmentId ? { departmentId: opts.departmentId } : {}) };
  return teams.find(q).sort({ name: 1 }).toArray();
}

export interface DepartmentWithCounts extends Department {
  employeeCount: number;
  designationCount: number;
  teamCount: number;
}

export async function listDepartmentsWithCounts(): Promise<DepartmentWithCounts[]> {
  const { departments, designations, teams, db } = await cols();
  const group = (field: string) => [{ $match: { deletedAt: null } }, { $group: { _id: field, count: { $sum: 1 } } }];
  const [list, emp, des, tms] = await Promise.all([
    departments.find(notDeleted).sort({ name: 1 }).toArray(),
    db.collection(EMPLOYEES).aggregate<{ _id: string; count: number }>(group("$professional.departmentId")).toArray(),
    designations.aggregate<{ _id: string; count: number }>(group("$departmentId")).toArray(),
    teams.aggregate<{ _id: string; count: number }>(group("$departmentId")).toArray(),
  ]);
  const m = (rows: { _id: string; count: number }[]) => new Map(rows.map((r) => [r._id, r.count]));
  const e = m(emp), d = m(des), t = m(tms);
  return list.map((x) => ({ ...x, employeeCount: e.get(x._id) ?? 0, designationCount: d.get(x._id) ?? 0, teamCount: t.get(x._id) ?? 0 }));
}

/** How many things use this row (drives "in use" messages and the Organization pages). */
export async function usageOf(kind: OrgKind, id: string): Promise<Usage> {
  const { db, designations, teams } = await cols();
  const employees = db.collection(EMPLOYEES);
  if (kind === "department") {
    const sopDepts = await db.collection<{ _id: string }>(SOP_DEPARTMENTS).find({ hrmsDepartmentId: id, deletedAt: null }, { projection: { _id: 1 } }).toArray();
    const [e, d, t, docs] = await Promise.all([
      employees.countDocuments({ "professional.departmentId": id, deletedAt: null }),
      designations.countDocuments({ departmentId: id, deletedAt: null }),
      teams.countDocuments({ departmentId: id, deletedAt: null }),
      sopDepts.length ? db.collection(SOPS).countDocuments({ departmentId: { $in: sopDepts.map((s) => s._id) }, deletedAt: null }) : Promise.resolve(0),
    ]);
    return { ...EMPTY_USAGE, employees: e, designations: d, teams: t, documents: docs };
  }
  if (kind === "team") {
    return { ...EMPTY_USAGE, employees: await employees.countDocuments({ "professional.teamId": id, deletedAt: null }) };
  }
  const [e, p] = await Promise.all([
    employees.countDocuments({ "professional.designationId": id, deletedAt: null }),
    db.collection(PEOPLE).countDocuments({ designationId: id, deletedAt: null }),
  ]);
  return { ...EMPTY_USAGE, employees: e, people: p };
}

// ---------------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------------

export async function createDepartment(
  data: { name: string; code?: string; description?: string | null; headEmployeeId?: string | null },
  actor: ActorArg
): Promise<Department> {
  const { departments } = await cols();
  const name = cleanName(data.name);
  if (!name) throw new OrgError("Department name is required.");
  const all = await departments.find({}).toArray();
  const live = all.filter((d) => !d.deletedAt);
  if (findDuplicate(live.map((d) => ({ _id: d._id, name: d.name })), name, null)) throw new OrgError(`A department named "${name}" already exists.`);
  const taken = new Set(live.map((d) => d.code));
  const wanted = cleanCode(data.code);
  if (wanted && taken.has(wanted)) throw new OrgError(`Code ${wanted} is already used.`);
  const doc: Department = {
    _id: newId(),
    name,
    code: wanted || makeCode(name, taken),
    description: data.description?.toString().trim() || null,
    headEmployeeId: data.headEmployeeId ?? null,
    ...createStamp(actorId(actor)),
  };
  await departments.insertOne(doc);
  await audit(actor, "create", "department", doc._id, name, "Department created");
  return doc;
}

export async function updateDepartment(
  id: string,
  data: Partial<Pick<Department, "name" | "code" | "description" | "headEmployeeId">>,
  actor: ActorArg
): Promise<Department | null> {
  const { departments } = await cols();
  const live = (await departments.find(notDeleted).toArray());
  const set: Record<string, unknown> = {};
  if (data.name !== undefined) {
    const name = cleanName(data.name);
    if (!name) throw new OrgError("Department name is required.");
    if (findDuplicate(live.map((d) => ({ _id: d._id, name: d.name })), name, null, id)) throw new OrgError(`A department named "${name}" already exists.`);
    set.name = name;
  }
  if (data.code !== undefined) {
    const code = cleanCode(data.code);
    if (!code) throw new OrgError("Code is required.");
    if (live.some((d) => d._id !== id && d.code === code)) throw new OrgError(`Code ${code} is already used.`);
    set.code = code;
  }
  if (data.description !== undefined) set.description = data.description?.toString().trim() || null;
  if (data.headEmployeeId !== undefined) set.headEmployeeId = data.headEmployeeId || null;
  const doc = await departments.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...set, ...updateStamp(actorId(actor)) } }, { returnDocument: "after" });
  if (doc) await audit(actor, "update", "department", id, doc.name, `Changed: ${Object.keys(set).join(", ") || "nothing"}`);
  return doc;
}

async function archive(kind: OrgKind, collection: typeof DEPARTMENTS_COLLECTION | typeof DESIGNATIONS_COLLECTION | typeof TEAMS_COLLECTION, id: string, actor: ActorArg): Promise<{ ok: boolean; reason?: string }> {
  const reason = usageReason(kind, await usageOf(kind, id));
  if (reason) return { ok: false, reason };
  const db = await getDb();
  const col = db.collection<{ _id: string; name?: string; title?: string; deletedAt: Date | null }>(collection);
  const before = await col.findOne({ _id: id, ...notDeleted });
  if (!before) return { ok: false, reason: "Not found." };
  const res = await col.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId(actor)) } });
  if (res.modifiedCount === 1) await audit(actor, "delete", kind, id, before.name ?? before.title ?? id, `${kind} archived`);
  return { ok: res.modifiedCount === 1 };
}

async function restore(kind: OrgKind, collection: string, id: string, actor: ActorArg): Promise<{ ok: boolean; reason?: string }> {
  const db = await getDb();
  const col = db.collection<{ _id: string; name?: string; title?: string; departmentId?: string; deletedAt: Date | null }>(collection);
  const row = await col.findOne({ _id: id, deletedAt: { $ne: null } });
  if (!row) return { ok: false, reason: "Not found." };
  const label = row.name ?? row.title ?? "";
  const peers = await col.find(notDeleted).toArray();
  const scope = kind === "department" ? null : row.departmentId ?? null;
  const dup = findDuplicate(peers.map((p) => ({ _id: p._id, name: p.name ?? p.title ?? "", scope: kind === "department" ? null : p.departmentId ?? null })), label, scope, id);
  if (dup) return { ok: false, reason: `"${label}" already exists, so the archived one cannot be restored.` };
  const res = await col.updateOne({ _id: id }, { $set: { deletedAt: null, ...updateStamp(actorId(actor)) } });
  if (res.modifiedCount === 1) await audit(actor, "update", kind, id, label, `${kind} restored`);
  return { ok: res.modifiedCount === 1 };
}

/** Archives (soft delete). Refused while employees, designations, teams or documents still use it. */
export const deleteDepartment = (id: string, actor: ActorArg) => archive("department", DEPARTMENTS_COLLECTION, id, actor);
export const restoreDepartment = (id: string, actor: ActorArg) => restore("department", DEPARTMENTS_COLLECTION, id, actor);

// ---------------------------------------------------------------------------
// Designations (plain titles, no permissions or role bundles)
// ---------------------------------------------------------------------------

export async function createDesignation(data: { title: string; departmentId: string; level?: string | null }, actor: ActorArg): Promise<Designation> {
  const { designations, departments } = await cols();
  const title = cleanName(data.title, 100);
  if (!title) throw new OrgError("Designation title is required.");
  if (!(await departments.findOne({ _id: data.departmentId, ...notDeleted }))) throw new OrgError("Choose an existing department.");
  const live = await designations.find(notDeleted).toArray();
  if (findDuplicate(live.map((d) => ({ _id: d._id, name: d.title, scope: d.departmentId })), title, data.departmentId)) throw new OrgError(`"${title}" already exists in this department.`);
  const doc: Designation = { _id: newId(), title, departmentId: data.departmentId, level: data.level?.toString().trim() || null, ...createStamp(actorId(actor)) };
  await designations.insertOne(doc);
  await audit(actor, "create", "designation", doc._id, title, "Designation created");
  return doc;
}

export async function updateDesignation(id: string, data: Partial<Pick<Designation, "title" | "departmentId" | "level">>, actor: ActorArg): Promise<Designation | null> {
  const { designations, departments } = await cols();
  const current = await designations.findOne({ _id: id, ...notDeleted });
  if (!current) return null;
  const set: Record<string, unknown> = {};
  const title = data.title !== undefined ? cleanName(data.title, 100) : current.title;
  const departmentId = data.departmentId !== undefined ? data.departmentId : current.departmentId;
  if (!title) throw new OrgError("Designation title is required.");
  if (data.departmentId !== undefined && !(await departments.findOne({ _id: departmentId, ...notDeleted }))) throw new OrgError("Choose an existing department.");
  const live = await designations.find(notDeleted).toArray();
  if (findDuplicate(live.map((d) => ({ _id: d._id, name: d.title, scope: d.departmentId })), title, departmentId, id)) throw new OrgError(`"${title}" already exists in this department.`);
  if (data.title !== undefined) set.title = title;
  if (data.departmentId !== undefined) set.departmentId = departmentId;
  if (data.level !== undefined) set.level = data.level?.toString().trim() || null;
  const doc = await designations.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...set, ...updateStamp(actorId(actor)) } }, { returnDocument: "after" });
  if (doc) await audit(actor, "update", "designation", id, doc.title, `Changed: ${Object.keys(set).join(", ") || "nothing"}`);
  return doc;
}

export const deleteDesignation = (id: string, actor: ActorArg) => archive("designation", DESIGNATIONS_COLLECTION, id, actor);
export const restoreDesignation = (id: string, actor: ActorArg) => restore("designation", DESIGNATIONS_COLLECTION, id, actor);

// ---------------------------------------------------------------------------
// Teams (organization teams; Huddle channel groups and SprintOS squads are NOT these: owner decision D5)
// ---------------------------------------------------------------------------

export async function createTeam(data: { name: string; departmentId: string; leadEmployeeId?: string | null }, actor: ActorArg): Promise<Team> {
  const { teams, departments } = await cols();
  const name = cleanName(data.name);
  if (!name) throw new OrgError("Team name is required.");
  if (!(await departments.findOne({ _id: data.departmentId, ...notDeleted }))) throw new OrgError("Choose an existing department.");
  const live = await teams.find(notDeleted).toArray();
  if (findDuplicate(live.map((t) => ({ _id: t._id, name: t.name, scope: t.departmentId })), name, data.departmentId)) throw new OrgError(`A team named "${name}" already exists in this department.`);
  const doc: Team = { _id: newId(), name, departmentId: data.departmentId, leadEmployeeId: data.leadEmployeeId ?? null, ...createStamp(actorId(actor)) };
  await teams.insertOne(doc);
  await audit(actor, "create", "team", doc._id, name, "Team created");
  return doc;
}

export async function updateTeam(id: string, data: Partial<Pick<Team, "name" | "departmentId" | "leadEmployeeId">>, actor: ActorArg): Promise<Team | null> {
  const { teams, departments } = await cols();
  const current = await teams.findOne({ _id: id, ...notDeleted });
  if (!current) return null;
  const name = data.name !== undefined ? cleanName(data.name) : current.name;
  const departmentId = data.departmentId !== undefined ? data.departmentId : current.departmentId;
  if (!name) throw new OrgError("Team name is required.");
  if (data.departmentId !== undefined && !(await departments.findOne({ _id: departmentId, ...notDeleted }))) throw new OrgError("Choose an existing department.");
  const live = await teams.find(notDeleted).toArray();
  if (findDuplicate(live.map((t) => ({ _id: t._id, name: t.name, scope: t.departmentId })), name, departmentId, id)) throw new OrgError(`A team named "${name}" already exists in this department.`);
  const set: Record<string, unknown> = {};
  if (data.name !== undefined) set.name = name;
  if (data.departmentId !== undefined) set.departmentId = departmentId;
  if (data.leadEmployeeId !== undefined) set.leadEmployeeId = data.leadEmployeeId || null;
  const doc = await teams.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...set, ...updateStamp(actorId(actor)) } }, { returnDocument: "after" });
  if (doc) await audit(actor, "update", "team", id, doc.name, `Changed: ${Object.keys(set).join(", ") || "nothing"}`);
  return doc;
}

export const deleteTeam = (id: string, actor: ActorArg) => archive("team", TEAMS_COLLECTION, id, actor);
export const restoreTeam = (id: string, actor: ActorArg) => restore("team", TEAMS_COLLECTION, id, actor);

// ---------------------------------------------------------------------------
// Seeding and lookups
// ---------------------------------------------------------------------------

/**
 * Creates the starter departments for a company that has NONE yet (live or archived). Safe to call
 * repeatedly. This is the only place the starter list is turned into rows.
 */
export async function seedDefaultDepartments(actor: ActorArg = null): Promise<{ created: number }> {
  const { departments } = await cols();
  if ((await departments.countDocuments({})) > 0) return { created: 0 };
  let created = 0;
  for (const d of DEFAULT_DEPARTMENTS) {
    try {
      await createDepartment({ name: d.name, code: d.code }, actor);
      created++;
    } catch {
      /* a concurrent seed created it first: fine */
    }
  }
  return { created };
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

/** `{ id: name }` for table rendering (includes archived rows so old records still show a name). */
export async function departmentNameMap(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const { departments } = await cols();
  const docs = await departments.find({ _id: { $in: unique } }, { projection: { name: 1 } }).toArray();
  return new Map(docs.map((d) => [d._id, d.name ?? "—"]));
}

