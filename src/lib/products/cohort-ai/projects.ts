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
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import { BATCHES_COLLECTION } from "@/lib/products/cohort-ai/batches";
import { resolveMentorNames } from "@/lib/products/cohort-ai/mentors";
import { isValidLiveProjectStatus, type LiveProjectStatus } from "@/lib/products/cohort-ai/constants";

/**
 * Live projects assigned to students during a program. Milestones are embedded
 * (small, ordered list); progress is either manual or derived from completed
 * milestones. Client-safe status meta lives in `src/lib/cohort-ai/constants.ts`.
 */

export const LIVE_PROJECTS_COLLECTION = "live_projects";
const PROJECT_CODE_PREFIX = "LP";
const STUDENTS_COLLECTION = "training_students";

export { isValidLiveProjectStatus };
export type { LiveProjectStatus };

export interface Milestone {
  id: string;
  title: string;
  done: boolean;
  dueDate: string | null;
}

export interface LiveProject extends AuditFields {
  _id: string;
  projectCode: string;
  title: string;
  description: string | null;
  programId: string;
  batchId: string | null;
  mentorId: string | null;
  studentIds: string[];
  milestones: Milestone[];
  repoUrl: string | null;
  demoUrl: string | null;
  status: LiveProjectStatus;
  /** Manual override; when milestones exist, effective progress is milestone-derived. */
  progressPercent: number;
  startDate: string | null;
  dueDate: string | null;
}

export interface SerializedLiveProject extends Omit<LiveProject, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeLiveProject(p: LiveProject): SerializedLiveProject {
  return {
    ...p,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
  };
}

/** Milestone-derived when milestones exist, else the manual value. */
export function effectiveProgress(p: Pick<LiveProject, "milestones" | "progressPercent">): number {
  if (p.milestones.length === 0) return p.progressPercent;
  const done = p.milestones.filter((m) => m.done).length;
  return Math.round((done / p.milestones.length) * 100);
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<LiveProject>(LIVE_PROJECTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ projectCode: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ programId: 1 }).catch(() => {}),
      collection.createIndex({ batchId: 1 }).catch(() => {}),
      collection.createIndex({ studentIds: 1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateProjectCode(): Promise<string> {
  return formatCode(PROJECT_CODE_PREFIX, await nextSequence("live_project_code"));
}

export async function getLiveProject(id: string): Promise<LiveProject | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface LiveProjectView extends LiveProject {
  programName: string;
  batchName: string | null;
  mentorName: string | null;
  studentNames: string[];
  progress: number;
}

async function attachMeta(rows: LiveProject[]): Promise<LiveProjectView[]> {
  if (rows.length === 0) return [];
  const db = await getDb();
  const programIds = Array.from(new Set(rows.map((r) => r.programId)));
  const batchIds = Array.from(new Set(rows.map((r) => r.batchId).filter(Boolean) as string[]));
  const studentIds = Array.from(new Set(rows.flatMap((r) => r.studentIds)));
  const [programs, batches, students] = await Promise.all([
    db.collection<{ _id: string; name: string }>(PROGRAMS_COLLECTION).find({ _id: { $in: programIds } }, { projection: { name: 1 } }).toArray(),
    db.collection<{ _id: string; name: string }>(BATCHES_COLLECTION).find({ _id: { $in: batchIds } }, { projection: { name: 1 } }).toArray(),
    db.collection<{ _id: string; fullName: string }>(STUDENTS_COLLECTION).find({ _id: { $in: studentIds } }, { projection: { fullName: 1 } }).toArray(),
  ]);
  const programName = new Map(programs.map((p) => [p._id, p.name]));
  const batchName = new Map(batches.map((b) => [b._id, b.name]));
  const studentName = new Map(students.map((s) => [s._id, s.fullName]));
  const mentorNames = await resolveMentorNames(rows.map((r) => r.mentorId ?? "").filter(Boolean) as string[]);
  return rows.map((r) => ({
    ...r,
    programName: programName.get(r.programId) ?? "Unknown program",
    batchName: r.batchId ? batchName.get(r.batchId) ?? null : null,
    mentorName: r.mentorId ? mentorNames.get(r.mentorId) ?? null : null,
    studentNames: r.studentIds.map((id) => studentName.get(id) ?? "Unknown"),
    progress: effectiveProgress(r),
  }));
}

export interface LiveProjectFilter {
  search?: string;
  programId?: string;
  batchId?: string;
  mentorId?: string;
  studentId?: string;
  status?: LiveProjectStatus;
}

function buildFilter(opts: LiveProjectFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ title: rx }, { projectCode: rx }];
  }
  if (opts.programId) filter.programId = opts.programId;
  if (opts.batchId) filter.batchId = opts.batchId;
  if (opts.mentorId) filter.mentorId = opts.mentorId;
  if (opts.studentId) filter.studentIds = opts.studentId;
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function listLiveProjects(opts: LiveProjectFilter = {}, limit = 500): Promise<LiveProjectView[]> {
  const collection = await getCollection();
  const rows = await collection.find(buildFilter(opts)).sort({ createdAt: -1 }).limit(limit).toArray();
  return attachMeta(rows);
}

export async function countLiveProjects(opts: LiveProjectFilter = {}): Promise<number> {
  const collection = await getCollection();
  return collection.countDocuments(buildFilter(opts));
}

export async function listLiveProjectsForStudent(studentId: string): Promise<LiveProjectView[]> {
  return listLiveProjects({ studentId });
}

export interface LiveProjectWriteData {
  title: string;
  description: string | null;
  programId: string;
  batchId: string | null;
  mentorId: string | null;
  studentIds: string[];
  milestones: Milestone[];
  repoUrl: string | null;
  demoUrl: string | null;
  status: LiveProjectStatus;
  progressPercent: number;
  startDate: string | null;
  dueDate: string | null;
}

export async function createLiveProject(data: LiveProjectWriteData, actorId: string): Promise<LiveProject> {
  const collection = await getCollection();
  const doc: LiveProject = {
    _id: newId(),
    projectCode: await generateProjectCode(),
    ...data,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateLiveProject(
  id: string,
  data: Partial<LiveProjectWriteData>,
  actorId: string
): Promise<LiveProject | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Toggle a single milestone's done flag (mentor / staff, or an assigned student). */
export async function toggleMilestone(
  id: string,
  milestoneId: string,
  done: boolean,
  actorId: string
): Promise<LiveProject | null> {
  const collection = await getCollection();
  const project = await collection.findOne({ _id: id, ...notDeleted });
  if (!project) return null;
  const milestones = project.milestones.map((m) => (m.id === milestoneId ? { ...m, done } : m));
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { milestones, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

export async function deleteLiveProject(id: string, actorId: string): Promise<boolean> {
  const collection = await getCollection();
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return res.modifiedCount === 1;
}
