import "server-only";
import type { Filter } from "mongodb";
import { COLLECTIONS, cleanIsoDate, createStamp, escapeRegex, newId, nextSequence, seoCollection, str, todayIso, updateStamp, type Stamps } from "@/lib/products/rankmax-ai/db";
import { cleanPath } from "@/lib/products/rankmax-ai/pages";
import { SeoInputError, type SeoViewer } from "@/lib/products/rankmax-ai/viewer";
import type { CheckId } from "@/lib/products/rankmax-ai/checks";

/**
 * SEO tasks — the work queue for fixing SEO problems. A task can point at a
 * URL and/or an issue. Anyone with MANAGE_TASKS can create tasks and work on
 * the ones assigned to (or created by) them; manager-tier users manage the
 * whole team's tasks. (General project work stays in PMS — these are SEO-only.)
 */

export const TASK_TYPES = {
  fix_metadata: "Fix metadata",
  fix_broken_links: "Fix broken links",
  optimize_page: "Optimize page",
  add_schema: "Add schema",
  internal_linking: "Improve internal linking",
  fix_indexing: "Fix indexing",
  page_speed: "Improve page speed",
  create_redirect: "Create redirect",
  optimize_images: "Optimize images",
  content: "Improve content SEO",
  technical: "Technical fix",
  other: "Other",
} as const;
export type TaskType = keyof typeof TASK_TYPES;

export const TASK_STATUSES = { todo: "To Do", in_progress: "In Progress", in_review: "In Review", done: "Done", cancelled: "Cancelled" } as const;
export type TaskStatus = keyof typeof TASK_STATUSES;
export const TASK_PRIORITIES = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" } as const;
export type TaskPriority = keyof typeof TASK_PRIORITIES;

export interface TaskComment {
  id: string;
  by: string;
  byEmail: string;
  text: string;
  at: Date;
}

export interface SeoTask extends Stamps {
  _id: string;
  code: string;
  title: string;
  type: TaskType;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  dueDate: string | null;
  url: string | null;
  issueId: string | null;
  completedAt: Date | null;
  comments: TaskComment[];
}

/** Which task type fixes which audit check — used when creating a task from an issue. */
export function taskTypeForCheck(checkId: CheckId | "manual"): TaskType {
  const map: Partial<Record<CheckId, TaskType>> = {
    title_missing: "fix_metadata",
    title_too_long: "fix_metadata",
    title_too_short: "fix_metadata",
    title_duplicate: "fix_metadata",
    description_missing: "fix_metadata",
    description_too_long: "fix_metadata",
    description_too_short: "fix_metadata",
    description_duplicate: "fix_metadata",
    og_missing: "fix_metadata",
    twitter_missing: "fix_metadata",
    canonical_missing: "fix_metadata",
    broken_internal_links: "fix_broken_links",
    broken_external_links: "fix_broken_links",
    links_to_redirects: "fix_broken_links",
    structured_data_missing: "add_schema",
    structured_data_invalid: "add_schema",
    orphan_page: "internal_linking",
    low_internal_links: "internal_linking",
    noindex: "fix_indexing",
    blocked_by_robots: "fix_indexing",
    sitemap_non_indexable: "fix_indexing",
    not_in_sitemap: "fix_indexing",
    slow_response: "page_speed",
    cwv_poor: "page_speed",
    cwv_needs_improvement: "page_speed",
    render_blocking_scripts: "page_speed",
    large_html: "page_speed",
    http_4xx: "create_redirect",
    redirect_chain: "create_redirect",
    temporary_redirect: "create_redirect",
    img_alt_missing: "optimize_images",
    images_no_dimensions: "optimize_images",
    thin_content: "content",
    low_readability: "content",
    stale_content: "content",
    duplicate_content: "content",
    focus_keyword_placement: "optimize_page",
    h1_missing: "optimize_page",
    h1_multiple: "optimize_page",
    heading_order: "optimize_page",
  };
  return checkId === "manual" ? "other" : map[checkId] ?? "technical";
}

export async function tasksCol() {
  return seoCollection<SeoTask>(COLLECTIONS.tasks);
}

export function canWorkOnTask(viewer: SeoViewer, task: Pick<SeoTask, "assigneeId" | "createdBy">): boolean {
  return viewer.isManagerTier || task.assigneeId === viewer.userId || task.createdBy === viewer.userId;
}

export interface TaskInput {
  title: string;
  type: string;
  description?: string;
  priority?: string;
  status?: string;
  assigneeId?: string;
  dueDate?: string;
  url?: string;
  issueId?: string;
}

function toFields(input: TaskInput) {
  const title = str(input.title, 200);
  if (!title) throw new SeoInputError("Title is required.");
  const url = str(input.url, 500);
  const path = url ? cleanPath(url.replace(/^https?:\/\/[^/]+/i, "") || "/") : null;
  if (url && !path) throw new SeoInputError("Related URL must be a site path such as /services.");
  const due = str(input.dueDate, 10);
  const dueDate = due ? cleanIsoDate(due) : null;
  if (due && !dueDate) throw new SeoInputError("Due date is not a valid date.");
  return {
    title,
    type: (input.type in TASK_TYPES ? input.type : "other") as TaskType,
    description: str(input.description, 5000),
    priority: (input.priority && input.priority in TASK_PRIORITIES ? input.priority : "medium") as TaskPriority,
    status: (input.status && input.status in TASK_STATUSES ? input.status : "todo") as TaskStatus,
    assigneeId: str(input.assigneeId, 60) || null,
    dueDate,
    url: path,
    issueId: str(input.issueId, 60) || null,
  };
}

export async function createTask(input: TaskInput, actorId: string): Promise<SeoTask> {
  const f = toFields(input);
  const seq = await nextSequence("task");
  const doc: SeoTask = { _id: newId(), code: `SEO-${String(seq).padStart(4, "0")}`, ...f, completedAt: f.status === "done" ? new Date() : null, comments: [], ...createStamp(actorId) };
  await (await tasksCol()).insertOne(doc);
  return doc;
}

export async function updateTask(id: string, input: TaskInput, viewer: SeoViewer): Promise<{ before: SeoTask; after: SeoTask }> {
  const c = await tasksCol();
  const before = await c.findOne({ _id: id });
  if (!before) throw new SeoInputError("Task not found.");
  if (!canWorkOnTask(viewer, before)) throw new SeoInputError("You can only update tasks assigned to or created by you.");
  const f = toFields(input);
  // Non-managers can't hand a task to someone else.
  if (!viewer.isManagerTier && f.assigneeId !== before.assigneeId && f.assigneeId !== viewer.userId) throw new SeoInputError("Only an SEO manager can reassign a task to someone else.");
  const set = { ...f, completedAt: f.status === "done" ? before.completedAt ?? new Date() : null, ...updateStamp(viewer.userId) };
  await c.updateOne({ _id: id }, { $set: set });
  return { before, after: { ...before, ...set } };
}

export async function setTaskStatus(id: string, status: TaskStatus, viewer: SeoViewer): Promise<{ before: SeoTask; after: SeoTask }> {
  const c = await tasksCol();
  const before = await c.findOne({ _id: id });
  if (!before) throw new SeoInputError("Task not found.");
  if (!canWorkOnTask(viewer, before)) throw new SeoInputError("You can only update tasks assigned to or created by you.");
  const set = { status, completedAt: status === "done" ? before.completedAt ?? new Date() : null, ...updateStamp(viewer.userId) };
  await c.updateOne({ _id: id }, { $set: set });
  return { before, after: { ...before, ...set } };
}

export async function addTaskComment(id: string, text: string, viewer: SeoViewer): Promise<SeoTask> {
  const c = await tasksCol();
  const task = await c.findOne({ _id: id });
  if (!task) throw new SeoInputError("Task not found.");
  if (!canWorkOnTask(viewer, task)) throw new SeoInputError("You can only comment on tasks assigned to or created by you.");
  const body = str(text, 2000);
  if (!body) throw new SeoInputError("Comment is empty.");
  const comment: TaskComment = { id: newId(), by: viewer.userId, byEmail: viewer.email, text: body, at: new Date() };
  await c.updateOne({ _id: id }, { $push: { comments: comment }, $set: updateStamp(viewer.userId) });
  return task;
}

export async function deleteTask(id: string): Promise<SeoTask | null> {
  const c = await tasksCol();
  const t = await c.findOne({ _id: id });
  if (t) await c.deleteOne({ _id: id });
  return t;
}

export async function getTask(id: string): Promise<SeoTask | null> {
  return (await tasksCol()).findOne({ _id: id });
}

export interface TaskListOptions {
  search?: string;
  status?: string;
  type?: string;
  priority?: string;
  assignee?: string;
  due?: string;
  url?: string;
  issue?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export function taskFilter(o: TaskListOptions, viewer?: SeoViewer): Filter<SeoTask> {
  const f: Filter<SeoTask> = {};
  if (o.search) {
    const rx = new RegExp(escapeRegex(o.search), "i");
    f.$or = [{ title: rx }, { code: rx }, { url: rx }];
  }
  if (o.status === "open") f.status = { $in: ["todo", "in_progress", "in_review"] };
  else if (o.status && o.status in TASK_STATUSES) f.status = o.status as TaskStatus;
  if (o.type && o.type in TASK_TYPES) f.type = o.type as TaskType;
  if (o.priority && o.priority in TASK_PRIORITIES) f.priority = o.priority as TaskPriority;
  if (o.assignee === "me" && viewer) f.assigneeId = viewer.userId;
  else if (o.assignee === "unassigned") f.assigneeId = null;
  else if (o.assignee) f.assigneeId = o.assignee;
  if (o.due === "overdue") Object.assign(f, { dueDate: { $lt: todayIso(), $ne: null }, status: { $in: ["todo", "in_progress", "in_review"] } });
  if (o.url) f.url = o.url;
  if (o.issue) f.issueId = o.issue;
  return f;
}

export async function listTasks(o: TaskListOptions, viewer: SeoViewer) {
  const c = await tasksCol();
  const f = taskFilter(o, viewer);
  const sortField: Record<string, string> = { code: "code", title: "title", due: "dueDate", priority: "priority", status: "status", updated: "updatedAt" };
  const sortBy = sortField[o.sortBy ?? ""] ?? "updatedAt";
  const dir = o.sortDir === "asc" ? 1 : -1;
  const page = Math.max(o.page ?? 1, 1);
  const pageSize = Math.min(Math.max(o.pageSize ?? 30, 1), 1000);
  const [items, total] = await Promise.all([c.find(f).sort({ [sortBy]: dir, code: -1 }).skip((page - 1) * pageSize).limit(pageSize).toArray(), c.countDocuments(f)]);
  return { items, total, page, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function taskStats(viewerId?: string) {
  const c = await tasksCol();
  const open = { status: { $in: ["todo", "in_progress", "in_review"] as TaskStatus[] } };
  const [openCount, overdue, mine, doneLast30] = await Promise.all([
    c.countDocuments(open),
    c.countDocuments({ ...open, dueDate: { $lt: todayIso(), $ne: null } }),
    viewerId ? c.countDocuments({ ...open, assigneeId: viewerId }) : Promise.resolve(0),
    c.countDocuments({ status: "done", completedAt: { $gte: new Date(Date.now() - 30 * 86400000) } }),
  ]);
  return { open: openCount, overdue, mine, doneLast30 };
}
