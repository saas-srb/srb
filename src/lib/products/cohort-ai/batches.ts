import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextSequence,
  formatCode,
  type AuditFields,
} from "@/lib/products/cohort-ai/db";
import {
  DEFAULT_BATCH_STATUS,
  DEFAULT_TRAINING_MODE,
  type BatchStatus,
  type TrainingMode,
} from "@/lib/products/cohort-ai/constants";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";

export const BATCHES_COLLECTION = "training_batches";
const ENROLLMENTS_COLLECTION = "student_enrollments";
const STUDENTS_COLLECTION = "training_students";
const BATCH_CODE_PREFIX = "BAT";

/** Minimal shape for the string-UUID `_id` collections we join to ad hoc. */
type JoinDoc = { _id: string } & Record<string, unknown>;

export interface Batch extends AuditFields {
  _id: string;
  batchCode: string;
  programId: string;
  name: string;
  startDate: string | null; // ISO yyyy-mm-dd
  endDate: string | null;
  /** Free-text class timing, e.g. "Mon–Fri · 7:00–9:00 PM IST". */
  timing: string | null;
  mentorId: string | null; // hrms_employees._id
  capacity: number;
  mode: TrainingMode;
  status: BatchStatus;
  notes: string | null;
}

export interface SerializedBatch extends Omit<Batch, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeBatch(b: Batch): SerializedBatch {
  return {
    ...b,
    createdAt: b.createdAt.toISOString(),
    updatedAt: b.updatedAt.toISOString(),
    deletedAt: b.deletedAt ? b.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Batch>(BATCHES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ batchCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ mentorId: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ startDate: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateBatchCode(): Promise<string> {
  const seq = await nextSequence("batch_code");
  return formatCode(BATCH_CODE_PREFIX, seq);
}

// ---------------------------------------------------------------------------
// Seat counts — derived live from active enrolments
// ---------------------------------------------------------------------------

/** Active-enrolment count per batch id. Batches with no enrolments are omitted. */
export async function enrolledCountByBatch(batchIds: string[]): Promise<Map<string, number>> {
  const ids = Array.from(new Set(batchIds.filter(Boolean)));
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const db = await getDb();
  const rows = await db
    .collection<JoinDoc>(ENROLLMENTS_COLLECTION)
    .aggregate<{ _id: string; count: number }>([
      { $match: { batchId: { $in: ids }, deletedAt: null, status: { $ne: "dropped" } } },
      { $group: { _id: "$batchId", count: { $sum: 1 } } },
    ])
    .toArray();
  for (const r of rows) map.set(r._id, r.count);
  return map;
}

export async function enrolledCount(batchId: string): Promise<number> {
  return (await enrolledCountByBatch([batchId])).get(batchId) ?? 0;
}

export interface RosterEntry {
  enrollmentId: string;
  studentId: string;
  studentCode: string | null;
  fullName: string;
  email: string | null;
  status: string;
  progressPercent: number;
  enrolledOn: string | null;
}

/**
 * Enrolled students for one batch. Empty until Phase 4 (student CRM +
 * enrolments) lands — the join is written now so the detail page is ready.
 */
export async function getBatchRoster(batchId: string): Promise<RosterEntry[]> {
  const db = await getDb();
  const enrollments = await db
    .collection<JoinDoc>(ENROLLMENTS_COLLECTION)
    .find({ batchId, deletedAt: null })
    .sort({ createdAt: 1 })
    .toArray();
  if (enrollments.length === 0) return [];

  const studentIds = Array.from(new Set(enrollments.map((e) => e.studentId as string).filter(Boolean)));
  const students = await db
    .collection<JoinDoc>(STUDENTS_COLLECTION)
    .find({ _id: { $in: studentIds } }, { projection: { fullName: 1, studentCode: 1, email: 1 } })
    .toArray();
  const byId = new Map(students.map((s) => [s._id, s]));

  return enrollments.map((e) => {
    const s = byId.get(e.studentId as string);
    return {
      enrollmentId: e._id,
      studentId: e.studentId as string,
      studentCode: (s?.studentCode as string) ?? null,
      fullName: (s?.fullName as string) ?? "Unknown student",
      email: (s?.email as string) ?? null,
      status: (e.status as string) ?? "active",
      progressPercent: Number(e.progressPercent) || 0,
      enrolledOn: e.createdAt ? new Date(e.createdAt as Date).toISOString() : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBatch(id: string): Promise<Batch | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function listBatchOptions(): Promise<
  { _id: string; batchCode: string; name: string; programId: string }[]
> {
  const collection = await getCollection();
  const docs = await collection
    .find(notDeleted, { projection: { batchCode: 1, name: 1, programId: 1 } })
    .sort({ createdAt: -1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, batchCode: d.batchCode, name: d.name, programId: d.programId }));
}

/** Batch dropdown options with program names — for the class form / filters. */
export async function listBatchPickerOptions(): Promise<
  { _id: string; name: string; programId: string; programName: string; status: string }[]
> {
  const collection = await getCollection();
  const db = await getDb();
  const docs = await collection
    .find({ ...notDeleted, status: { $ne: "cancelled" } }, { projection: { name: 1, programId: 1, status: 1 } })
    .sort({ startDate: -1 })
    .toArray();
  const programIds = Array.from(new Set(docs.map((d) => d.programId)));
  const programs = await db
    .collection<JoinDoc>(PROGRAMS_COLLECTION)
    .find({ _id: { $in: programIds } }, { projection: { name: 1 } })
    .toArray();
  const nameById = new Map(programs.map((p) => [p._id, (p.name as string) ?? "Unknown"]));
  return docs.map((d) => ({
    _id: d._id,
    name: d.name,
    programId: d.programId,
    programName: nameById.get(d.programId) ?? "Unknown",
    status: d.status,
  }));
}

export interface BatchFilter {
  search?: string;
  programId?: string;
  mentorId?: string;
  status?: BatchStatus;
  mode?: TrainingMode;
}

function buildFilter(opts: BatchFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { batchCode: rx }, { timing: rx }];
  }
  if (opts.programId) filter.programId = opts.programId;
  if (opts.mentorId) filter.mentorId = opts.mentorId;
  if (opts.status) filter.status = opts.status;
  if (opts.mode) filter.mode = opts.mode;
  return filter;
}

export interface SearchBatchesOptions extends BatchFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "name" | "batchCode" | "startDate" | "status";
  sortDir?: "asc" | "desc";
}

export interface BatchWithMeta extends Batch {
  programName: string;
  enrolled: number;
  availableSeats: number;
}

export async function searchBatches(opts: SearchBatchesOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField =
    opts.sortBy === "name"
      ? "name"
      : opts.sortBy === "batchCode"
        ? "batchCode"
        : opts.sortBy === "startDate"
          ? "startDate"
          : opts.sortBy === "status"
            ? "status"
            : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [rows, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  const items = await attachMeta(rows);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

async function attachMeta(rows: Batch[]): Promise<BatchWithMeta[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const programIds = Array.from(new Set(rows.map((b) => b.programId)));
  const [programs, enrolled] = await Promise.all([
    db
      .collection<JoinDoc>(PROGRAMS_COLLECTION)
      .find({ _id: { $in: programIds } }, { projection: { name: 1 } })
      .toArray(),
    enrolledCountByBatch(rows.map((b) => b._id)),
  ]);
  const programName = new Map<string, string>(programs.map((p) => [p._id, (p.name as string) ?? "Unknown"]));
  return rows.map((b) => {
    const count = enrolled.get(b._id) ?? 0;
    return {
      ...b,
      programName: programName.get(b.programId) ?? "Unknown program",
      enrolled: count,
      availableSeats: Math.max(b.capacity - count, 0),
    };
  });
}

/** Batches for the calendar view — every batch with a start date in the window. */
export async function listBatchesForCalendar(): Promise<BatchWithMeta[]> {
  const collection = await getCollection();
  const rows = await collection
    .find({ ...notDeleted, startDate: { $ne: null } })
    .sort({ startDate: 1 })
    .limit(500)
    .toArray();
  return attachMeta(rows);
}

export async function listBatchesForProgram(programId: string): Promise<BatchWithMeta[]> {
  const collection = await getCollection();
  const rows = await collection.find({ ...notDeleted, programId }).sort({ startDate: -1 }).toArray();
  return attachMeta(rows);
}

/** Open batches (upcoming / running) with seat info — for the assign-to-batch picker. */
export async function listOpenBatchesForAssignment(): Promise<
  { _id: string; programId: string; label: string; full: boolean; seatsLeft: number }[]
> {
  const collection = await getCollection();
  const rows = await collection
    .find({ ...notDeleted, status: { $in: ["upcoming", "running"] } })
    .sort({ startDate: 1 })
    .toArray();
  const meta = await attachMeta(rows);
  return meta.map((b) => ({
    _id: b._id,
    programId: b.programId,
    label: `${b.name} (${b.batchCode})`,
    full: b.availableSeats <= 0,
    seatsLeft: b.availableSeats,
  }));
}

export async function countBatches(filter: BatchFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

const EXPORT_ROW_LIMIT = 5000;

/** Same shape as `exportPrograms`/`exportProjects` — either every row matching
 * the filter, or (when `ids` is given) exactly those rows. */
export async function exportBatches(opts: BatchFilter & { ids?: string[] } = {}): Promise<BatchWithMeta[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  const rows = await collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
  return attachMeta(rows);
}

export async function countBatchesForProgram(programId: string): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments({ ...notDeleted, programId });
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface BatchWriteData {
  programId: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  timing: string | null;
  mentorId: string | null;
  capacity: number;
  mode: TrainingMode;
  status: BatchStatus;
  notes: string | null;
}

export async function createBatch(data: BatchWriteData, actorId: string): Promise<Batch> {
  const collection = await getCollection();
  const doc: Batch = {
    _id: newId(),
    batchCode: await generateBatchCode(),
    programId: data.programId,
    name: data.name,
    startDate: data.startDate,
    endDate: data.endDate,
    timing: data.timing,
    mentorId: data.mentorId,
    capacity: data.capacity,
    mode: data.mode ?? DEFAULT_TRAINING_MODE,
    status: data.status ?? DEFAULT_BATCH_STATUS,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateBatch(
  id: string,
  data: Partial<BatchWriteData>,
  actorId: string
): Promise<Batch | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Soft-delete. Refuses when active enrolments still reference the batch. */
export async function deleteBatch(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const count = await enrolledCount(id);
  if (count > 0) {
    return { ok: false, reason: `${count} student(s) are enrolled in this batch. Move or drop them first.` };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}
