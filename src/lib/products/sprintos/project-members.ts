import { pmsEvents } from "@/lib/notify/triggers/pms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/sprintos/db";
import { listEmployeeOptions, employeeFullName, EMPLOYEES_COLLECTION, type Employee } from "@/lib/products/talentos/employees";
import { DEFAULT_MEMBER_ROLE, type ProjectMemberRole } from "@/lib/products/sprintos/constants";

/**
 * Project team allocation. Members are `hrms_employees` — this is the HRMS
 * integration point. One employee can be on many projects; `allocationPercent`
 * is their planned share of a full-time capacity on that project.
 */

export const MEMBERS_COLLECTION = "pms_project_members";
const PROJECTS_COLLECTION = "pms_projects";

export interface ProjectMember extends AuditFields {
  _id: string;
  projectId: string;
  employeeId: string;
  role: ProjectMemberRole;
  allocationPercent: number;
  /** What the client is billed per hour for this person. */
  billableRate: number | null;
  /** What the company pays per hour for this person (drives profit/loss). */
  costRate: number | null;
  active: boolean;
}

export interface ProjectMemberWithName extends ProjectMember {
  employeeName: string;
  employeeCode: string;
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ProjectMember>(MEMBERS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ projectId: 1, employeeId: 1 }).catch(() => {}),
      collection.createIndex({ employeeId: 1, active: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listProjectMembers(projectId: string): Promise<ProjectMemberWithName[]> {
  const collection = await getCollection();
  const rows = await collection.find({ projectId, ...notDeleted }).toArray();
  if (rows.length === 0) return [];

  const db = await getDb();
  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);
  const empDocs = await employees
    .find(
      { _id: { $in: rows.map((r) => r.employeeId) } },
      { projection: { firstName: 1, lastName: 1, employeeCode: 1 } }
    )
    .toArray();
  const empMap = new Map(empDocs.map((e) => [e._id, e]));

  return rows
    .map((r) => {
      const e = empMap.get(r.employeeId);
      return {
        ...r,
        employeeName: e ? employeeFullName(e) : "Unknown employee",
        employeeCode: e?.employeeCode ?? "—",
      };
    })
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName));
}

export async function countMembers(projectId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ projectId, active: true, ...notDeleted });
}

/** Projects (ids) a given employee is actively assigned to (excludes PM-only links). */
export async function projectIdsForEmployee(employeeId: string): Promise<string[]> {
  const collection = await getCollection();
  const ids = await collection.distinct("projectId", { employeeId, active: true, ...notDeleted });
  return ids as string[];
}

/** Employees available to add to a project (all HRMS employees). */
export async function availableEmployees() {
  return listEmployeeOptions({ activeOnly: true });
}

// ---------------------------------------------------------------------------
// Workload analytics — powers the dashboard "team workload / utilization".
// ---------------------------------------------------------------------------

export interface EmployeeWorkload {
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  projectCount: number;
  totalAllocationPercent: number;
}

export async function employeeWorkload(): Promise<EmployeeWorkload[]> {
  const collection = await getCollection();
  const db = await getDb();
  const projects = db.collection<{ _id: string; status: string; deletedAt: Date | null }>(PROJECTS_COLLECTION);

  // Only count allocations on non-deleted, non-terminal projects.
  const openProjectIds = await projects.distinct("_id", {
    deletedAt: null,
    status: { $nin: ["completed", "cancelled"] },
  });

  const rows = await collection
    .aggregate<{ _id: string; projectCount: number; totalAllocationPercent: number }>([
      { $match: { active: true, deletedAt: null, projectId: { $in: openProjectIds } } },
      {
        $group: {
          _id: "$employeeId",
          projectCount: { $sum: 1 },
          totalAllocationPercent: { $sum: "$allocationPercent" },
        },
      },
    ])
    .toArray();

  if (rows.length === 0) return [];

  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);
  const empDocs = await employees
    .find({ _id: { $in: rows.map((r) => r._id) } }, { projection: { firstName: 1, lastName: 1, employeeCode: 1 } })
    .toArray();
  const empMap = new Map(empDocs.map((e) => [e._id, e]));

  return rows
    .map((r) => {
      const e = empMap.get(r._id);
      return {
        employeeId: r._id,
        employeeName: e ? employeeFullName(e) : "Unknown",
        employeeCode: e?.employeeCode ?? "—",
        projectCount: r.projectCount,
        totalAllocationPercent: r.totalAllocationPercent,
      };
    })
    .sort((a, b) => b.totalAllocationPercent - a.totalAllocationPercent);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface MemberWriteData {
  employeeId: string;
  role: ProjectMemberRole;
  allocationPercent: number;
  billableRate: number | null;
  costRate: number | null;
  active: boolean;
}

/** Adds a member, or reactivates + updates an existing (project, employee) pair. */
export async function upsertMember(
  projectId: string,
  data: MemberWriteData,
  actorId: string
): Promise<{ ok: true; created: boolean } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ projectId, employeeId: data.employeeId, ...notDeleted });
  if (existing) {
    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          role: data.role,
          allocationPercent: clampAllocation(data.allocationPercent),
          billableRate: data.billableRate,
          costRate: data.costRate,
          active: data.active,
          ...updateStamp(actorId),
        },
      }
    );
    return { ok: true, created: false };
  }
  await collection.insertOne({
    _id: newId(),
    projectId,
    employeeId: data.employeeId,
    role: data.role ?? DEFAULT_MEMBER_ROLE,
    allocationPercent: clampAllocation(data.allocationPercent),
    billableRate: data.billableRate,
    costRate: data.costRate,
    active: data.active,
    ...createStamp(actorId),
  });
  try {
    const { getProject } = await import("@/lib/products/sprintos/projects");
    const project = await getProject(projectId);
    if (project) await pmsEvents.addedToProject(data.employeeId, { id: projectId, name: project.name }, String(data.role ?? DEFAULT_MEMBER_ROLE));
  } catch {
    /* a notification must not fail adding a member */
  }
  return { ok: true, created: true };
}

export async function updateMember(
  memberId: string,
  data: Partial<MemberWriteData>,
  actorId: string
): Promise<ProjectMember | null> {
  const collection = await getCollection();
  const set: Record<string, unknown> = { ...data, ...updateStamp(actorId) };
  if (typeof data.allocationPercent === "number") set.allocationPercent = clampAllocation(data.allocationPercent);
  return collection.findOneAndUpdate({ _id: memberId, ...notDeleted }, { $set: set }, { returnDocument: "after" });
}

export async function removeMember(memberId: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: memberId, ...notDeleted },
    { $set: { deletedAt: new Date(), active: false, ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

export async function getMember(memberId: string): Promise<ProjectMember | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: memberId, ...notDeleted });
}

function clampAllocation(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
