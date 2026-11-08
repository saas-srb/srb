import "server-only";
import { getDb } from "@/lib/mongodb";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  type AuditFields,
} from "@/lib/products/cohort-ai/db";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import { BATCHES_COLLECTION } from "@/lib/products/cohort-ai/batches";
import { ENROLLMENTS_COLLECTION } from "@/lib/products/cohort-ai/enrollments";
import { resolveMentorNames } from "@/lib/products/cohort-ai/mentors";
import { ATTENDANCE_STATUSES, isValidAttendanceStatus, type AttendanceStatus } from "@/lib/products/cohort-ai/constants";

/**
 * Scheduled classes for a batch. Each class optionally records attendance for
 * the batch's enrolled students (`class_attendance`). Client-safe status
 * constants live in `src/lib/cohort-ai/constants.ts`.
 */

export const CLASSES_COLLECTION = "class_schedules";
export const ATTENDANCE_COLLECTION = "class_attendance";

export { isValidAttendanceStatus };
export type { AttendanceStatus };

/** Counts as "attended" for the attendance-rate calculation. */
const ATTENDED = new Set<string>(ATTENDANCE_STATUSES.filter((s) => s.attended).map((s) => s.value));

export interface ClassSchedule extends AuditFields {
  _id: string;
  batchId: string;
  /** Denormalised for fast filtering / dashboards. */
  programId: string;
  mentorId: string | null;
  topic: string;
  date: string; // ISO yyyy-mm-dd
  startTime: string | null; // HH:mm
  durationMinutes: number;
  meetingLink: string | null;
  recordingUrl: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
}

export interface SerializedClassSchedule extends Omit<ClassSchedule, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeClass(c: ClassSchedule): SerializedClassSchedule {
  return {
    ...c,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<ClassSchedule>(CLASSES_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ batchId: 1, date: 1 }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ mentorId: 1 }).catch(() => {}),
      collection.createIndex({ date: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

interface AttendanceDoc {
  _id: string;
  classId: string;
  batchId: string;
  studentId: string;
  status: AttendanceStatus;
  markedAt: Date;
  markedBy: string | null;
}

async function attendanceCollection() {
  const db = await getDb();
  const col = db.collection<AttendanceDoc>(ATTENDANCE_COLLECTION);
  await col.createIndex({ classId: 1, studentId: 1 }, { unique: true }).catch(() => {});
  await col.createIndex({ batchId: 1, studentId: 1 }).catch(() => {});
  return col;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getClass(id: string): Promise<ClassSchedule | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface ClassView extends ClassSchedule {
  batchName: string;
  batchCode: string;
  programName: string;
  mentorName: string | null;
  attendanceMarked: number;
  rosterSize: number;
}

async function attachMeta(rows: ClassSchedule[]): Promise<ClassView[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const batchIds = Array.from(new Set(rows.map((r) => r.batchId)));
  const programIds = Array.from(new Set(rows.map((r) => r.programId)));
  const classIds = rows.map((r) => r._id);

  const [batches, programs, rosterCounts, attnCounts] = await Promise.all([
    db
      .collection<{ _id: string; name: string; batchCode: string }>(BATCHES_COLLECTION)
      .find({ _id: { $in: batchIds } }, { projection: { name: 1, batchCode: 1 } })
      .toArray(),
    db
      .collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION)
      .find({ _id: { $in: programIds } }, { projection: { name: 1 } })
      .toArray(),
    db
      .collection(ENROLLMENTS_COLLECTION)
      .aggregate<{ _id: string; count: number }>([
        { $match: { batchId: { $in: batchIds }, deletedAt: null, status: { $ne: "dropped" } } },
        { $group: { _id: "$batchId", count: { $sum: 1 } } },
      ])
      .toArray(),
    db
      .collection(ATTENDANCE_COLLECTION)
      .aggregate<{ _id: string; count: number }>([
        { $match: { classId: { $in: classIds } } },
        { $group: { _id: "$classId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const batchById = new Map(batches.map((b) => [b._id, b]));
  const programById = new Map(programs.map((p) => [p._id, p.name]));
  const rosterByBatch = new Map(rosterCounts.map((r) => [r._id, r.count]));
  const attnByClass = new Map(attnCounts.map((r) => [r._id, r.count]));
  const mentorNames = await resolveMentorNames(rows.map((r) => r.mentorId ?? "").filter(Boolean) as string[]);

  return rows.map((r) => ({
    ...r,
    batchName: batchById.get(r.batchId)?.name ?? "Unknown batch",
    batchCode: batchById.get(r.batchId)?.batchCode ?? "",
    programName: programById.get(r.programId) ?? "Unknown program",
    mentorName: r.mentorId ? mentorNames.get(r.mentorId) ?? null : null,
    attendanceMarked: attnByClass.get(r._id) ?? 0,
    rosterSize: rosterByBatch.get(r.batchId) ?? 0,
  }));
}

export interface ClassFilter {
  batchId?: string;
  programId?: string;
  mentorId?: string;
  from?: string; // yyyy-mm-dd
  to?: string;
  status?: string;
}

function buildFilter(opts: ClassFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.batchId) filter.batchId = opts.batchId;
  if (opts.programId) filter.programId = opts.programId;
  if (opts.mentorId) filter.mentorId = opts.mentorId;
  if (opts.status) filter.status = opts.status;
  if (opts.from || opts.to) {
    const range: Record<string, string> = {};
    if (opts.from) range.$gte = opts.from;
    if (opts.to) range.$lte = opts.to;
    filter.date = range;
  }
  return filter;
}

export async function listClasses(opts: ClassFilter = {}, limit = 500): Promise<ClassView[]> {
  const collection = await getCollection();
  const rows = await collection.find(buildFilter(opts)).sort({ date: 1, startTime: 1 }).limit(limit).toArray();
  return attachMeta(rows);
}

export async function listClassesForBatch(batchId: string): Promise<ClassView[]> {
  return listClasses({ batchId });
}

export async function countClasses(opts: ClassFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(opts));
}

/** Upcoming classes for a set of batches — powers the student schedule + dashboards. */
export async function upcomingClassesForBatches(batchIds: string[], limit = 50): Promise<ClassView[]> {
  if (batchIds.length === 0) return [];
  const collection = await getCollection();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await collection
    .find({ ...notDeleted, batchId: { $in: batchIds }, date: { $gte: today }, status: { $ne: "cancelled" } })
    .sort({ date: 1, startTime: 1 })
    .limit(limit)
    .toArray();
  return attachMeta(rows);
}

export async function pastClassesForBatches(batchIds: string[], limit = 100): Promise<ClassView[]> {
  if (batchIds.length === 0) return [];
  const collection = await getCollection();
  const today = new Date().toISOString().slice(0, 10);
  const rows = await collection
    .find({ ...notDeleted, batchId: { $in: batchIds }, date: { $lt: today } })
    .sort({ date: -1, startTime: -1 })
    .limit(limit)
    .toArray();
  return attachMeta(rows);
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface AttendanceRow {
  studentId: string;
  studentCode: string | null;
  fullName: string;
  status: AttendanceStatus | null;
}

/** Roster of a class's batch with each student's attendance mark (or null). */
export async function getClassAttendance(classId: string, batchId: string): Promise<AttendanceRow[]> {
  const db = await getDb();
  const [enrollments, marks] = await Promise.all([
    db
      .collection<{ _id: string; studentId: string }>(ENROLLMENTS_COLLECTION)
      .find({ batchId, deletedAt: null, status: { $ne: "dropped" } })
      .toArray(),
    (await attendanceCollection()).find({ classId }).toArray(),
  ]);
  const studentIds = enrollments.map((e) => e.studentId);
  const students = await db
    .collection<{ _id: string; fullName: string; studentCode: string }>("training_students")
    .find({ _id: { $in: studentIds } }, { projection: { fullName: 1, studentCode: 1 } })
    .toArray();
  const studentById = new Map(students.map((s) => [s._id, s]));
  const markByStudent = new Map(marks.map((m) => [m.studentId, m.status]));

  return enrollments
    .map((e) => ({
      studentId: e.studentId,
      studentCode: studentById.get(e.studentId)?.studentCode ?? null,
      fullName: studentById.get(e.studentId)?.fullName ?? "Unknown student",
      status: markByStudent.get(e.studentId) ?? null,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function markAttendance(
  classId: string,
  batchId: string,
  entries: { studentId: string; status: AttendanceStatus }[],
  actorId: string
): Promise<void> {
  if (entries.length === 0) return;
  const col = await attendanceCollection();
  const now = new Date();
  await col.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { classId, studentId: e.studentId },
        update: {
          $set: { status: e.status, markedAt: now, markedBy: actorId },
          $setOnInsert: { _id: newId(), classId, batchId, studentId: e.studentId },
        },
        upsert: true,
      },
    }))
  );
}

export interface AttendanceSummary {
  total: number;
  attended: number;
  ratePercent: number;
  byStatus: Record<string, number>;
}

/** A student's attendance across all their batches. */
export async function studentAttendanceSummary(studentId: string): Promise<AttendanceSummary> {
  const col = await attendanceCollection();
  const rows = await col.find({ studentId }).toArray();
  const byStatus: Record<string, number> = {};
  let attended = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (ATTENDED.has(r.status)) attended += 1;
  }
  const total = rows.length;
  return { total, attended, ratePercent: total > 0 ? Math.round((attended / total) * 100) : 0, byStatus };
}

/** Batch-wide attendance rate (all marks for the batch). */
export async function batchAttendanceSummary(batchId: string): Promise<AttendanceSummary> {
  const col = await attendanceCollection();
  const rows = await col.find({ batchId }).toArray();
  const byStatus: Record<string, number> = {};
  let attended = 0;
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    if (ATTENDED.has(r.status)) attended += 1;
  }
  const total = rows.length;
  return { total, attended, ratePercent: total > 0 ? Math.round((attended / total) * 100) : 0, byStatus };
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface ClassWriteData {
  batchId: string;
  mentorId: string | null;
  topic: string;
  date: string;
  startTime: string | null;
  durationMinutes: number;
  meetingLink: string | null;
  recordingUrl: string | null;
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
}

export async function createClass(
  data: ClassWriteData,
  programId: string,
  actorId: string
): Promise<ClassSchedule> {
  const collection = await getCollection();
  const doc: ClassSchedule = {
    _id: newId(),
    batchId: data.batchId,
    programId,
    mentorId: data.mentorId,
    topic: data.topic,
    date: data.date,
    startTime: data.startTime,
    durationMinutes: data.durationMinutes,
    meetingLink: data.meetingLink,
    recordingUrl: data.recordingUrl,
    notes: data.notes,
    status: data.status,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateClass(
  id: string,
  data: Partial<ClassWriteData>,
  actorId: string
): Promise<ClassSchedule | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export async function deleteClass(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}
