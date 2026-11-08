import "server-only";
import { getDb } from "@/lib/mongodb";
import { getStudent, serializeStudent, type SerializedStudent } from "@/lib/products/cohort-ai/students";
import { listEnrollmentsForStudent } from "@/lib/products/cohort-ai/enrollments";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import { BATCHES_COLLECTION } from "@/lib/products/cohort-ai/batches";
import { resolveMentorNames } from "@/lib/products/cohort-ai/mentors";

export interface EnrollmentView {
  enrollmentId: string;
  status: string;
  progressPercent: number;
  enrolledOn: string;
  programId: string;
  programName: string;
  programCategory: string;
  batchId: string;
  batchName: string;
  batchCode: string;
  batchStatus: string;
  startDate: string | null;
  endDate: string | null;
  timing: string | null;
  mentorName: string | null;
}

export interface StudentOverview {
  student: SerializedStudent;
  enrollments: EnrollmentView[];
  averageProgress: number;
}

/** Enriched enrolments (batch + program + mentor names) for a student. */
export async function getStudentOverview(studentId: string): Promise<StudentOverview | null> {
  const student = await getStudent(studentId);
  if (!student) return null;

  const enrollments = await listEnrollmentsForStudent(studentId);
  if (enrollments.length === 0) {
    return { student: serializeStudent(student), enrollments: [], averageProgress: 0 };
  }

  const db = await getDb();
  const programIds = Array.from(new Set(enrollments.map((e) => e.programId)));
  const batchIds = Array.from(new Set(enrollments.map((e) => e.batchId)));

  const [programs, batches] = await Promise.all([
    db
      .collection<{ _id: string; name: string; category: string }>(PROGRAMS_COLLECTION)
      .find({ _id: { $in: programIds } }, { projection: { name: 1, category: 1 } })
      .toArray(),
    db
      .collection<{
        _id: string;
        name: string;
        batchCode: string;
        status: string;
        startDate: string | null;
        endDate: string | null;
        timing: string | null;
        mentorId: string | null;
      }>(BATCHES_COLLECTION)
      .find({ _id: { $in: batchIds } })
      .toArray(),
  ]);

  const programById = new Map(programs.map((p) => [p._id, p]));
  const batchById = new Map(batches.map((b) => [b._id, b]));
  const mentorNames = await resolveMentorNames(
    batches.map((b) => b.mentorId ?? "").filter(Boolean) as string[]
  );

  const views: EnrollmentView[] = enrollments.map((e) => {
    const p = programById.get(e.programId);
    const b = batchById.get(e.batchId);
    return {
      enrollmentId: e._id,
      status: e.status,
      progressPercent: e.progressPercent,
      enrolledOn: e.enrolledOn,
      programId: e.programId,
      programName: p?.name ?? "Unknown program",
      programCategory: p?.category ?? "industrial",
      batchId: e.batchId,
      batchName: b?.name ?? "Unknown batch",
      batchCode: b?.batchCode ?? "",
      batchStatus: b?.status ?? "upcoming",
      startDate: b?.startDate ?? null,
      endDate: b?.endDate ?? null,
      timing: b?.timing ?? null,
      mentorName: b?.mentorId ? mentorNames.get(b.mentorId) ?? null : null,
    };
  });

  const averageProgress = Math.round(
    views.reduce((s, v) => s + v.progressPercent, 0) / views.length
  );

  return { student: serializeStudent(student), enrollments: views, averageProgress };
}

/** Resolve the `studentId` on the signed-in portal user to their overview. */
export async function getPortalStudentOverview(studentId: string | null): Promise<StudentOverview | null> {
  if (!studentId) return null;
  return getStudentOverview(studentId);
}
