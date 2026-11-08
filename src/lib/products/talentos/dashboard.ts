import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/talentos/db";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { EMPLOYEES_COLLECTION, employeeFullName, type Employee } from "@/lib/products/talentos/employees";
import { DEPARTMENTS_COLLECTION, type Department } from "@/lib/products/talentos/departments";
import {
  EMPLOYEE_STATUSES,
  ACTIVE_EMPLOYEE_STATUSES,
  EXITED_EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  GENDERS,
} from "@/lib/products/talentos/employee-status";

/**
 * HRMS dashboard analytics. Aggregation-only, same shape/style as
 * `getCareerDashboardStats` in `src/lib/career-applications.ts`. Attendance /
 * leave KPIs are Phase 2 and deliberately absent here.
 */

export interface HrmsDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
  departmentId?: string;
  employmentType?: string;
  status?: string;
  gender?: string;
}

export interface HrmsDashboardStats {
  totalEmployees: number;
  activeEmployees: number;
  /** Joined within the selected date range. */
  newJoinees: number;
  newJoineesGrowth: number | null;
  departments: number;
  /** Cumulative headcount at the end of each bucket in range. */
  headcountTimeSeries: { date: string; count: number }[];
  /** Joiners per bucket in range. */
  hiringTimeSeries: { date: string; count: number }[];
  /** Exits (relieved + terminated) per bucket in range. */
  attritionTimeSeries: { date: string; count: number }[];
  statusDistribution: { status: string; label: string; count: number }[];
  departmentDistribution: { label: string; value: number }[];
  genderDistribution: { status: string; label: string; count: number }[];
  employmentTypeDistribution: { label: string; value: number }[];
  recentJoinees: { id: string; code: string; name: string; joiningDate: string | null; createdAt: string }[];
}

function bucketKey(date: Date, granularity: DashboardGranularity): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  if (granularity === "year") return `${y}`;
  if (granularity === "month") return `${y}-${m}`;
  if (granularity === "week") {
    // ISO week — cheap approximation good enough for a chart axis.
    const tmp = new Date(Date.UTC(y, date.getUTCMonth(), date.getUTCDate()));
    const dayNum = (tmp.getUTCDay() + 6) % 7;
    tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
    const week = 1 + Math.round(((tmp.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
    return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
  }
  return `${y}-${m}-${d}`;
}

export async function getHrmsDashboardStats(filters: HrmsDashboardFilters = {}): Promise<HrmsDashboardStats> {
  const db = await getDb();
  const employees = db.collection<Employee>(EMPLOYEES_COLLECTION);
  const departments = db.collection<Department>(DEPARTMENTS_COLLECTION);
  const granularity = filters.granularity ?? "month";
  const dateFormat = dateFormatFor(granularity);

  const scopeMatch: Record<string, unknown> = { ...notDeleted };
  if (filters.departmentId) scopeMatch["professional.departmentId"] = filters.departmentId;
  if (filters.employmentType) scopeMatch["professional.employmentType"] = filters.employmentType;
  if (filters.status) scopeMatch.status = filters.status;
  if (filters.gender) scopeMatch["personal.gender"] = filters.gender;

  const rangeMatch: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    const r: Record<string, Date> = {};
    if (filters.dateFrom) r.$gte = filters.dateFrom;
    if (filters.dateTo) r.$lte = filters.dateTo;
    rangeMatch.createdAt = r;
  }
  const prev = previousPeriodRange(filters.dateFrom, filters.dateTo);

  const [
    totalEmployees,
    activeEmployees,
    newJoinees,
    prevNewJoinees,
    departmentCount,
    statusAgg,
    deptAgg,
    genderAgg,
    typeAgg,
    hiringAgg,
    attritionAgg,
    recentJoineesDocs,
    allForHeadcount,
    deptDocs,
  ] = await Promise.all([
    employees.countDocuments(scopeMatch),
    employees.countDocuments({ ...scopeMatch, status: { $in: ACTIVE_EMPLOYEE_STATUSES } }),
    employees.countDocuments({ ...scopeMatch, ...rangeMatch }),
    prev
      ? employees.countDocuments({ ...scopeMatch, createdAt: { $gte: prev.from, $lte: prev.to } })
      : Promise.resolve(null),
    departments.countDocuments({ deletedAt: null }),
    employees.aggregate<{ _id: string; count: number }>([{ $match: scopeMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }]).toArray(),
    employees
      .aggregate<{ _id: string | null; count: number }>([{ $match: scopeMatch }, { $group: { _id: "$professional.departmentId", count: { $sum: 1 } } }])
      .toArray(),
    employees.aggregate<{ _id: string | null; count: number }>([{ $match: scopeMatch }, { $group: { _id: "$personal.gender", count: { $sum: 1 } } }]).toArray(),
    employees
      .aggregate<{ _id: string | null; count: number }>([{ $match: scopeMatch }, { $group: { _id: "$professional.employmentType", count: { $sum: 1 } } }])
      .toArray(),
    employees
      .aggregate<{ _id: string; count: number }>([
        { $match: { ...scopeMatch, ...rangeMatch } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    employees
      .aggregate<{ _id: string; count: number }>([
        {
          $match: {
            ...scopeMatch,
            status: { $in: EXITED_EMPLOYEE_STATUSES },
            ...(filters.dateFrom || filters.dateTo
              ? { updatedAt: { ...(filters.dateFrom ? { $gte: filters.dateFrom } : {}), ...(filters.dateTo ? { $lte: filters.dateTo } : {}) } }
              : {}),
          },
        },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$updatedAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    employees.find(scopeMatch).sort({ createdAt: -1 }).limit(6).toArray(),
    employees.find(scopeMatch, { projection: { createdAt: 1 } }).toArray(),
    departments.find({ deletedAt: null }).toArray(),
  ]);

  // Status distribution in canonical order.
  const statusMap = new Map(statusAgg.map((r) => [r._id, r.count]));
  const statusDistribution = EMPLOYEE_STATUSES.map((s) => ({ status: s.value, label: s.label, count: statusMap.get(s.value) ?? 0 }));

  // Department distribution by name.
  const deptNameById = new Map<string, string>(deptDocs.map((d) => [String(d._id), d.name]));
  const departmentDistribution: { label: string; value: number }[] = deptAgg
    .map((r) => ({ label: r._id ? deptNameById.get(r._id) ?? "Unknown" : "Unassigned", value: r.count }))
    .sort((a, b) => b.value - a.value);

  const genderMap = new Map(genderAgg.map((r) => [r._id, r.count]));
  const genderDistribution: { status: string; label: string; count: number }[] = GENDERS.map((g) => ({
    status: g.value as string,
    label: g.label as string,
    count: genderMap.get(g.value) ?? 0,
  }));
  if (genderMap.has(null)) genderDistribution.push({ status: "unknown", label: "Not set", count: genderMap.get(null) ?? 0 });

  const typeMap = new Map(typeAgg.map((r) => [r._id, r.count]));
  const employmentTypeDistribution: { label: string; value: number }[] = EMPLOYMENT_TYPES.map((t) => ({
    label: t.label as string,
    value: typeMap.get(t.value) ?? 0,
  }));
  if (typeMap.has(null)) employmentTypeDistribution.push({ label: "Not set", value: typeMap.get(null) ?? 0 });

  const hiringTimeSeries = hiringAgg.map((d) => ({ date: d._id, count: d.count })).sort((a, b) => a.date.localeCompare(b.date));
  const attritionTimeSeries = attritionAgg.map((d) => ({ date: d._id, count: d.count })).sort((a, b) => a.date.localeCompare(b.date));

  // Cumulative headcount at the end of each bucket that appears in the hiring series
  // (or, if empty, a single "now" point).
  const sortedCreated = allForHeadcount
    .map((e) => new Date(e.createdAt))
    .sort((a, b) => a.getTime() - b.getTime());
  const buckets = hiringTimeSeries.length > 0 ? hiringTimeSeries.map((h) => h.date) : [bucketKey(new Date(), granularity)];
  const headcountTimeSeries = buckets.map((bucket) => {
    // count everyone created on/before the last instant represented by this bucket
    const count = sortedCreated.filter((d) => bucketKey(d, granularity) <= bucket).length;
    return { date: bucket, count };
  });

  const recentJoinees = recentJoineesDocs.map((e) => ({
    id: e._id,
    code: e.employeeCode,
    name: employeeFullName(e),
    joiningDate: e.professional?.joiningDate ?? null,
    createdAt: new Date(e.createdAt).toISOString(),
  }));

  return {
    totalEmployees,
    activeEmployees,
    newJoinees,
    newJoineesGrowth: computeGrowthPercent(newJoinees, prevNewJoinees),
    departments: departmentCount,
    headcountTimeSeries,
    hiringTimeSeries,
    attritionTimeSeries,
    statusDistribution,
    departmentDistribution,
    genderDistribution,
    employmentTypeDistribution,
    recentJoinees,
  };
}
