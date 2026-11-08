import "server-only";
import { getDb } from "@/lib/mongodb";

/**
 * Cross-product read-only lookups used by PRMS forms and filters. Departments and
 * employees come from HRMS; projects from PMS; clients from PMS (profit-centre
 * reports, Phase 8). PRMS never writes to those collections.
 */

export { listDepartments } from "@/lib/products/talentos/departments";
export { listEmployeeOptions } from "@/lib/products/talentos/employees";
export { listClientOptions } from "@/lib/products/sprintos/clients";

export interface DepartmentOption {
  _id: string;
  name: string;
  code: string;
}

export interface ProjectOption {
  _id: string;
  name: string;
  projectCode: string;
}

/** Lightweight active-project list for requisition / expense / PO pickers. */
export async function listProjectOptions(): Promise<ProjectOption[]> {
  const db = await getDb();
  const docs = await db
    .collection<{ _id: string; name?: string; projectCode?: string }>("pms_projects")
    .find({ deletedAt: null }, { projection: { name: 1, projectCode: 1 } })
    .sort({ name: 1 })
    .toArray();
  return docs.map((d) => ({
    _id: d._id,
    name: d.name ?? "(untitled project)",
    projectCode: d.projectCode ?? "",
  }));
}

/** Resolve a set of department ids to `{ id: name }` for table rendering. */
export async function departmentNameMap(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const db = await getDb();
  const docs = await db
    .collection<{ _id: string; name?: string }>("hrms_departments")
    .find({ _id: { $in: unique } }, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((d) => [d._id, d.name ?? "—"]));
}

/** Resolve a set of project ids to `{ id: name }` for table rendering. */
export async function projectNameMap(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  if (unique.length === 0) return new Map();
  const db = await getDb();
  const docs = await db
    .collection<{ _id: string; name?: string }>("pms_projects")
    .find({ _id: { $in: unique } }, { projection: { name: 1 } })
    .toArray();
  return new Map(docs.map((d) => [d._id, d.name ?? "—"]));
}
