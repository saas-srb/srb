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
} from "@/lib/products/sprintos/db";
import {
  DEFAULT_PROJECT_STATUS,
  DEFAULT_PRIORITY,
  ACTIVE_PROJECT_STATUSES,
  canTransitionProject,
  computeProjectHealth,
  type ProjectStatus,
  type Priority,
  type ProjectHealth,
} from "@/lib/products/sprintos/constants";

export const PROJECTS_COLLECTION = "pms_projects";
const MEMBERS_COLLECTION = "pms_project_members";
const PROJECT_CODE_PREFIX = "PRJ";

export interface Project extends AuditFields {
  _id: string;
  projectCode: string;
  name: string;
  clientId: string;
  category: string | null;
  description: string | null;
  priority: Priority;
  status: ProjectStatus;
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null; // ISO yyyy-mm-dd
  estimatedBudget: number | null;
  estimatedHours: number | null;
  currency: string;
  /** `hrms_employees` _id of the project manager. */
  projectManagerId: string | null;
  technologies: string[];
  /** 0–100. Manual in Phase 1; task-derived in a later phase. */
  progressPercent: number;
}

export interface SerializedProject extends Omit<Project, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  health: ProjectHealth;
}

export function serializeProject(p: Project, now: Date = new Date()): SerializedProject {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
    health: computeProjectHealth(p, now),
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Project>(PROJECTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ projectCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ clientId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ priority: 1 }).catch(() => {}),
      collection.createIndex({ projectManagerId: 1 }).catch(() => {}),
      collection.createIndex({ endDate: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateProjectCode(): Promise<string> {
  const seq = await nextSequence("project_code");
  return formatCode(PROJECT_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getProject(id: string): Promise<Project | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getProjectByCode(code: string): Promise<Project | null> {
  const collection = await getCollection();
  return collection.findOne({ projectCode: code, ...notDeleted });
}

export interface ProjectFilter {
  search?: string;
  status?: ProjectStatus;
  priority?: Priority;
  clientId?: string;
  projectManagerId?: string;
  category?: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** Restrict to projects the given employee manages or is a member of. */
  restrictToEmployeeId?: string;
}

async function buildFilter(opts: ProjectFilter): Promise<Record<string, unknown>> {
  const filter: Record<string, unknown> = { ...notDeleted };

  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { projectCode: rx }, { description: rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.priority) filter.priority = opts.priority;
  if (opts.clientId) filter.clientId = opts.clientId;
  if (opts.projectManagerId) filter.projectManagerId = opts.projectManagerId;
  if (opts.category) filter.category = opts.category;
  if (opts.dateFrom || opts.dateTo) {
    const r: Record<string, Date> = {};
    if (opts.dateFrom) r.$gte = opts.dateFrom;
    if (opts.dateTo) r.$lte = opts.dateTo;
    filter.createdAt = r;
  }

  if (opts.restrictToEmployeeId) {
    const db = await getDb();
    const members = db.collection(MEMBERS_COLLECTION);
    const memberProjectIds = await members.distinct("projectId", {
      employeeId: opts.restrictToEmployeeId,
      active: true,
      deletedAt: null,
    });
    filter.$and = [
      {
        $or: [
          { projectManagerId: opts.restrictToEmployeeId },
          { _id: { $in: memberProjectIds as string[] } },
        ],
      },
    ];
  }
  return filter;
}

export interface SearchProjectsOptions extends ProjectFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name" | "projectCode" | "endDate" | "priority" | "progressPercent";
  sortDir?: "asc" | "desc";
}

export async function searchProjects(opts: SearchProjectsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = await buildFilter(opts);

  const sortField =
    opts.sortBy === "name"
      ? "name"
      : opts.sortBy === "projectCode"
        ? "projectCode"
        : opts.sortBy === "endDate"
          ? "endDate"
          : opts.sortBy === "priority"
            ? "priority"
            : opts.sortBy === "progressPercent"
              ? "progressPercent"
              : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function listProjectsForClient(clientId: string): Promise<Project[]> {
  const collection = await getCollection();
  return collection.find({ clientId, ...notDeleted }).sort({ createdAt: -1 }).toArray();
}

export async function listCategories(): Promise<string[]> {
  const collection = await getCollection();
  const values = await collection.distinct("category", notDeleted);
  return values.filter((v): v is string => typeof v === "string" && v.length > 0).sort();
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportProjects(opts: ProjectFilter & { ids?: string[] } = {}): Promise<Project[]> {
  const collection = await getCollection();
  const filter =
    opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : await buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

export async function countProjects(filter: ProjectFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(await buildFilter(filter));
}

export async function countActiveProjects(): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ status: { $in: ACTIVE_PROJECT_STATUSES }, ...notDeleted });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface ProjectWriteData {
  name: string;
  clientId: string;
  category: string | null;
  description: string | null;
  priority: Priority;
  status: ProjectStatus;
  startDate: string | null;
  endDate: string | null;
  estimatedBudget: number | null;
  estimatedHours: number | null;
  currency: string;
  projectManagerId: string | null;
  technologies: string[];
  progressPercent: number;
}

export async function createProject(data: ProjectWriteData, actorId: string): Promise<Project> {
  const collection = await getCollection();
  const doc: Project = {
    _id: newId(),
    projectCode: await generateProjectCode(),
    name: data.name,
    clientId: data.clientId,
    category: data.category,
    description: data.description,
    priority: data.priority ?? DEFAULT_PRIORITY,
    status: data.status ?? DEFAULT_PROJECT_STATUS,
    startDate: data.startDate,
    endDate: data.endDate,
    estimatedBudget: data.estimatedBudget,
    estimatedHours: data.estimatedHours,
    currency: data.currency,
    projectManagerId: data.projectManagerId,
    technologies: data.technologies ?? [],
    progressPercent: clampPercent(data.progressPercent),
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await emitEvent("project.created", { entity: { type: "project", id: doc._id, label: doc.name, url: `/sprintos/projects/${doc._id}` }, actorId, data: { name: doc.name, projectCode: doc.projectCode, priority: doc.priority, status: doc.status, estimatedBudget: doc.estimatedBudget } });
  return doc;
}

export async function updateProject(
  id: string,
  data: Partial<ProjectWriteData>,
  actorId: string
): Promise<Project | null> {
  const collection = await getCollection();
  const set: Record<string, unknown> = { ...data, ...updateStamp(actorId) };
  if (typeof data.progressPercent === "number") set.progressPercent = clampPercent(data.progressPercent);
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: set },
    { returnDocument: "after" }
  );
}

/** Guarded status change. Returns `{ ok:false, reason }` for an illegal transition. */
export async function changeProjectStatus(
  id: string,
  status: ProjectStatus,
  actorId: string
): Promise<{ ok: true; project: Project } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const current = await collection.findOne({ _id: id, ...notDeleted });
  if (!current) return { ok: false, reason: "Project not found." };
  if (!canTransitionProject(current.status, status)) {
    return { ok: false, reason: `Cannot move a project from "${current.status}" to "${status}".` };
  }
  const set: Record<string, unknown> = { status, ...updateStamp(actorId) };
  if (status === "completed") set.progressPercent = 100;
  const project = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: set },
    { returnDocument: "after" }
  );
  return project ? { ok: true, project } : { ok: false, reason: "Project not found." };
}

/** Soft-delete. Also soft-deletes the project's membership rows. */
export async function deleteProject(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const db = await getDb();
  const members = db.collection(MEMBERS_COLLECTION);
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  await members.updateMany(
    { projectId: id, deletedAt: null },
    { $set: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actorId } }
  );
  return { ok: res.modifiedCount === 1 };
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}
