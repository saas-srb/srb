import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/talentos/db";
import { EMPLOYEES_COLLECTION, employeeFullName, type Employee } from "@/lib/products/talentos/employees";

/**
 * Persisted reporting closure table (`hrms_reporting_hierarchy`): one row per
 * (employeeId, managerId, depth) ancestor pair. Rebuilt for an employee (and
 * its whole subtree) whenever a reporting manager changes, so the org tree and
 * "everyone under X" queries are a single indexed lookup rather than a
 * recursive walk. `depth = 1` is the direct manager.
 */

export const HIERARCHY_COLLECTION = "hrms_reporting_hierarchy";

export interface HierarchyRow {
  _id: string; // `${employeeId}:${managerId}`
  employeeId: string;
  managerId: string;
  depth: number;
  updatedAt: Date;
}

let indexesEnsured = false;

async function collections() {
  const db = await getDb();
  const hierarchy = db.collection<HierarchyRow>(HIERARCHY_COLLECTION);
  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      hierarchy.createIndex({ employeeId: 1 }).catch(() => {}),
      hierarchy.createIndex({ managerId: 1 }).catch(() => {}),
    ]);
  }
  return { db, hierarchy, employees };
}

/** Direct-manager chain for one employee, nearest first. */
async function ancestorChain(employees: Awaited<ReturnType<typeof collections>>["employees"], employeeId: string): Promise<string[]> {
  const chain: string[] = [];
  const seen = new Set<string>([employeeId]);
  let current = await employees.findOne({ _id: employeeId, ...notDeleted }, { projection: { "professional.reportingManagerId": 1 } });
  while (current?.professional?.reportingManagerId) {
    const managerId = current.professional.reportingManagerId;
    if (seen.has(managerId)) break; // cycle guard
    seen.add(managerId);
    chain.push(managerId);
    current = await employees.findOne({ _id: managerId, ...notDeleted }, { projection: { "professional.reportingManagerId": 1 } });
  }
  return chain;
}

async function directReports(employees: Awaited<ReturnType<typeof collections>>["employees"], managerId: string): Promise<string[]> {
  const rows = await employees
    .find({ "professional.reportingManagerId": managerId, ...notDeleted }, { projection: { _id: 1 } })
    .toArray();
  return rows.map((r) => r._id);
}

/**
 * Recomputes closure rows for `employeeId` and every descendant. Call after
 * creating an employee or changing anyone's reporting manager.
 */
export async function rebuildHierarchyFor(employeeId: string): Promise<void> {
  const { hierarchy, employees } = await collections();

  // BFS over the subtree rooted at employeeId.
  const queue = [employeeId];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const chain = await ancestorChain(employees, current);
    await hierarchy.deleteMany({ employeeId: current });
    if (chain.length > 0) {
      await hierarchy.insertMany(
        chain.map((managerId, i) => ({
          _id: `${current}:${managerId}`,
          employeeId: current,
          managerId,
          depth: i + 1,
          updatedAt: new Date(),
        })),
        { ordered: false }
      );
    }

    for (const child of await directReports(employees, current)) {
      if (!visited.has(child)) queue.push(child);
    }
  }
}

/** Removes an employee from the closure table (on soft-delete). */
export async function removeFromHierarchy(employeeId: string): Promise<void> {
  const { hierarchy } = await collections();
  await hierarchy.deleteMany({ $or: [{ employeeId }, { managerId: employeeId }] });
}

export interface OrgNode {
  id: string;
  code: string;
  name: string;
  title: string | null;
  status: string;
  children: OrgNode[];
}

/** Builds the full org tree (roots = employees with no manager). */
export async function buildOrgTree(): Promise<OrgNode[]> {
  const { employees } = await collections();
  const all = await employees
    .find(notDeleted, {
      projection: { firstName: 1, lastName: 1, employeeCode: 1, status: 1, "professional.reportingManagerId": 1, "professional.designationId": 1 },
    })
    .toArray();

  const byManager = new Map<string | null, Employee[]>();
  for (const e of all) {
    const key = e.professional?.reportingManagerId ?? null;
    const list = byManager.get(key) ?? [];
    list.push(e);
    byManager.set(key, list);
  }

  const build = (managerId: string | null): OrgNode[] =>
    (byManager.get(managerId) ?? [])
      .sort((a, b) => employeeFullName(a).localeCompare(employeeFullName(b)))
      .map((e) => ({
        id: e._id,
        code: e.employeeCode,
        name: employeeFullName(e),
        title: e.professional?.designationId ?? null,
        status: e.status,
        children: build(e._id),
      }));

  // Anyone whose manager id doesn't resolve to a live employee is treated as a root.
  const liveIds = new Set(all.map((e) => e._id));
  const roots = build(null);
  for (const e of all) {
    const mgr = e.professional?.reportingManagerId;
    if (mgr && !liveIds.has(mgr)) {
      roots.push({
        id: e._id,
        code: e.employeeCode,
        name: employeeFullName(e),
        title: e.professional?.designationId ?? null,
        status: e.status,
        children: build(e._id),
      });
    }
  }
  return roots;
}
