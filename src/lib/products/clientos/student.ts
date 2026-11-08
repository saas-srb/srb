import "server-only";
import { getPortalStudentOverview, type StudentOverview } from "@/lib/products/cohort-ai/student-dashboard";
import { listEnrollmentsForStudent } from "@/lib/products/cohort-ai/enrollments";
import {
  studentAttendanceSummary,
  upcomingClassesForBatches,
  pastClassesForBatches,
  type ClassView,
  type AttendanceSummary,
} from "@/lib/products/cohort-ai/classes";
import { listCertificatesForStudent, type CertificateView } from "@/lib/products/cohort-ai/certificates";
import { listPaymentsForStudent, type PaymentView } from "@/lib/products/cohort-ai/payments";
import { listLiveProjectsForStudent, type LiveProjectView } from "@/lib/products/cohort-ai/projects";
import { listStudentAssignments, type StudentAssignmentView } from "@/lib/products/cohort-ai/assignments";

/**
 * Intern / trainee portal data — all read live from the existing TMS libs, keyed
 * only by the `studentId` on the signed-in portal account. `intern` vs `trainee`
 * only changes labels + dashboard layout; the module set is identical.
 */

export interface LearnerOverview {
  overview: StudentOverview;
  attendance: AttendanceSummary;
  certificates: CertificateView[];
  payments: PaymentView[];
  projects: LiveProjectView[];
  assignments: StudentAssignmentView[];
  batchIds: string[];
  /** Category of the primary (active-first) enrolment. */
  category: "internship" | "industrial";
}

export async function getLearnerOverview(studentId: string | null): Promise<LearnerOverview | null> {
  if (!studentId) return null;
  const overview = await getPortalStudentOverview(studentId);
  if (!overview) return null;

  const enrollments = await listEnrollmentsForStudent(studentId);
  const batchIds = Array.from(new Set(enrollments.map((e) => e.batchId).filter(Boolean)));

  const [attendance, certificates, payments, projects, assignments] = await Promise.all([
    studentAttendanceSummary(studentId).catch(() => ({ total: 0, attended: 0, ratePercent: 0, byStatus: {} }) as AttendanceSummary),
    listCertificatesForStudent(studentId).catch(() => [] as CertificateView[]),
    listPaymentsForStudent(studentId).catch(() => [] as PaymentView[]),
    listLiveProjectsForStudent(studentId).catch(() => [] as LiveProjectView[]),
    batchIds.length ? listStudentAssignments(studentId, batchIds).catch(() => [] as StudentAssignmentView[]) : Promise.resolve([] as StudentAssignmentView[]),
  ]);

  const primary =
    overview.enrollments.find((e) => e.status === "active") ?? overview.enrollments[0] ?? null;
  const category: "internship" | "industrial" = primary?.programCategory === "internship" ? "internship" : "industrial";

  return { overview, attendance, certificates, payments, projects, assignments, batchIds, category };
}

/** Class schedule for the student's batches. */
export async function getLearnerSchedule(batchIds: string[]): Promise<{ upcoming: ClassView[]; past: ClassView[] }> {
  if (batchIds.length === 0) return { upcoming: [], past: [] };
  const [upcoming, past] = await Promise.all([
    upcomingClassesForBatches(batchIds, 60),
    pastClassesForBatches(batchIds, 60),
  ]);
  return { upcoming, past };
}
