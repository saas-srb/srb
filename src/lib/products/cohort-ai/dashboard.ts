import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cohort-ai/db";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { PROGRAMS_COLLECTION } from "@/lib/products/cohort-ai/programs";
import { BATCHES_COLLECTION, enrolledCountByBatch } from "@/lib/products/cohort-ai/batches";
import { PROGRAM_CATEGORIES, type TrainingMode } from "@/lib/products/cohort-ai/constants";

const STUDENTS_COLLECTION = "training_students";
const ENROLLMENTS_COLLECTION = "student_enrollments";
const CERTIFICATES_COLLECTION = "certificates";
const PAYMENTS_COLLECTION = "payments";
const PLACEMENTS_COLLECTION = "placement_records";

/**
 * TMS dashboard analytics. Aggregation-only, same shape/style as
 * `getPmsDashboardStats` in `src/lib/sprintos/dashboard.ts`. Collections that later
 * phases introduce (students, enrollments, payments…) simply return zero /
 * empty until they exist — querying a missing collection is a no-op in Mongo.
 */

export interface TmsDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
  programId?: string;
  mode?: TrainingMode;
}

export interface TmsDashboardStats {
  totalStudents: number;
  industrialStudents: number;
  internshipStudents: number;
  activeBatches: number;
  runningPrograms: number;
  completedPrograms: number;
  placementSuccessRate: number;
  totalRevenue: number;
  certificatesIssued: number;
  /** Students admitted in the selected range + growth vs the previous period. */
  newStudents: number;
  newStudentsGrowth: number | null;

  enrollmentTrend: { date: string; count: number }[];
  monthlyAdmissions: { date: string; count: number }[];
  programEnrollment: { label: string; value: number }[];
  categorySplit: { status: string; label: string; count: number }[];
  revenueTrend: { date: string; count: number }[];
  batchOccupancy: { label: string; value: number }[];
  completionRate: { label: string; value: number }[];
  placementTrend: { date: string; count: number }[];
}

type TmsDoc = { _id: string } & Record<string, unknown>;

function scopeFilter(programId?: string): Record<string, unknown> {
  return programId ? { programId } : {};
}

export async function getTmsDashboardStats(filters: TmsDashboardFilters = {}): Promise<TmsDashboardStats> {
  const db = await getDb();
  const programsCol = db.collection<TmsDoc>(PROGRAMS_COLLECTION);
  const batchesCol = db.collection<TmsDoc>(BATCHES_COLLECTION);
  const studentsCol = db.collection<TmsDoc>(STUDENTS_COLLECTION);
  const enrollmentsCol = db.collection<TmsDoc>(ENROLLMENTS_COLLECTION);
  const certificatesCol = db.collection<TmsDoc>(CERTIFICATES_COLLECTION);
  const paymentsCol = db.collection<TmsDoc>(PAYMENTS_COLLECTION);
  const placementsCol = db.collection<TmsDoc>(PLACEMENTS_COLLECTION);

  const granularity = filters.granularity ?? "month";
  const dateFormat = dateFormatFor(granularity);

  const rangeMatch: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    const r: Record<string, Date> = {};
    if (filters.dateFrom) r.$gte = filters.dateFrom;
    if (filters.dateTo) r.$lte = filters.dateTo;
    rangeMatch.createdAt = r;
  }
  const prev = previousPeriodRange(filters.dateFrom, filters.dateTo);
  const enrollScope = scopeFilter(filters.programId);
  const programMatch: Record<string, unknown> = { ...notDeleted };
  if (filters.programId) programMatch._id = filters.programId;
  if (filters.mode) programMatch.mode = filters.mode;

  // Category → set of program ids (for the industrial vs internship split).
  const programDocs = await programsCol
    .find(programMatch, { projection: { name: 1, category: 1 } })
    .toArray();
  const programIdsByCategory = new Map<string, string[]>();
  const programNameById = new Map<string, string>();
  for (const p of programDocs) {
    programNameById.set(p._id, (p.name as string) ?? "Untitled");
    const list = programIdsByCategory.get(p.category as string) ?? [];
    list.push(p._id);
    programIdsByCategory.set(p.category as string, list);
  }
  const industrialIds = programIdsByCategory.get("industrial") ?? [];
  const internshipIds = programIdsByCategory.get("internship") ?? [];

  const [
    totalStudents,
    industrialStudents,
    internshipStudents,
    activeBatches,
    runningPrograms,
    completedProgramsCount,
    placementsTotal,
    completedEnrollmentsForPlacement,
    certificatesIssued,
    newStudents,
    prevNewStudents,
    admissionsAgg,
    enrollmentAgg,
    programEnrollmentAgg,
    revenueAgg,
    revenuePaidTotal,
    batchDocs,
    enrollmentStatusAgg,
    placementAgg,
  ] = await Promise.all([
    studentsCol.countDocuments({ ...notDeleted, ...enrollScope }),
    industrialIds.length
      ? enrollmentsCol.distinct("studentId", { deletedAt: null, programId: { $in: industrialIds } }).then((a) => a.length)
      : Promise.resolve(0),
    internshipIds.length
      ? enrollmentsCol.distinct("studentId", { deletedAt: null, programId: { $in: internshipIds } }).then((a) => a.length)
      : Promise.resolve(0),
    batchesCol.countDocuments({ ...notDeleted, status: "running", ...(filters.programId ? { programId: filters.programId } : {}) }),
    programsCol.countDocuments({ ...notDeleted, status: "active", ...(filters.programId ? { _id: filters.programId } : {}), ...(filters.mode ? { mode: filters.mode } : {}) }),
    programsCol.countDocuments({ ...notDeleted, status: "archived", ...(filters.mode ? { mode: filters.mode } : {}) }),
    placementsCol.countDocuments({ ...notDeleted }),
    enrollmentsCol.countDocuments({ deletedAt: null, status: "completed", ...enrollScope }),
    certificatesCol.countDocuments({ ...notDeleted, ...enrollScope }),
    studentsCol.countDocuments({ ...notDeleted, ...enrollScope, ...rangeMatch }),
    prev
      ? studentsCol.countDocuments({ ...notDeleted, ...enrollScope, createdAt: { $gte: prev.from, $lte: prev.to } })
      : Promise.resolve(null),
    studentsCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { ...notDeleted, ...enrollScope, ...rangeMatch } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    enrollmentsCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { deletedAt: null, ...enrollScope, ...rangeMatch } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    enrollmentsCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { deletedAt: null, ...enrollScope } },
        { $group: { _id: "$programId", count: { $sum: 1 } } },
      ])
      .toArray(),
    paymentsCol
      .aggregate<{ _id: string; total: number }>([
        { $match: { deletedAt: null, ...enrollScope, ...rangeMatch } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, total: { $sum: "$paidAmount" } } },
      ])
      .toArray(),
    paymentsCol
      .aggregate<{ _id: null; total: number }>([
        { $match: { deletedAt: null, ...enrollScope } },
        { $group: { _id: null, total: { $sum: "$paidAmount" } } },
      ])
      .toArray(),
    batchesCol
      .find(
        { ...notDeleted, ...(filters.programId ? { programId: filters.programId } : {}), status: { $in: ["upcoming", "running"] } },
        { projection: { name: 1, batchCode: 1, capacity: 1 } }
      )
      .sort({ createdAt: -1 })
      .limit(14)
      .toArray(),
    enrollmentsCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { deletedAt: null, ...enrollScope } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray(),
    placementsCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { ...notDeleted, ...rangeMatch } },
        // `placedOn` is stored as an ISO yyyy-mm-dd string, not a Date.
        { $group: { _id: { $substrBytes: ["$placedOn", 0, 7] }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  const placementSuccessRate =
    completedEnrollmentsForPlacement > 0
      ? Math.round((placementsTotal / completedEnrollmentsForPlacement) * 100)
      : 0;

  const totalRevenue = revenuePaidTotal[0]?.total ?? 0;

  const enrollmentTrend = enrollmentAgg
    .map((d) => ({ date: d._id, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const monthlyAdmissions = admissionsAgg
    .map((d) => ({ date: d._id, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const programEnrollment = programEnrollmentAgg
    .map((r) => ({ label: programNameById.get(r._id) ?? "Unknown", value: r.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const categorySplit = PROGRAM_CATEGORIES.map((c) => ({
    status: c.value,
    label: c.label,
    count: c.value === "industrial" ? industrialStudents : internshipStudents,
  }));

  const revenueTrend = revenueAgg
    .map((d) => ({ date: d._id, count: Math.round(d.total) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const occByBatch = await enrolledCountByBatch(batchDocs.map((b) => b._id));
  const batchOccupancy = batchDocs.map((b) => {
    const cap = Number(b.capacity) || 0;
    const filled = occByBatch.get(b._id) ?? 0;
    const pct = cap > 0 ? Math.round((filled / cap) * 100) : 0;
    return { label: (b.batchCode as string) ?? (b.name as string) ?? "Batch", value: pct };
  });

  const enrollmentStatusMap = new Map(enrollmentStatusAgg.map((r) => [r._id, r.count]));
  const completionRate = [
    { label: "Active", value: enrollmentStatusMap.get("active") ?? 0 },
    { label: "Completed", value: enrollmentStatusMap.get("completed") ?? 0 },
    { label: "Dropped", value: enrollmentStatusMap.get("dropped") ?? 0 },
    { label: "On Hold", value: enrollmentStatusMap.get("on_hold") ?? 0 },
  ];

  const placementTrend = placementAgg
    .map((d) => ({ date: d._id, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalStudents,
    industrialStudents,
    internshipStudents,
    activeBatches,
    runningPrograms,
    completedPrograms: completedProgramsCount,
    placementSuccessRate,
    totalRevenue,
    certificatesIssued,
    newStudents,
    newStudentsGrowth: computeGrowthPercent(newStudents, prevNewStudents),
    enrollmentTrend,
    monthlyAdmissions,
    programEnrollment,
    categorySplit,
    revenueTrend,
    batchOccupancy,
    completionRate,
    placementTrend,
  };
}
