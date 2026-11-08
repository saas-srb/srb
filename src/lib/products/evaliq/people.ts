import "server-only";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { EMPLOYEES_COLLECTION, employeeFullName, type Employee } from "@/lib/products/talentos/employees";
import { DEPARTMENTS_COLLECTION, DESIGNATIONS_COLLECTION, TEAMS_COLLECTION } from "@/lib/products/talentos/departments";
import { ACTIVE_EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, getEmploymentTypeLabel } from "@/lib/products/talentos/employee-status";
import { APPLICATIONS_COLLECTION } from "@/lib/career-applications";
import { getCareerApplicationStatusMeta } from "@/lib/career-application-status";
import { ROLE_GROUPS } from "@/lib/products/commandos/role-catalog";
import { candidateKey, type CandidateKind, type CandidateRef, type TargetType } from "@/lib/products/evaliq/constants";

/**
 * Read-only bridge from OTS to the platform's people masters. OTS NEVER
 * stores or edits a person: employees / departments / designations / teams
 * come from HRMS, applicants from Careers (`career_applications`), students /
 * batches / programs from TMS, staff logins from `admin_users`, and applicant
 * / student logins from the External Portal (`external_users`). Everything
 * here is resolved live, by id, every time it is needed.
 */

type Str = { _id: string };
type AdminUserLite = { _id: ObjectId; email: string; roles?: string[]; employeeId?: string | null; studentId?: string | null };
type StudentLite = Str & { fullName: string; email?: string | null; studentCode?: string; status?: string; deletedAt?: Date | null };
type EnrollmentLite = Str & { studentId: string; programId: string; batchId: string; status: string; deletedAt?: Date | null };
type ApplicationLite = { _id: ObjectId; name: string; email: string; positionTitle: string; positionSlug: string | null; status: string; createdAt: Date };
type ExternalUserLite = Str & { applicationId?: string | null; studentId?: string | null; status?: string; email: string };

function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? email;
  const words = local.replace(/[._-]+/g, " ").replace(/\d+/g, " ").trim().split(/\s+/).filter(Boolean);
  return words.length ? words.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ") : email;
}

const oid = (ids: string[]) => ids.filter((i) => ObjectId.isValid(i)).map((i) => new ObjectId(i));

// ── Who is signed in, as a candidate ────────────────────────────────────────

/** The candidate identities of a staff login: its HRMS employee (else the login itself) and, for TMS student logins, the student. */
export async function staffCandidateRefs(user: { id: string; email: string; employeeId: string | null; studentId: string | null }): Promise<{
  name: string;
  employeeId: string | null;
  refs: CandidateRef[];
}> {
  const db = await getDb();
  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);
  let emp: Employee | null = null;
  if (user.employeeId) emp = await employees.findOne({ _id: user.employeeId, deletedAt: null });
  if (!emp) emp = await employees.findOne({ adminUserId: user.id, deletedAt: null });
  if (!emp) emp = await employees.findOne({ workEmail: user.email.toLowerCase(), deletedAt: null });
  const refs: CandidateRef[] = [{ kind: "user", id: user.id }];
  if (emp) refs.push({ kind: "employee", id: emp._id });
  if (user.studentId) refs.push({ kind: "student", id: user.studentId });
  return { name: emp ? employeeFullName(emp) : nameFromEmail(user.email), employeeId: emp?._id ?? null, refs };
}

/** A portal account takes tests as exactly the domain record it is linked to. */
export function portalCandidateRefs(user: { role: string; applicationId: string | null; studentId: string | null }): CandidateRef[] {
  if (user.role === "job_applicant" && user.applicationId) return [{ kind: "applicant", id: user.applicationId }];
  if ((user.role === "intern" || user.role === "trainee") && user.studentId) return [{ kind: "student", id: user.studentId }];
  return [];
}

// ── Picker options (live) ───────────────────────────────────────────────────

export interface Option {
  value: string;
  label: string;
  sub?: string;
}

export interface Directory {
  departments: Option[];
  designations: Option[];
  teams: Option[];
  employmentTypes: Option[];
  employees: Option[];
  platformRoles: Option[];
  users: Option[];
  applicants: Option[];
  positions: Option[];
  students: Option[];
  batches: Option[];
  programs: Option[];
}

export async function getDirectory(): Promise<Directory> {
  const db = await getDb();
  const [departments, designations, teams, employees, users, applications, students, batches, programs] = await Promise.all([
    db.collection<Str & { name: string; code?: string }>(DEPARTMENTS_COLLECTION).find({ deletedAt: null }, { projection: { name: 1, code: 1 } }).sort({ name: 1 }).toArray(),
    db.collection<Str & { title: string; departmentId?: string }>(DESIGNATIONS_COLLECTION).find({ deletedAt: null }, { projection: { title: 1, departmentId: 1 } }).sort({ title: 1 }).toArray(),
    db.collection<Str & { name: string; departmentId?: string }>(TEAMS_COLLECTION).find({ deletedAt: null }, { projection: { name: 1, departmentId: 1 } }).sort({ name: 1 }).toArray(),
    db
      .collection<Employee>(EMPLOYEES_COLLECTION)
      .find({ deletedAt: null, status: { $in: ACTIVE_EMPLOYEE_STATUSES } }, { projection: { firstName: 1, lastName: 1, employeeCode: 1, workEmail: 1 } })
      .sort({ firstName: 1 })
      .limit(3000)
      .toArray(),
    db.collection<AdminUserLite>("admin_users").find({}, { projection: { email: 1, roles: 1 } }).sort({ email: 1 }).limit(3000).toArray(),
    db
      .collection<ApplicationLite>(APPLICATIONS_COLLECTION)
      .find({}, { projection: { name: 1, email: 1, positionTitle: 1, positionSlug: 1, status: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(3000)
      .toArray(),
    db.collection<StudentLite>("training_students").find({ deletedAt: null }, { projection: { fullName: 1, studentCode: 1, status: 1 } }).sort({ fullName: 1 }).limit(3000).toArray(),
    db.collection<Str & { name: string; batchCode?: string; status?: string }>("training_batches").find({ deletedAt: null }, { projection: { name: 1, batchCode: 1, status: 1 } }).sort({ name: 1 }).toArray(),
    db.collection<Str & { name: string; programCode?: string }>("training_programs").find({ deletedAt: null }, { projection: { name: 1, programCode: 1 } }).sort({ name: 1 }).toArray(),
  ]);
  const deptName = new Map(departments.map((d) => [d._id, d.name]));
  const positions = new Map<string, string>();
  for (const a of applications) positions.set(a.positionSlug ?? "__general", a.positionTitle || "General Application");
  return {
    departments: departments.map((d) => ({ value: d._id, label: d.name, sub: d.code })),
    designations: designations.map((d) => ({ value: d._id, label: d.title, sub: d.departmentId ? deptName.get(d.departmentId) : undefined })),
    teams: teams.map((t) => ({ value: t._id, label: t.name, sub: t.departmentId ? deptName.get(t.departmentId) : undefined })),
    employmentTypes: EMPLOYMENT_TYPES.map((t) => ({ value: t.value, label: t.label })),
    employees: employees.map((e) => ({ value: e._id, label: employeeFullName(e), sub: e.employeeCode })),
    platformRoles: ROLE_GROUPS.flatMap((g) => g.roles.map((r) => ({ value: r.value, label: r.label, sub: g.module }))),
    users: users.filter((u) => (u.roles ?? []).length > 0).map((u) => ({ value: u._id.toString(), label: u.email })),
    applicants: applications.map((a) => ({ value: a._id.toString(), label: a.name, sub: `${a.positionTitle} · ${getCareerApplicationStatusMeta(a.status).label}` })),
    positions: Array.from(positions, ([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label)),
    students: students.map((s) => ({ value: s._id, label: s.fullName, sub: s.studentCode })),
    batches: batches.map((b) => ({ value: b._id, label: b.name, sub: b.batchCode })),
    programs: programs.map((p) => ({ value: p._id, label: p.name, sub: p.programCode })),
  };
}

// ── Target resolution ───────────────────────────────────────────────────────

export interface Target {
  type: TargetType;
  ids: string[];
}

export interface ResolvedCandidate {
  ref: CandidateRef;
  key: string;
  label: string;
  /** Which target(s) matched this person — shown in the assignment preview. */
  via: string[];
}

/**
 * Turns assignment targets into concrete people, de-duplicated. Staff are
 * canonicalised to their HRMS employee when one exists so the same person is
 * never assigned twice under two identities.
 */
export async function resolveTargets(
  targets: Target[],
  opts: { applicantStatuses?: string[] } = {}
): Promise<ResolvedCandidate[]> {
  const db = await getDb();
  const out = new Map<string, ResolvedCandidate>();
  const add = (ref: CandidateRef, label: string, via: string) => {
    const key = candidateKey(ref);
    const cur = out.get(key);
    if (cur) {
      if (!cur.via.includes(via)) cur.via.push(via);
    } else out.set(key, { ref, key, label, via: [via] });
  };

  const empFilters: { via: string; filter: Record<string, unknown> }[] = [];
  const studentVia: { via: string; filter: Record<string, unknown> }[] = [];

  for (const t of targets) {
    const ids = Array.from(new Set(t.ids.filter((x) => typeof x === "string" && x.trim()))).slice(0, 500);
    if (ids.length === 0) continue;
    switch (t.type) {
      case "department":
        empFilters.push({ via: "Department", filter: { "professional.departmentId": { $in: ids } } });
        break;
      case "designation":
        empFilters.push({ via: "Role / Designation", filter: { "professional.designationId": { $in: ids } } });
        break;
      case "team":
        empFilters.push({ via: "Team", filter: { "professional.teamId": { $in: ids } } });
        break;
      case "employment_type":
        empFilters.push({ via: "Employee type", filter: { "professional.employmentType": { $in: ids } } });
        break;
      case "employee":
        empFilters.push({ via: "Employee", filter: { _id: { $in: ids } } });
        break;
      case "platform_role":
      case "user": {
        const users = await db
          .collection<AdminUserLite>("admin_users")
          .find(t.type === "user" ? { _id: { $in: oid(ids) } } : { roles: { $in: ids } }, { projection: { email: 1, employeeId: 1 } })
          .toArray();
        const empByUser = await employeesForUsers(users);
        for (const u of users) {
          const emp = empByUser.get(u._id.toString());
          if (emp) add({ kind: "employee", id: emp._id }, employeeFullName(emp), t.type === "user" ? "Staff user" : "Platform role");
          else add({ kind: "user", id: u._id.toString() }, u.email, t.type === "user" ? "Staff user" : "Platform role");
        }
        break;
      }
      case "applicant":
      case "applicant_position": {
        let filter: Record<string, unknown>;
        if (t.type === "applicant") filter = { _id: { $in: oid(ids) } };
        else {
          const slugs = ids.filter((s) => s !== "__general");
          const or: Record<string, unknown>[] = [];
          if (slugs.length) or.push({ positionSlug: { $in: slugs } });
          if (ids.includes("__general")) or.push({ positionSlug: null });
          filter = { $or: or };
          if (opts.applicantStatuses?.length) filter.status = { $in: opts.applicantStatuses };
        }
        const apps = await db.collection<ApplicationLite>(APPLICATIONS_COLLECTION).find(filter, { projection: { name: 1, email: 1 } }).limit(5000).toArray();
        for (const a of apps) add({ kind: "applicant", id: a._id.toString() }, a.name || a.email, t.type === "applicant" ? "Applicant" : "Position");
        break;
      }
      case "student":
        studentVia.push({ via: "Student", filter: { _id: { $in: ids } } });
        break;
      case "batch":
      case "program": {
        const enrolments = await db
          .collection<EnrollmentLite>("student_enrollments")
          .find({ deletedAt: null, status: { $in: ["active", "on_hold"] }, [t.type === "batch" ? "batchId" : "programId"]: { $in: ids } }, { projection: { studentId: 1 } })
          .toArray();
        studentVia.push({ via: t.type === "batch" ? "Batch" : "Course", filter: { _id: { $in: Array.from(new Set(enrolments.map((e) => e.studentId))) } } });
        break;
      }
    }
  }

  for (const { via, filter } of empFilters) {
    const emps = await db
      .collection<Employee>(EMPLOYEES_COLLECTION)
      .find({ deletedAt: null, status: { $in: ACTIVE_EMPLOYEE_STATUSES }, ...filter }, { projection: { firstName: 1, lastName: 1 } })
      .limit(5000)
      .toArray();
    for (const e of emps) add({ kind: "employee", id: e._id }, employeeFullName(e), via);
  }
  for (const { via, filter } of studentVia) {
    const studs = await db.collection<StudentLite>("training_students").find({ deletedAt: null, status: { $ne: "dropped" }, ...filter }, { projection: { fullName: 1 } }).limit(5000).toArray();
    for (const s of studs) add({ kind: "student", id: s._id }, s.fullName, via);
  }
  return Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label));
}

async function employeesForUsers(users: AdminUserLite[]): Promise<Map<string, Employee>> {
  const db = await getDb();
  const out = new Map<string, Employee>();
  if (users.length === 0) return out;
  const empIds = users.map((u) => u.employeeId).filter((v): v is string => !!v);
  const emps = await db
    .collection<Employee>(EMPLOYEES_COLLECTION)
    .find({ deletedAt: null, $or: [{ _id: { $in: empIds } }, { adminUserId: { $in: users.map((u) => u._id.toString()) } }] }, { projection: { firstName: 1, lastName: 1, adminUserId: 1 } })
    .toArray();
  const byId = new Map(emps.map((e) => [e._id, e]));
  const byAdmin = new Map(emps.filter((e) => e.adminUserId).map((e) => [e.adminUserId as string, e]));
  for (const u of users) {
    const e = (u.employeeId && byId.get(u.employeeId)) || byAdmin.get(u._id.toString());
    if (e) out.set(u._id.toString(), e);
  }
  return out;
}

// ── Describing candidates (live) ────────────────────────────────────────────

export interface CandidateInfo {
  key: string;
  kind: CandidateKind;
  id: string;
  name: string;
  email: string | null;
  /** e.g. employee code / student code / applied position. */
  code: string | null;
  departmentId: string | null;
  departmentName: string | null;
  designationId: string | null;
  designationName: string | null;
  teamName: string | null;
  employmentType: string | null;
  positionTitle: string | null;
  applicationStatus: string | null;
  batchIds: string[];
  batchNames: string[];
  programIds: string[];
  programNames: string[];
  /** false when the person has no login yet (employee without admin user, applicant/student without portal account). */
  hasLogin: boolean;
  exists: boolean;
}

function blank(ref: CandidateRef): CandidateInfo {
  return {
    key: candidateKey(ref),
    kind: ref.kind,
    id: ref.id,
    name: "Unknown person",
    email: null,
    code: null,
    departmentId: null,
    departmentName: null,
    designationId: null,
    designationName: null,
    teamName: null,
    employmentType: null,
    positionTitle: null,
    applicationStatus: null,
    batchIds: [],
    batchNames: [],
    programIds: [],
    programNames: [],
    hasLogin: false,
    exists: false,
  };
}

export async function describeCandidates(refs: CandidateRef[]): Promise<Map<string, CandidateInfo>> {
  const db = await getDb();
  const out = new Map<string, CandidateInfo>();
  const byKind = (k: CandidateKind) => Array.from(new Set(refs.filter((r) => r.kind === k).map((r) => r.id)));
  const empIds = byKind("employee");
  const userIds = byKind("user");
  const appIds = byKind("applicant");
  const studentIds = byKind("student");
  for (const r of refs) out.set(candidateKey(r), blank(r));

  const [emps, users, apps, studs, enrolments, externals, depts, desigs, teams] = await Promise.all([
    empIds.length ? db.collection<Employee>(EMPLOYEES_COLLECTION).find({ _id: { $in: empIds } }).toArray() : [],
    userIds.length ? db.collection<AdminUserLite>("admin_users").find({ _id: { $in: oid(userIds) } }, { projection: { email: 1 } }).toArray() : [],
    appIds.length ? db.collection<ApplicationLite>(APPLICATIONS_COLLECTION).find({ _id: { $in: oid(appIds) } }).toArray() : [],
    studentIds.length ? db.collection<StudentLite>("training_students").find({ _id: { $in: studentIds } }).toArray() : [],
    studentIds.length ? db.collection<EnrollmentLite>("student_enrollments").find({ studentId: { $in: studentIds }, deletedAt: null }).toArray() : [],
    appIds.length || studentIds.length
      ? db
          .collection<ExternalUserLite>("external_users")
          .find({ $or: [{ applicationId: { $in: appIds } }, { studentId: { $in: studentIds } }], status: { $ne: "suspended" } }, { projection: { applicationId: 1, studentId: 1 } })
          .toArray()
      : [],
    db.collection<Str & { name: string }>(DEPARTMENTS_COLLECTION).find({}, { projection: { name: 1 } }).toArray(),
    db.collection<Str & { title: string }>(DESIGNATIONS_COLLECTION).find({}, { projection: { title: 1 } }).toArray(),
    db.collection<Str & { name: string }>(TEAMS_COLLECTION).find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const deptName = new Map(depts.map((d) => [d._id, d.name]));
  const desigName = new Map(desigs.map((d) => [d._id, d.title]));
  const teamName = new Map(teams.map((t) => [t._id, t.name]));

  // Employee logins: admin_users.employeeId or employee.adminUserId.
  const empLogins = new Set<string>();
  if (emps.length) {
    const linked = await db
      .collection<AdminUserLite>("admin_users")
      .find({ $or: [{ employeeId: { $in: empIds } }, { _id: { $in: oid(emps.map((e) => e.adminUserId).filter((v): v is string => !!v)) } }] }, { projection: { employeeId: 1 } })
      .toArray();
    const adminIds = new Set(linked.map((u) => u._id.toString()));
    for (const u of linked) if (u.employeeId) empLogins.add(u.employeeId);
    for (const e of emps) if (e.adminUserId && adminIds.has(e.adminUserId)) empLogins.add(e._id);
  }

  for (const e of emps) {
    const info = out.get(`employee:${e._id}`)!;
    const p = e.professional ?? ({} as Employee["professional"]);
    Object.assign(info, {
      name: employeeFullName(e),
      email: e.workEmail ?? null,
      code: e.employeeCode ?? null,
      departmentId: p.departmentId ?? null,
      departmentName: p.departmentId ? deptName.get(p.departmentId) ?? null : null,
      designationId: p.designationId ?? null,
      designationName: p.designationId ? desigName.get(p.designationId) ?? null : null,
      teamName: p.teamId ? teamName.get(p.teamId) ?? null : null,
      employmentType: p.employmentType ? getEmploymentTypeLabel(p.employmentType) : null,
      hasLogin: empLogins.has(e._id),
      exists: !e.deletedAt,
    });
  }
  for (const u of users) Object.assign(out.get(`user:${u._id.toString()}`)!, { name: nameFromEmail(u.email), email: u.email, hasLogin: true, exists: true });

  const extApp = new Set(externals.map((x) => x.applicationId).filter(Boolean));
  const extStu = new Set(externals.map((x) => x.studentId).filter(Boolean));
  for (const a of apps) {
    Object.assign(out.get(`applicant:${a._id.toString()}`)!, {
      name: a.name,
      email: a.email,
      code: a.positionTitle,
      positionTitle: a.positionTitle,
      applicationStatus: getCareerApplicationStatusMeta(a.status).label,
      hasLogin: extApp.has(a._id.toString()),
      exists: true,
    });
  }
  if (studs.length) {
    const batchIds = Array.from(new Set(enrolments.map((e) => e.batchId)));
    const programIds = Array.from(new Set(enrolments.map((e) => e.programId)));
    const [batches, programs, tmsLogins] = await Promise.all([
      db.collection<Str & { name: string }>("training_batches").find({ _id: { $in: batchIds } }, { projection: { name: 1 } }).toArray(),
      db.collection<Str & { name: string }>("training_programs").find({ _id: { $in: programIds } }, { projection: { name: 1 } }).toArray(),
      db.collection<AdminUserLite>("admin_users").find({ studentId: { $in: studentIds } }, { projection: { studentId: 1 } }).toArray(),
    ]);
    const bName = new Map(batches.map((b) => [b._id, b.name]));
    const pName = new Map(programs.map((p) => [p._id, p.name]));
    const tms = new Set(tmsLogins.map((u) => u.studentId));
    for (const s of studs) {
      const mine = enrolments.filter((e) => e.studentId === s._id);
      const bIds = Array.from(new Set(mine.map((e) => e.batchId)));
      const pIds = Array.from(new Set(mine.map((e) => e.programId)));
      Object.assign(out.get(`student:${s._id}`)!, {
        name: s.fullName,
        email: s.email ?? null,
        code: s.studentCode ?? null,
        batchIds: bIds,
        batchNames: bIds.map((b) => bName.get(b) ?? "—"),
        programIds: pIds,
        programNames: pIds.map((p) => pName.get(p) ?? "—"),
        hasLogin: extStu.has(s._id) || tms.has(s._id),
        exists: !s.deletedAt,
      });
    }
  }
  return out;
}

// ── Logins behind candidates (for notifications) ────────────────────────────

/** `admin_users` ids (staff bell) and `external_users` ids (portal bell) that act as these candidates. */
export async function loginsForCandidates(refs: CandidateRef[]): Promise<{ staff: Map<string, string[]>; portal: Map<string, string[]> }> {
  const db = await getDb();
  const staff = new Map<string, string[]>();
  const portal = new Map<string, string[]>();
  const push = (m: Map<string, string[]>, k: string, v: string) => m.set(k, Array.from(new Set([...(m.get(k) ?? []), v])));
  const ids = (k: CandidateKind) => Array.from(new Set(refs.filter((r) => r.kind === k).map((r) => r.id)));
  const empIds = ids("employee");
  const appIds = ids("applicant");
  const studentIds = ids("student");
  for (const u of ids("user")) push(staff, `user:${u}`, u);

  if (empIds.length) {
    const emps = await db.collection<Employee>(EMPLOYEES_COLLECTION).find({ _id: { $in: empIds } }, { projection: { adminUserId: 1 } }).toArray();
    const users = await db
      .collection<AdminUserLite>("admin_users")
      .find({ $or: [{ employeeId: { $in: empIds } }, { _id: { $in: oid(emps.map((e) => e.adminUserId).filter((v): v is string => !!v)) } }] }, { projection: { employeeId: 1 } })
      .toArray();
    const byAdmin = new Map(emps.filter((e) => e.adminUserId).map((e) => [e.adminUserId as string, e._id]));
    for (const u of users) {
      const emp = u.employeeId ?? byAdmin.get(u._id.toString());
      if (emp) push(staff, `employee:${emp}`, u._id.toString());
    }
  }
  if (appIds.length || studentIds.length) {
    const ext = await db
      .collection<ExternalUserLite>("external_users")
      .find({ $or: [{ applicationId: { $in: appIds } }, { studentId: { $in: studentIds } }], status: { $ne: "suspended" } }, { projection: { applicationId: 1, studentId: 1 } })
      .toArray();
    for (const x of ext) {
      if (x.applicationId && appIds.includes(x.applicationId)) push(portal, `applicant:${x.applicationId}`, x._id);
      if (x.studentId && studentIds.includes(x.studentId)) push(portal, `student:${x.studentId}`, x._id);
    }
  }
  if (studentIds.length) {
    const tms = await db.collection<AdminUserLite>("admin_users").find({ studentId: { $in: studentIds } }, { projection: { studentId: 1 } }).toArray();
    for (const u of tms) if (u.studentId) push(staff, `student:${u.studentId}`, u._id.toString());
  }
  return { staff, portal };
}

/** Short label for a target selection, e.g. "Department: Engineering, Sales". */
export function describeTarget(t: Target, dir: Directory): string {
  const pick = (opts: Option[]) => t.ids.map((id) => opts.find((o) => o.value === id)?.label ?? id);
  const map: Record<TargetType, Option[]> = {
    department: dir.departments,
    designation: dir.designations,
    team: dir.teams,
    employment_type: dir.employmentTypes,
    employee: dir.employees,
    platform_role: dir.platformRoles,
    user: dir.users,
    applicant: dir.applicants,
    applicant_position: dir.positions,
    student: dir.students,
    batch: dir.batches,
    program: dir.programs,
  };
  const names = pick(map[t.type]);
  return names.length > 4 ? `${names.slice(0, 4).join(", ")} +${names.length - 4}` : names.join(", ");
}
