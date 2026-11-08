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
import { isValidSubmissionStatus, type SubmissionStatus } from "@/lib/products/cohort-ai/constants";

export const ASSIGNMENTS_COLLECTION = "assignments";
export const SUBMISSIONS_COLLECTION = "assignment_submissions";
const STUDENTS_COLLECTION = "training_students";

export { isValidSubmissionStatus };
export type { SubmissionStatus };

export interface Assignment extends AuditFields {
  _id: string;
  title: string;
  description: string | null;
  batchId: string;
  programId: string;
  dueDate: string | null;
  maxMarks: number;
  attachmentUrl: string | null;
}

export interface SerializedAssignment extends Omit<Assignment, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeAssignment(a: Assignment): SerializedAssignment {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
  };
}

export interface Submission {
  _id: string;
  assignmentId: string;
  studentId: string;
  status: SubmissionStatus;
  submissionUrl: string | null;
  note: string | null;
  submittedAt: Date | null;
  marks: number | null;
  feedback: string | null;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

export interface SerializedSubmission extends Omit<Submission, "submittedAt" | "reviewedAt"> {
  submittedAt: string | null;
  reviewedAt: string | null;
}

export function serializeSubmission(s: Submission): SerializedSubmission {
  return {
    ...s,
    submittedAt: s.submittedAt ? s.submittedAt.toISOString() : null,
    reviewedAt: s.reviewedAt ? s.reviewedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Assignment>(ASSIGNMENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ batchId: 1 }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ dueDate: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

async function submissionsCollection() {
  const db = await getDb();
  const col = db.collection<Submission>(SUBMISSIONS_COLLECTION);
  await col.createIndex({ assignmentId: 1, studentId: 1 }, { unique: true }).catch(() => {});
  await col.createIndex({ studentId: 1 }).catch(() => {});
  return col;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getAssignment(id: string): Promise<Assignment | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface AssignmentView extends Assignment {
  batchName: string;
  programName: string;
  rosterSize: number;
  submittedCount: number;
  reviewedCount: number;
}

async function attachMeta(rows: Assignment[]): Promise<AssignmentView[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const batchIds = Array.from(new Set(rows.map((r) => r.batchId)));
  const programIds = Array.from(new Set(rows.map((r) => r.programId)));
  const assignmentIds = rows.map((r) => r._id);
  const [batches, programs, roster, subs] = await Promise.all([
    db.collection<{ _id: string; name: string }>(BATCHES_COLLECTION).find({ _id: { $in: batchIds } }, { projection: { name: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION).find({ _id: { $in: programIds } }, { projection: { name: 1 } }).toArray(),
    db.collection(ENROLLMENTS_COLLECTION).aggregate<{ _id: string; count: number }>([
      { $match: { batchId: { $in: batchIds }, deletedAt: null, status: { $ne: "dropped" } } },
      { $group: { _id: "$batchId", count: { $sum: 1 } } },
    ]).toArray(),
    db.collection(SUBMISSIONS_COLLECTION).aggregate<{ _id: string; submitted: number; reviewed: number }>([
      { $match: { assignmentId: { $in: assignmentIds } } },
      {
        $group: {
          _id: "$assignmentId",
          submitted: { $sum: { $cond: [{ $in: ["$status", ["submitted", "reviewed", "resubmit"]] }, 1, 0] } },
          reviewed: { $sum: { $cond: [{ $eq: ["$status", "reviewed"] }, 1, 0] } },
        },
      },
    ]).toArray(),
  ]);
  const batchName = new Map(batches.map((b) => [b._id, b.name]));
  const programName = new Map(programs.map((p) => [p._id, p.name]));
  const rosterByBatch = new Map(roster.map((r) => [r._id, r.count]));
  const subsByAssignment = new Map(subs.map((s) => [s._id, s]));
  return rows.map((r) => ({
    ...r,
    batchName: batchName.get(r.batchId) ?? "Unknown batch",
    programName: programName.get(r.programId) ?? "Unknown program",
    rosterSize: rosterByBatch.get(r.batchId) ?? 0,
    submittedCount: subsByAssignment.get(r._id)?.submitted ?? 0,
    reviewedCount: subsByAssignment.get(r._id)?.reviewed ?? 0,
  }));
}

export interface AssignmentFilter {
  batchId?: string;
  programId?: string;
  search?: string;
}

export async function listAssignments(opts: AssignmentFilter = {}, limit = 500): Promise<AssignmentView[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.batchId) filter.batchId = opts.batchId;
  if (opts.programId) filter.programId = opts.programId;
  if (opts.search?.trim()) filter.title = new RegExp(opts.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const rows = await collection.find(filter).sort({ dueDate: 1, createdAt: -1 }).limit(limit).toArray();
  return attachMeta(rows);
}

export async function countAssignments(opts: AssignmentFilter = {}): Promise<number> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.batchId) filter.batchId = opts.batchId;
  if (opts.programId) filter.programId = opts.programId;
  return collection.countDocuments(filter);
}

export interface SubmissionRow extends SerializedSubmission {
  studentCode: string | null;
  fullName: string;
}

/** Every roster student's submission row for an assignment (pending rows synthesised). */
export async function getAssignmentSubmissions(assignmentId: string, batchId: string): Promise<SubmissionRow[]> {
  const db = await getDb();
  const [enrollments, subs] = await Promise.all([
    db.collection<{ _id: string; studentId: string }>(ENROLLMENTS_COLLECTION).find({ batchId, deletedAt: null, status: { $ne: "dropped" } }).toArray(),
    (await submissionsCollection()).find({ assignmentId }).toArray(),
  ]);
  const studentIds = enrollments.map((e) => e.studentId);
  const students = await db
    .collection<{ _id: string; fullName: string; studentCode: string }>(STUDENTS_COLLECTION)
    .find({ _id: { $in: studentIds } }, { projection: { fullName: 1, studentCode: 1 } })
    .toArray();
  const studentById = new Map(students.map((s) => [s._id, s]));
  const subByStudent = new Map(subs.map((s) => [s.studentId, s]));
  return enrollments
    .map((e) => {
      const sub = subByStudent.get(e.studentId);
      const base = sub
        ? serializeSubmission(sub)
        : {
            _id: `pending-${e.studentId}`,
            assignmentId,
            studentId: e.studentId,
            status: "pending" as SubmissionStatus,
            submissionUrl: null,
            note: null,
            submittedAt: null,
            marks: null,
            feedback: null,
            reviewedAt: null,
            reviewedBy: null,
          };
      return {
        ...base,
        studentCode: studentById.get(e.studentId)?.studentCode ?? null,
        fullName: studentById.get(e.studentId)?.fullName ?? "Unknown student",
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export interface StudentAssignmentView extends SerializedAssignment {
  batchName: string;
  programName: string;
  submission: SerializedSubmission | null;
}

/** Assignments visible to a student (across their batches) with their own submission. */
export async function listStudentAssignments(studentId: string, batchIds: string[]): Promise<StudentAssignmentView[]> {
  if (batchIds.length === 0) return [];
  const db = await getDb();
  const collection = await getCollection();
  const rows = await collection.find({ ...notDeleted, batchId: { $in: batchIds } }).sort({ dueDate: 1 }).toArray();
  if (rows.length === 0) return [];
  const [batches, programs, subs] = await Promise.all([
    db.collection<{ _id: string; name: string }>(BATCHES_COLLECTION).find({ _id: { $in: batchIds } }, { projection: { name: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION).find({ _id: { $in: rows.map((r) => r.programId) } }, { projection: { name: 1 } }).toArray(),
    (await submissionsCollection()).find({ studentId, assignmentId: { $in: rows.map((r) => r._id) } }).toArray(),
  ]);
  const batchName = new Map(batches.map((b) => [b._id, b.name]));
  const programName = new Map(programs.map((p) => [p._id, p.name]));
  const subByAssignment = new Map(subs.map((s) => [s.assignmentId, s]));
  return rows.map((r) => ({
    ...serializeAssignment(r),
    batchName: batchName.get(r.batchId) ?? "Unknown batch",
    programName: programName.get(r.programId) ?? "Unknown program",
    submission: subByAssignment.has(r._id) ? serializeSubmission(subByAssignment.get(r._id)!) : null,
  }));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface AssignmentWriteData {
  title: string;
  description: string | null;
  batchId: string;
  dueDate: string | null;
  maxMarks: number;
  attachmentUrl: string | null;
}

export async function createAssignment(data: AssignmentWriteData, programId: string, actorId: string): Promise<Assignment> {
  const collection = await getCollection();
  const doc: Assignment = { _id: newId(), programId, ...data, ...createStamp(actorId) };
  await collection.insertOne(doc);
  return doc;
}

export async function updateAssignment(id: string, data: Partial<AssignmentWriteData>, actorId: string): Promise<Assignment | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate({ _id: id, ...notDeleted }, { $set: { ...data, ...updateStamp(actorId) } }, { returnDocument: "after" });
}

export async function deleteAssignment(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne({ _id: id, ...notDeleted }, { $set: { deletedAt: new Date(), ...updateStamp(actorId) } });
  return res.modifiedCount === 1;
}

/** Student submits (or re-submits) their work. */
export async function submitAssignment(
  assignmentId: string,
  studentId: string,
  input: { submissionUrl: string | null; note: string | null }
): Promise<Submission> {
  const col = await submissionsCollection();
  const now = new Date();
  const res = await col.findOneAndUpdate(
    { assignmentId, studentId },
    {
      $set: { status: "submitted", submissionUrl: input.submissionUrl, note: input.note, submittedAt: now },
      $setOnInsert: { _id: newId(), assignmentId, studentId, marks: null, feedback: null, reviewedAt: null, reviewedBy: null },
    },
    { upsert: true, returnDocument: "after" }
  );
  // Wallet & Credits: a submission earns credits once per assignment (best-effort; never affects the submission).
  try {
    const { awardActivityForStudent } = await import("@/lib/wallet/earn");
    await awardActivityForStudent(studentId, "assignment_submit", `${assignmentId}:${studentId}`);
  } catch {
    /* non-blocking */
  }
  return res as Submission;
}

/** Mentor / staff reviews a submission. */
export async function reviewSubmission(
  assignmentId: string,
  studentId: string,
  input: { marks: number | null; feedback: string | null; approved: boolean },
  reviewerId: string
): Promise<Submission | null> {
  const col = await submissionsCollection();
  const updated = await col.findOneAndUpdate(
    { assignmentId, studentId },
    {
      $set: {
        status: input.approved ? "reviewed" : "resubmit",
        marks: input.marks,
        feedback: input.feedback,
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      },
    },
    { returnDocument: "after" }
  );
  if (updated && input.approved) {
    try {
      const { awardActivityForStudent } = await import("@/lib/wallet/earn");
      await awardActivityForStudent(studentId, "assignment_approved", `${assignmentId}:${studentId}`);
    } catch {
      /* non-blocking */
    }
  }
  return updated;
}
