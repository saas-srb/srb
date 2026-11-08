import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { notDeleted } from "@/lib/products/sprintos/db";
import { TASKS_COLLECTION, type Task } from "@/lib/products/sprintos/tasks";
import { MILESTONES_COLLECTION, type Milestone } from "@/lib/products/sprintos/milestones";
import type { TaskStatus, MilestoneStatus, Priority } from "@/lib/products/sprintos/constants";

/**
 * Cross-project Tasks and Milestones search for the Director. Both
 * `src/lib/sprintos/tasks.ts`'s and `src/lib/sprintos/milestones.ts`'s own filter
 * builders are project-scoped (a task/milestone is always managed from its
 * one project's page in the native PMS product — there's no "all tasks across
 * every project" concept anywhere else in the app either). Real gap, same as
 * the CRM cross-category leads search — new global search/pagination here,
 * row mutations still go through the existing `updateTask`/`deleteTask` /
 * `updateMilestone`/`deleteMilestone` unchanged.
 */

export interface TaskFilter {
  search?: string;
  status?: TaskStatus;
  priority?: Priority;
  projectId?: string;
  assigneeId?: string;
}

export interface SearchAllTasksOptions extends TaskFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "dueDate" | "title" | "priority";
  sortDir?: "asc" | "desc";
}

function buildTaskFilter(opts: TaskFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ title: rx }, { taskCode: rx }, { description: rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.priority) filter.priority = opts.priority;
  if (opts.projectId) filter.projectId = opts.projectId;
  if (opts.assigneeId) filter.assigneeId = opts.assigneeId;
  return filter;
}

export async function searchAllTasks(opts: SearchAllTasksOptions = {}) {
  const db = await getDb();
  const collection = db.collection<Task>(TASKS_COLLECTION);
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildTaskFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportAllTasks(opts: TaskFilter & { ids?: string[] } = {}): Promise<Task[]> {
  const db = await getDb();
  const collection = db.collection<Task>(TASKS_COLLECTION);
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildTaskFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
}

export interface MilestoneFilter {
  search?: string;
  status?: MilestoneStatus;
  projectId?: string;
}

export interface SearchAllMilestonesOptions extends MilestoneFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "dueDate" | "name";
  sortDir?: "asc" | "desc";
}

function buildMilestoneFilter(opts: MilestoneFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { description: rx }];
  }
  if (opts.status) filter.status = opts.status;
  if (opts.projectId) filter.projectId = opts.projectId;
  return filter;
}

export async function searchAllMilestones(opts: SearchAllMilestonesOptions = {}) {
  const db = await getDb();
  const collection = db.collection<Milestone>(MILESTONES_COLLECTION);
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildMilestoneFilter(opts);
  const sortField = opts.sortBy ?? "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function exportAllMilestones(opts: MilestoneFilter & { ids?: string[] } = {}): Promise<Milestone[]> {
  const db = await getDb();
  const collection = db.collection<Milestone>(MILESTONES_COLLECTION);
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildMilestoneFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(5000).toArray();
}
