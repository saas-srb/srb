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
import { DEFAULT_STUDENT_STATUS, type StudentStatus } from "@/lib/products/cohort-ai/constants";

/**
 * Student records and student-facing profile data.
 */

export const STUDENTS_COLLECTION = "training_students";
const ENROLLMENTS_COLLECTION = "student_enrollments";
const STUDENT_CODE_PREFIX = "TRN";

export interface StudentEducation {
  college: string | null;
  university: string | null;
  branch: string | null;
  semester: string | null;
  graduationYear: number | null;
}

export interface StudentLinks {
  resumeUrl: string | null;
  linkedin: string | null;
  github: string | null;
  photoUrl: string | null;
}

export interface GuardianDetails {
  name: string | null;
  phone: string | null;
  relation: string | null;
}

export interface Student extends AuditFields {
  _id: string;
  studentCode: string;
  fullName: string;
  email: string | null;
  mobile: string | null;
  address: string | null;
  education: StudentEducation;
  guardian: GuardianDetails;
  links: StudentLinks;
  status: StudentStatus;
  /** Historical reference retained for students created from older application records. */
  applicationId: string | null;
  notes: string | null;
}

export interface SerializedStudent extends Omit<Student, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeStudent(s: Student): SerializedStudent {
  return {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Student>(STUDENTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ studentCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ fullName: 1 }).catch(() => {}),
      collection.createIndex({ email: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateStudentCode(): Promise<string> {
  const seq = await nextSequence("student_code");
  return formatCode(STUDENT_CODE_PREFIX, seq);
}

export async function getStudent(id: string): Promise<Student | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

/** Lightweight list for pickers (certificate / payment forms). */
export async function listStudentOptions(): Promise<
  { _id: string; fullName: string; studentCode: string }[]
> {
  const collection = await getCollection();
  const docs = await collection
    .find(notDeleted, { projection: { fullName: 1, studentCode: 1 } })
    .sort({ fullName: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, fullName: d.fullName, studentCode: d.studentCode }));
}

export interface StudentFilter {
  search?: string;
  status?: StudentStatus;
}

function buildFilter(opts: StudentFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ fullName: rx }, { studentCode: rx }, { email: rx }, { mobile: rx }];
  }
  if (opts.status) filter.status = opts.status;
  return filter;
}

export interface SearchStudentsOptions extends StudentFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "createdAt" | "fullName" | "studentCode" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchStudents(opts: SearchStudentsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField =
    opts.sortBy === "fullName"
      ? "fullName"
      : opts.sortBy === "studentCode"
        ? "studentCode"
        : opts.sortBy === "status"
          ? "status"
          : "createdAt";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [rawItems, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  const db = await getDb();
  const ids = rawItems.map((s) => s._id);
  const counts = ids.length
    ? await db
        .collection(ENROLLMENTS_COLLECTION)
        .aggregate<{ _id: string; count: number }>([
          { $match: { studentId: { $in: ids }, deletedAt: null } },
          { $group: { _id: "$studentId", count: { $sum: 1 } } },
        ])
        .toArray()
    : [];
  const countMap = new Map(counts.map((r) => [r._id, r.count]));
  const items = rawItems.map((s) => ({ ...s, enrollmentCount: countMap.get(s._id) ?? 0 }));

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export async function countStudents(filter: StudentFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(filter));
}

const EXPORT_ROW_LIMIT = 5000;

/** Same shape as `exportLeads`/`exportClients`/`exportProjects` — either every
 * row matching the filter, or (when `ids` is given) exactly those rows. */
export async function exportStudents(opts: StudentFilter & { ids?: string[] } = {}): Promise<Student[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ createdAt: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

export interface StudentWriteData {
  fullName: string;
  email: string | null;
  mobile: string | null;
  address: string | null;
  education: StudentEducation;
  guardian: GuardianDetails;
  links: StudentLinks;
  status: StudentStatus;
  notes: string | null;
}

export async function createStudent(
  data: StudentWriteData,
  actorId: string
): Promise<Student> {
  const collection = await getCollection();
  const doc: Student = {
    _id: newId(),
    studentCode: await generateStudentCode(),
    fullName: data.fullName,
    email: data.email,
    mobile: data.mobile,
    address: data.address,
    education: data.education,
    guardian: data.guardian,
    links: data.links,
    status: data.status ?? DEFAULT_STUDENT_STATUS,
    applicationId: null,
    notes: data.notes,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateStudent(
  id: string,
  data: Partial<StudentWriteData>,
  actorId: string
): Promise<Student | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}
