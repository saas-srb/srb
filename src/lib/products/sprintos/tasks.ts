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
  DEFAULT_TASK_STATUS,
  DEFAULT_PRIORITY,
  TASK_STATUS_ORDER,
  isTaskDone,
  type TaskStatus,
  type Priority,
} from "@/lib/products/sprintos/constants";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";

export const TASKS_COLLECTION = "pms_tasks";
const TASK_CODE_PREFIX = "TSK";
const ORDER_GAP = 1024;

export interface Task extends AuditFields {
  _id: string;
  taskCode: string;
  projectId: string;
  /** Parent task for a subtask; null for a top-level task. */
  parentTaskId: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  /** `hrms_employees` _id, or null. */
  assigneeId: string | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  /** Sort key within a Kanban column (larger = lower). */
  orderKey: number;
  completedAt: Date | null;
}

export interface SerializedTask extends Omit<Task, "createdAt" | "updatedAt" | "deletedAt" | "completedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  completedAt: string | null;
}

export function serializeTask(t: Task): SerializedTask {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Task>(TASKS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ taskCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ projectId: 1, status: 1, orderKey: 1 }).catch(() => {}),
      collection.createIndex({ parentTaskId: 1 }).catch(() => {}),
      collection.createIndex({ assigneeId: 1, status: 1 }).catch(() => {}),
      collection.createIndex({ dueDate: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateTaskCode(): Promise<string> {
  const seq = await nextSequence("task_code");
  return formatCode(TASK_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTask(id: string): Promise<Task | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface TaskFilter {
  status?: TaskStatus;
  assigneeId?: string;
  priority?: Priority;
  label?: string;
  search?: string;
  /** When true, subtasks are included in the flat list. Default: top-level only. */
  includeSubtasks?: boolean;
}

function buildFilter(projectId: string, opts: TaskFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { projectId, ...notDeleted };
  if (!opts.includeSubtasks) filter.parentTaskId = null;
  if (opts.status) filter.status = opts.status;
  if (opts.assigneeId) filter.assigneeId = opts.assigneeId;
  if (opts.priority) filter.priority = opts.priority;
  if (opts.label) filter.labels = opts.label;
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ title: rx }, { taskCode: rx }, { description: rx }];
  }
  return filter;
}

export async function listTasks(projectId: string, opts: TaskFilter = {}): Promise<Task[]> {
  const collection = await getCollection();
  return collection
    .find(buildFilter(projectId, opts))
    .sort({ status: 1, orderKey: 1, createdAt: 1 })
    .toArray();
}

export async function listSubtasks(parentTaskId: string): Promise<Task[]> {
  const collection = await getCollection();
  return collection.find({ parentTaskId, ...notDeleted }).sort({ orderKey: 1, createdAt: 1 }).toArray();
}

/** Top-level tasks grouped into Kanban columns, ordered by `orderKey`. */
export async function boardTasks(projectId: string): Promise<Record<TaskStatus, Task[]>> {
  const tasks = await listTasks(projectId, {});
  const board = Object.fromEntries(TASK_STATUS_ORDER.map((s) => [s, [] as Task[]])) as Record<TaskStatus, Task[]>;
  for (const t of tasks) board[t.status]?.push(t);
  for (const s of TASK_STATUS_ORDER) board[s].sort((a, b) => a.orderKey - b.orderKey);
  return board;
}

export async function taskCountsByStatus(projectId: string): Promise<Record<string, number>> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string; count: number }>([
      { $match: { projectId, parentTaskId: null, deletedAt: null } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

export async function projectHasTasks(projectId: string): Promise<boolean> {
  const collection = await getCollection();
  const one = await collection.findOne({ projectId, parentTaskId: null, ...notDeleted }, { projection: { _id: 1 } });
  return one !== null;
}

export interface AssigneeTaskRow extends Task {
  projectName: string;
  projectCode: string;
}

/** Tasks assigned to an employee across every project — powers "My Work" / "My Tasks". */
export async function tasksForAssignee(
  employeeId: string,
  opts: { includeDone?: boolean } = {}
): Promise<AssigneeTaskRow[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { assigneeId: employeeId, ...notDeleted };
  if (!opts.includeDone) filter.status = { $ne: "done" };
  const rows = await collection.find(filter).sort({ dueDate: 1, orderKey: 1 }).toArray();
  if (rows.length === 0) return [];

  const db = await getDb();
  const projects = db.collection<{ _id: string; name: string; projectCode: string }>(PROJECTS_COLLECTION);
  const projDocs = await projects
    .find({ _id: { $in: Array.from(new Set(rows.map((r) => r.projectId))) } }, { projection: { name: 1, projectCode: 1 } })
    .toArray();
  const projMap = new Map(projDocs.map((p) => [p._id, p]));
  return rows.map((r) => ({
    ...r,
    projectName: projMap.get(r.projectId)?.name ?? "Unknown project",
    projectCode: projMap.get(r.projectId)?.projectCode ?? "—",
  }));
}

export async function listProjectLabels(projectId: string): Promise<string[]> {
  const collection = await getCollection();
  const values = await collection.distinct("labels", { projectId, ...notDeleted });
  return (values as string[]).filter(Boolean).sort();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface TaskWriteData {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: Priority;
  assigneeId: string | null;
  labels: string[];
  startDate: string | null;
  dueDate: string | null;
  estimateHours: number | null;
  parentTaskId: string | null;
}

async function nextOrderKey(projectId: string, status: TaskStatus): Promise<number> {
  const collection = await getCollection();
  const last = await collection
    .find({ projectId, status, ...notDeleted })
    .sort({ orderKey: -1 })
    .limit(1)
    .toArray();
  return (last[0]?.orderKey ?? 0) + ORDER_GAP;
}

export async function createTask(
  projectId: string,
  data: TaskWriteData,
  actorId: string
): Promise<Task> {
  const collection = await getCollection();
  const status = data.status ?? DEFAULT_TASK_STATUS;
  const doc: Task = {
    _id: newId(),
    taskCode: await generateTaskCode(),
    projectId,
    parentTaskId: data.parentTaskId ?? null,
    title: data.title,
    description: data.description,
    status,
    priority: data.priority ?? DEFAULT_PRIORITY,
    assigneeId: data.assigneeId,
    labels: data.labels ?? [],
    startDate: data.startDate,
    dueDate: data.dueDate,
    estimateHours: data.estimateHours,
    orderKey: await nextOrderKey(projectId, status),
    completedAt: isTaskDone(status) ? new Date() : null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  await emitEvent("task.created", { entity: taskEntity(doc), actorId, data: { title: doc.title, taskCode: doc.taskCode, priority: doc.priority, dueDate: doc.dueDate } });
  return doc;
}

function taskEntity(t: Task) {
  return { type: "task", id: t._id, label: t.title, url: `/sprintos/projects/${t.projectId}/tasks/${t._id}` };
}

/** Emits `task.completed` when a status change just moved the task into "done". */
async function emitIfCompleted(before: Pick<Task, "status"> | null, after: Task | null, actorId: string): Promise<void> {
  if (!before || !after || isTaskDone(before.status) || !isTaskDone(after.status)) return;
  await emitEvent("task.completed", { entity: taskEntity(after), actorId, data: { title: after.title, taskCode: after.taskCode, priority: after.priority } });
}

export async function updateTask(
  id: string,
  data: Partial<TaskWriteData>,
  actorId: string
): Promise<Task | null> {
  const collection = await getCollection();
  const set: Record<string, unknown> = { ...data, ...updateStamp(actorId) };
  if (data.status !== undefined) {
    set.completedAt = isTaskDone(data.status) ? new Date() : null;
  }
  const before = data.status !== undefined ? await collection.findOne({ _id: id, ...notDeleted }, { projection: { status: 1 } }) : null;
  const task = await collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: set }, { returnDocument: "after" });
  await emitIfCompleted(before, task, actorId);
  return task;
}

/**
 * Kanban move: places the task in `status` between the tasks with keys
 * `beforeKey` (above) and `afterKey` (below). Either may be null (edge).
 */
export async function moveTask(
  id: string,
  status: TaskStatus,
  beforeKey: number | null,
  afterKey: number | null,
  actorId: string
): Promise<Task | null> {
  const collection = await getCollection();
  let orderKey: number;
  if (beforeKey != null && afterKey != null) orderKey = (beforeKey + afterKey) / 2;
  else if (beforeKey != null) orderKey = beforeKey + ORDER_GAP;
  else if (afterKey != null) orderKey = afterKey - ORDER_GAP;
  else orderKey = ORDER_GAP;

  const before = await collection.findOne({ _id: id, ...notDeleted }, { projection: { status: 1 } });
  const task = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    {
      $set: {
        status,
        orderKey,
        completedAt: isTaskDone(status) ? new Date() : null,
        ...updateStamp(actorId),
      },
    },
    { returnDocument: "after" }
  );
  await emitIfCompleted(before, task, actorId);
  return task;
}

export async function deleteTask(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  // Cascade to subtasks.
  await collection.updateMany(
    { parentTaskId: id, deletedAt: null },
    { $set: { deletedAt: new Date(), updatedAt: new Date(), updatedBy: actorId } }
  );
  return { ok: res.modifiedCount === 1 };
}

/**
 * Recomputes `pms_projects.progressPercent` from top-level task completion.
 * No-op (returns null) when the project has no tasks — the manual progress
 * control stays in charge in that case.
 */
export async function recomputeProjectProgress(projectId: string): Promise<number | null> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ total: number; done: number }>([
      { $match: { projectId, parentTaskId: null, deletedAt: null } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
        },
      },
    ])
    .toArray();

  const total = rows[0]?.total ?? 0;
  if (total === 0) return null;
  const pct = Math.round(((rows[0]?.done ?? 0) / total) * 100);

  const db = await getDb();
  await db.collection<{ _id: string }>(PROJECTS_COLLECTION).updateOne(
    { _id: projectId },
    { $set: { progressPercent: pct, updatedAt: new Date() } }
  );
  return pct;
}
