import "server-only";
import { getDb } from "@/lib/mongodb";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/sprintos/db";
import {
  DEFAULT_TIMESHEET_STATUS,
  COSTED_TIMESHEET_STATUSES,
  parseHHmm,
  type TimesheetStatus,
} from "@/lib/products/sprintos/constants";
import { PROJECTS_COLLECTION } from "@/lib/products/sprintos/projects";
import { TASKS_COLLECTION } from "@/lib/products/sprintos/tasks";

export const TIMESHEETS_COLLECTION = "pms_timesheets";

export interface TimesheetEntry extends AuditFields {
  _id: string;
  projectId: string;
  taskId: string | null;
  employeeId: string;
  date: string; // yyyy-mm-dd
  startTime: string | null; // HH:mm
  endTime: string | null; // HH:mm
  hours: number;
  description: string | null;
  billable: boolean;
  status: TimesheetStatus;
  submittedAt: Date | null;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
}

export interface SerializedTimesheetEntry
  extends Omit<TimesheetEntry, "createdAt" | "updatedAt" | "deletedAt" | "submittedAt" | "reviewedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

export function serializeEntry(e: TimesheetEntry): SerializedTimesheetEntry {
  return {
    ...e,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    deletedAt: e.deletedAt ? e.deletedAt.toISOString() : null,
    submittedAt: e.submittedAt ? e.submittedAt.toISOString() : null,
    reviewedAt: e.reviewedAt ? e.reviewedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<TimesheetEntry>(TIMESHEETS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ employeeId: 1, date: -1 }).catch(() => {}),
      collection.createIndex({ projectId: 1, date: -1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ taskId: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getEntry(id: string): Promise<TimesheetEntry | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface EntryFilter {
  employeeId?: string;
  projectId?: string;
  taskId?: string;
  status?: TimesheetStatus;
  billable?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

function buildFilter(opts: EntryFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.employeeId) filter.employeeId = opts.employeeId;
  if (opts.projectId) filter.projectId = opts.projectId;
  if (opts.taskId) filter.taskId = opts.taskId;
  if (opts.status) filter.status = opts.status;
  if (typeof opts.billable === "boolean") filter.billable = opts.billable;
  if (opts.dateFrom || opts.dateTo) {
    const r: Record<string, string> = {};
    if (opts.dateFrom) r.$gte = opts.dateFrom;
    if (opts.dateTo) r.$lte = opts.dateTo;
    filter.date = r;
  }
  return filter;
}

export async function listEntries(opts: EntryFilter & { limit?: number } = {}): Promise<TimesheetEntry[]> {
  const collection = await getCollection();
  return collection
    .find(buildFilter(opts))
    .sort({ date: -1, createdAt: -1 })
    .limit(Math.min(opts.limit ?? 500, 2000))
    .toArray();
}

export async function countEntries(opts: EntryFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(opts));
}

const EXPORT_ROW_LIMIT = 5000;

/** Same shape as `exportLeads`/`exportClients`/`exportProjects` — either every
 * row matching the filter, or (when `ids` is given) exactly those rows, for
 * "export selected" from a listing. */
export async function exportEntries(opts: EntryFilter & { ids?: string[] } = {}): Promise<TimesheetEntry[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ date: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

export interface SearchEntriesOptions extends EntryFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "date" | "hours" | "createdAt";
  sortDir?: "asc" | "desc";
}

/** Paginated variant of `listEntries` — for a browsable, sortable listing
 * rather than a bounded (max 2000) in-memory report source. */
export async function searchEntries(opts: SearchEntriesOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy ?? "date";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

// ---------------------------------------------------------------------------
// Aggregations
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface HoursSummary {
  today: number;
  week: number;
  month: number;
  range: number;
  billable: number;
  nonBillable: number;
}

export async function hoursSummary(
  employeeId: string,
  range: { dateFrom: string; dateTo: string }
): Promise<HoursSummary> {
  const collection = await getCollection();
  const now = new Date();
  const today = isoDate(now);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rows = await collection
    .find({ employeeId, ...notDeleted }, { projection: { date: 1, hours: 1, billable: 1 } })
    .toArray();

  const sum = (pred: (r: { date: string; hours: number; billable: boolean }) => boolean) =>
    rows.filter(pred).reduce((s, r) => s + r.hours, 0);

  const inRange = (r: { date: string }) => r.date >= range.dateFrom && r.date <= range.dateTo;

  return {
    today: sum((r) => r.date === today),
    week: sum((r) => r.date >= isoDate(weekStart)),
    month: sum((r) => r.date >= isoDate(monthStart)),
    range: sum(inRange),
    billable: sum((r) => inRange(r) && r.billable),
    nonBillable: sum((r) => inRange(r) && !r.billable),
  };
}

export async function hoursTrend(
  employeeId: string,
  range: { dateFrom: string; dateTo: string }
): Promise<{ date: string; count: number }[]> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string; hours: number }>([
      { $match: { employeeId, deletedAt: null, date: { $gte: range.dateFrom, $lte: range.dateTo } } },
      { $group: { _id: "$date", hours: { $sum: "$hours" } } },
    ])
    .toArray();
  return rows.map((r) => ({ date: r._id, count: Math.round(r.hours * 10) / 10 })).sort((a, b) => a.date.localeCompare(b.date));
}

export async function hoursByProject(
  employeeId: string,
  range: { dateFrom: string; dateTo: string }
): Promise<{ label: string; value: number }[]> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string; hours: number }>([
      { $match: { employeeId, deletedAt: null, date: { $gte: range.dateFrom, $lte: range.dateTo } } },
      { $group: { _id: "$projectId", hours: { $sum: "$hours" } } },
    ])
    .toArray();
  if (rows.length === 0) return [];
  const db = await getDb();
  const projects = db.collection<{ _id: string; name: string }>(PROJECTS_COLLECTION);
  const docs = await projects.find({ _id: { $in: rows.map((r) => r._id) } }, { projection: { name: 1 } }).toArray();
  const nameById = new Map(docs.map((d) => [d._id, d.name]));
  return rows
    .map((r) => ({ label: nameById.get(r._id) ?? "Unknown", value: Math.round(r.hours * 10) / 10 }))
    .sort((a, b) => b.value - a.value);
}

export async function hoursByTask(
  opts: EntryFilter
): Promise<{ label: string; value: number }[]> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: string | null; hours: number }>([
      { $match: buildFilter(opts) },
      { $group: { _id: "$taskId", hours: { $sum: "$hours" } } },
    ])
    .toArray();
  if (rows.length === 0) return [];
  const db = await getDb();
  const tasks = db.collection<{ _id: string; title: string }>(TASKS_COLLECTION);
  const ids = rows.map((r) => r._id).filter((x): x is string => Boolean(x));
  const docs = ids.length ? await tasks.find({ _id: { $in: ids } }, { projection: { title: 1 } }).toArray() : [];
  const titleById = new Map(docs.map((d) => [d._id, d.title]));
  return rows
    .map((r) => ({ label: r._id ? titleById.get(r._id) ?? "Unknown task" : "General / no task", value: Math.round(r.hours * 10) / 10 }))
    .sort((a, b) => b.value - a.value);
}

export interface ProjectHours {
  totalHours: number;
  billableHours: number;
  nonBillableHours: number;
  costedHours: number;
  byEmployee: { employeeId: string; hours: number; billableHours: number }[];
}

/** Aggregate logged hours for one project (used by costing + My Projects). */
export async function projectLoggedHours(projectId: string, range?: { dateFrom?: string; dateTo?: string }): Promise<ProjectHours> {
  const collection = await getCollection();
  const match: Record<string, unknown> = { projectId, deletedAt: null };
  if (range?.dateFrom || range?.dateTo) {
    const r: Record<string, string> = {};
    if (range.dateFrom) r.$gte = range.dateFrom;
    if (range.dateTo) r.$lte = range.dateTo;
    match.date = r;
  }
  const rows = await collection.find(match, { projection: { hours: 1, billable: 1, status: 1, employeeId: 1 } }).toArray();

  const byEmp = new Map<string, { hours: number; billableHours: number }>();
  let totalHours = 0;
  let billableHours = 0;
  let costedHours = 0;
  for (const r of rows) {
    totalHours += r.hours;
    if (r.billable) billableHours += r.hours;
    if ((COSTED_TIMESHEET_STATUSES as string[]).includes(r.status)) costedHours += r.hours;
    const cur = byEmp.get(r.employeeId) ?? { hours: 0, billableHours: 0 };
    cur.hours += r.hours;
    if (r.billable) cur.billableHours += r.hours;
    byEmp.set(r.employeeId, cur);
  }
  return {
    totalHours: round1(totalHours),
    billableHours: round1(billableHours),
    nonBillableHours: round1(totalHours - billableHours),
    costedHours: round1(costedHours),
    byEmployee: Array.from(byEmp.entries()).map(([employeeId, v]) => ({
      employeeId,
      hours: round1(v.hours),
      billableHours: round1(v.billableHours),
    })),
  };
}

export async function employeeProjectHours(employeeId: string, projectId: string): Promise<number> {
  const collection = await getCollection();
  const rows = await collection
    .aggregate<{ _id: null; hours: number }>([
      { $match: { employeeId, projectId, deletedAt: null } },
      { $group: { _id: null, hours: { $sum: "$hours" } } },
    ])
    .toArray();
  return round1(rows[0]?.hours ?? 0);
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface EntryWriteData {
  projectId: string;
  taskId: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  hours: number;
  description: string | null;
  billable: boolean;
}

/** Duplicate = same employee + project + task + date + startTime, not deleted. */
export async function isDuplicate(employeeId: string, data: EntryWriteData, excludeId?: string): Promise<boolean> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = {
    employeeId,
    projectId: data.projectId,
    taskId: data.taskId,
    date: data.date,
    startTime: data.startTime,
    ...notDeleted,
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return (await collection.countDocuments(filter)) > 0;
}

/** True when [start,end) overlaps another same-day entry for the employee. */
export async function hasOverlap(employeeId: string, data: EntryWriteData, excludeId?: string): Promise<boolean> {
  const s = parseHHmm(data.startTime);
  const e = parseHHmm(data.endTime);
  if (s === null || e === null || e <= s) return false;
  const collection = await getCollection();
  const filter: Record<string, unknown> = { employeeId, date: data.date, startTime: { $ne: null }, endTime: { $ne: null }, ...notDeleted };
  if (excludeId) filter._id = { $ne: excludeId };
  const sameDay = await collection.find(filter, { projection: { startTime: 1, endTime: 1 } }).toArray();
  return sameDay.some((row) => {
    const rs = parseHHmm(row.startTime);
    const re = parseHHmm(row.endTime);
    if (rs === null || re === null) return false;
    return s < re && rs < e;
  });
}

export async function dayHoursTotal(employeeId: string, date: string, excludeId?: string): Promise<number> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { employeeId, date, ...notDeleted };
  if (excludeId) filter._id = { $ne: excludeId };
  const rows = await collection.find(filter, { projection: { hours: 1 } }).toArray();
  return rows.reduce((sum, r) => sum + r.hours, 0);
}

export async function createEntry(employeeId: string, data: EntryWriteData, actorId: string): Promise<TimesheetEntry> {
  const collection = await getCollection();
  const doc: TimesheetEntry = {
    _id: newId(),
    projectId: data.projectId,
    taskId: data.taskId,
    employeeId,
    date: data.date,
    startTime: data.startTime,
    endTime: data.endTime,
    hours: round2(data.hours),
    description: data.description,
    billable: data.billable,
    status: DEFAULT_TIMESHEET_STATUS,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: null,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateEntry(id: string, data: Partial<EntryWriteData>, actorId: string): Promise<TimesheetEntry | null> {
  const collection = await getCollection();
  const set: Record<string, unknown> = { ...data, ...updateStamp(actorId) };
  if (typeof data.hours === "number") set.hours = round2(data.hours);
  // Editing a rejected entry moves it back to draft.
  set.status = "draft";
  set.reviewNote = null;
  return collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: set }, { returnDocument: "after" });
}

export async function deleteEntry(id: string, actorId: string): Promise<{ ok: boolean }> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

export async function submitEntries(ids: string[], employeeId: string): Promise<number> {
  if (ids.length === 0) return 0;
  const collection = await getCollection();
  const res = await collection.updateMany(
    { _id: { $in: ids }, employeeId, status: { $in: ["draft", "rejected"] }, ...notDeleted },
    { $set: { status: "submitted", submittedAt: new Date(), reviewNote: null, updatedAt: new Date() } }
  );
  return res.modifiedCount;
}

export async function reviewEntry(
  id: string,
  decision: "approved" | "rejected",
  note: string | null,
  reviewerId: string
): Promise<TimesheetEntry | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, status: "submitted", ...notDeleted },
    { $set: { status: decision, reviewedBy: reviewerId, reviewedAt: new Date(), reviewNote: note, updatedAt: new Date() } },
    { returnDocument: "after" }
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
