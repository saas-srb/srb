import "server-only";
import { getDb } from "@/lib/mongodb";
import { searchStudents } from "@/lib/products/cohort-ai/students";
import { searchPrograms } from "@/lib/products/cohort-ai/programs";
import { searchBatches } from "@/lib/products/cohort-ai/batches";
import { getPaymentAnalytics, listPaymentPlans } from "@/lib/products/cohort-ai/payments";
import { listPlacements } from "@/lib/products/cohort-ai/placements";
import { listCertificates } from "@/lib/products/cohort-ai/certificates";
import { batchAttendanceSummary } from "@/lib/products/cohort-ai/classes";
import { getProgramCategoryMeta, getTrainingModeMeta } from "@/lib/products/cohort-ai/constants";

export const REPORT_TYPES = [
  { value: "students", label: "Student Report", description: "Every student with enrolment counts and status." },
  { value: "batches", label: "Batch Report", description: "Batch schedule, capacity, occupancy and attendance." },
  { value: "programs", label: "Program Report", description: "Catalogue with batch and enrolment totals." },
  { value: "revenue", label: "Revenue Report", description: "Fee plans, collected, pending and collection trend." },
  { value: "placements", label: "Placement Report", description: "Placed students, companies, roles and packages." },
  { value: "certificates", label: "Certificate Report", description: "Issued certificates with type, program and status." },
  { value: "attendance", label: "Attendance Report", description: "Per-batch attendance rate across all classes." },
] as const;

export type ReportType = (typeof REPORT_TYPES)[number]["value"];

export function isValidReportType(v: unknown): v is ReportType {
  return typeof v === "string" && REPORT_TYPES.some((t) => t.value === v);
}

export interface ReportData {
  title: string;
  meta: [string, string | number][];
  columns: { header: string; key: string; width?: number; numFmt?: string }[];
  rows: Record<string, unknown>[];
}

const stampNow = () => new Date().toISOString().slice(0, 10);

export async function buildReport(type: ReportType): Promise<ReportData> {
  switch (type) {
    case "students":
      return buildStudentsReport();
    case "batches":
      return buildBatchesReport();
    case "programs":
      return buildProgramsReport();
    case "revenue":
      return buildRevenueReport();
    case "placements":
      return buildPlacementReport();
    case "certificates":
      return buildCertificateReport();
    case "attendance":
      return buildAttendanceReport();
  }
}

async function buildStudentsReport(): Promise<ReportData> {
  const { items, total } = await searchStudents({ pageSize: 100, page: 1 });
  // pull all pages
  const all = [...items];
  let page = 2;
  while (all.length < total && page < 60) {
    const next = await searchStudents({ pageSize: 100, page });
    all.push(...next.items);
    page += 1;
  }
  return {
    title: "Student Report",
    meta: [["Generated", stampNow()], ["Total students", all.length]],
    columns: [
      { header: "Code", key: "code", width: 14 },
      { header: "Name", key: "name", width: 26 },
      { header: "Email", key: "email", width: 26 },
      { header: "Mobile", key: "mobile", width: 16 },
      { header: "College", key: "college", width: 24 },
      { header: "Status", key: "status", width: 12 },
      { header: "Enrolments", key: "enrolments", width: 12 },
      { header: "Joined", key: "joined", width: 14 },
    ],
    rows: all.map((s) => ({
      code: s.studentCode,
      name: s.fullName,
      email: s.email ?? "",
      mobile: s.mobile ?? "",
      college: s.education.college ?? "",
      status: s.status,
      enrolments: s.enrollmentCount,
      joined: s.createdAt.toISOString().slice(0, 10),
    })),
  };
}

async function buildBatchesReport(): Promise<ReportData> {
  const { items, total } = await searchBatches({ pageSize: 100, page: 1 });
  const all = [...items];
  let page = 2;
  while (all.length < total && page < 60) {
    const next = await searchBatches({ pageSize: 100, page });
    all.push(...next.items);
    page += 1;
  }
  return {
    title: "Batch Report",
    meta: [["Generated", stampNow()], ["Total batches", all.length]],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Batch", key: "name", width: 28 },
      { header: "Program", key: "program", width: 26 },
      { header: "Mode", key: "mode", width: 10 },
      { header: "Start", key: "start", width: 14 },
      { header: "End", key: "end", width: 14 },
      { header: "Capacity", key: "capacity", width: 10 },
      { header: "Enrolled", key: "enrolled", width: 10 },
      { header: "Occupancy %", key: "occupancy", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: all.map((b) => ({
      code: b.batchCode,
      name: b.name,
      program: b.programName,
      mode: getTrainingModeMeta(b.mode).label,
      start: b.startDate ?? "",
      end: b.endDate ?? "",
      capacity: b.capacity,
      enrolled: b.enrolled,
      occupancy: b.capacity > 0 ? Math.round((b.enrolled / b.capacity) * 100) : 0,
      status: b.status,
    })),
  };
}

async function buildProgramsReport(): Promise<ReportData> {
  const { items, total } = await searchPrograms({ pageSize: 100, page: 1 });
  const all = [...items];
  let page = 2;
  while (all.length < total && page < 40) {
    const next = await searchPrograms({ pageSize: 100, page });
    all.push(...next.items);
    page += 1;
  }
  return {
    title: "Program Report",
    meta: [["Generated", stampNow()], ["Total programs", all.length]],
    columns: [
      { header: "Code", key: "code", width: 12 },
      { header: "Program", key: "name", width: 30 },
      { header: "Category", key: "category", width: 18 },
      { header: "Technology", key: "technology", width: 20 },
      { header: "Duration (wk)", key: "duration", width: 12 },
      { header: "Mode", key: "mode", width: 10 },
      { header: "Fees", key: "fees", width: 12, numFmt: "#,##0" },
      { header: "Batches", key: "batches", width: 10 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: all.map((p) => ({
      code: p.programCode,
      name: p.name,
      category: getProgramCategoryMeta(p.category).label,
      technology: p.technology ?? "",
      duration: p.durationWeeks ?? "",
      mode: getTrainingModeMeta(p.mode).label,
      fees: p.fees ?? 0,
      batches: p.batchCount,
      status: p.status,
    })),
  };
}

async function buildRevenueReport(): Promise<ReportData> {
  const [analytics, plans] = await Promise.all([getPaymentAnalytics(), listPaymentPlans({}, 2000)]);
  return {
    title: "Revenue Report",
    meta: [
      ["Generated", stampNow()],
      ["Total billed", analytics.totalBilled],
      ["Total collected", analytics.totalCollected],
      ["Total pending", analytics.totalPending],
      ["Fee plans", analytics.planCount],
      ["Fully paid", analytics.fullyPaid],
    ],
    columns: [
      { header: "Student", key: "student", width: 26 },
      { header: "Code", key: "code", width: 14 },
      { header: "Program", key: "program", width: 26 },
      { header: "Currency", key: "currency", width: 10 },
      { header: "Net Fees", key: "net", width: 14, numFmt: "#,##0" },
      { header: "Paid", key: "paid", width: 14, numFmt: "#,##0" },
      { header: "Pending", key: "pending", width: 14, numFmt: "#,##0" },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: plans.map((p) => ({
      student: p.studentName,
      code: p.studentCode ?? "",
      program: p.programName,
      currency: p.currency,
      net: Math.max(p.totalFees - p.discount, 0),
      paid: p.paidAmount,
      pending: p.pendingAmount,
      status: p.status,
    })),
  };
}

async function buildPlacementReport(): Promise<ReportData> {
  const rows = await listPlacements({}, 2000);
  const db = await getDb();
  const completed = await db.collection("student_enrollments").countDocuments({ deletedAt: null, status: "completed" });
  return {
    title: "Placement Report",
    meta: [
      ["Generated", stampNow()],
      ["Total placements", rows.length],
      ["Completed enrolments", completed],
      ["Placement rate %", completed > 0 ? Math.round((rows.length / completed) * 100) : 0],
    ],
    columns: [
      { header: "Student", key: "student", width: 26 },
      { header: "Code", key: "code", width: 14 },
      { header: "Program", key: "program", width: 24 },
      { header: "Company", key: "company", width: 24 },
      { header: "Role", key: "role", width: 22 },
      { header: "Package (LPA)", key: "package", width: 14 },
      { header: "Location", key: "location", width: 18 },
      { header: "Type", key: "type", width: 20 },
      { header: "Placed on", key: "placedOn", width: 14 },
    ],
    rows: rows.map((r) => ({
      student: r.studentName,
      code: r.studentCode ?? "",
      program: r.programName ?? "",
      company: r.company,
      role: r.role,
      package: r.packageLpa ?? "",
      location: r.location ?? "",
      type: r.typeLabel,
      placedOn: r.placedOn,
    })),
  };
}

async function buildCertificateReport(): Promise<ReportData> {
  const rows = await listCertificates({}, 3000);
  return {
    title: "Certificate Report",
    meta: [["Generated", stampNow()], ["Total certificates", rows.length], ["Revoked", rows.filter((r) => r.revoked).length]],
    columns: [
      { header: "Number", key: "number", width: 20 },
      { header: "Student", key: "student", width: 24 },
      { header: "Type", key: "type", width: 26 },
      { header: "Program", key: "program", width: 24 },
      { header: "Batch", key: "batch", width: 22 },
      { header: "Grade", key: "grade", width: 10 },
      { header: "Issued on", key: "issuedOn", width: 14 },
      { header: "Status", key: "status", width: 12 },
    ],
    rows: rows.map((c) => ({
      number: c.certificateNumber,
      student: c.studentName,
      type: c.typeLabel,
      program: c.programName,
      batch: c.batchName ?? "",
      grade: c.grade ?? "",
      issuedOn: c.issuedOn,
      status: c.revoked ? "Revoked" : "Valid",
    })),
  };
}

async function buildAttendanceReport(): Promise<ReportData> {
  const { items } = await searchBatches({ pageSize: 100, page: 1 });
  const rows = await Promise.all(
    items.map(async (b) => {
      const summary = await batchAttendanceSummary(b._id);
      return {
        code: b.batchCode,
        name: b.name,
        program: b.programName,
        enrolled: b.enrolled,
        marks: summary.total,
        attended: summary.attended,
        rate: summary.ratePercent,
      };
    })
  );
  return {
    title: "Attendance Report",
    meta: [["Generated", stampNow()], ["Batches", rows.length]],
    columns: [
      { header: "Batch Code", key: "code", width: 12 },
      { header: "Batch", key: "name", width: 28 },
      { header: "Program", key: "program", width: 26 },
      { header: "Enrolled", key: "enrolled", width: 10 },
      { header: "Attendance Marks", key: "marks", width: 16 },
      { header: "Attended", key: "attended", width: 10 },
      { header: "Attendance Rate %", key: "rate", width: 16 },
    ],
    rows,
  };
}
