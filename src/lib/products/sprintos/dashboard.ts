import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/sprintos/db";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { PROJECTS_COLLECTION, type Project } from "@/lib/products/sprintos/projects";
import { CLIENTS_COLLECTION } from "@/lib/products/sprintos/clients";
import { employeeWorkload } from "@/lib/products/sprintos/project-members";
import {
  PROJECT_STATUSES,
  ACTIVE_PROJECT_STATUSES,
  PRIORITIES,
} from "@/lib/products/sprintos/constants";

const MEMBERS_COLLECTION = "pms_project_members";

/**
 * PMS dashboard analytics. Aggregation-only, same shape/style as
 * `getHrmsDashboardStats` in `src/lib/talentos/dashboard.ts`.
 */

export interface PmsDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
  /** Manager-scoped view: only projects this employee manages / is a member of. */
  restrictToEmployeeId?: string;
}

export interface PmsDashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  onHoldProjects: number;
  overdueProjects: number;
  totalClients: number;
  /** Avg total allocation % across all allocated employees (0–100+). */
  teamUtilization: number;
  /** Avg progress across non-terminal projects. */
  overallCompletion: number;
  /** Projects created in the selected range + growth vs previous period. */
  newProjects: number;
  newProjectsGrowth: number | null;

  statusDistribution: { status: string; label: string; count: number }[];
  priorityDistribution: { label: string; value: number }[];
  monthlyGrowth: { date: string; count: number }[];
  progressTrend: { date: string; count: number }[];
  teamWorkload: { label: string; value: number }[];
  deadlineBuckets: { label: string; value: number }[];
  clientDistribution: { label: string; value: number }[];
  recentProjects: {
    id: string;
    code: string;
    name: string;
    status: string;
    progressPercent: number;
    endDate: string | null;
    createdAt: string;
  }[];
}

export async function getPmsDashboardStats(filters: PmsDashboardFilters = {}): Promise<PmsDashboardStats> {
  const db = await getDb();
  const projectsCol = db.collection<Project>(PROJECTS_COLLECTION);
  const clientsCol = db.collection<{ _id: string; companyName: string }>(CLIENTS_COLLECTION);
  const membersCol = db.collection<{ _id: string; projectId: string; employeeId: string; active: boolean }>(MEMBERS_COLLECTION);
  const granularity = filters.granularity ?? "month";
  const dateFormat = dateFormatFor(granularity);
  const now = new Date();

  // Manager scoping — resolve to a project-id set first.
  let idScope: { _id: { $in: string[] } } | Record<string, never> = {};
  if (filters.restrictToEmployeeId) {
    const memberProjectIds = (await membersCol.distinct("projectId", {
      employeeId: filters.restrictToEmployeeId,
      active: true,
      deletedAt: null,
    })) as string[];
    const managed = (await projectsCol.distinct("_id", {
      projectManagerId: filters.restrictToEmployeeId,
      deletedAt: null,
    })) as string[];
    idScope = { _id: { $in: Array.from(new Set([...memberProjectIds, ...managed])) } };
  }

  const baseMatch = { ...notDeleted, ...idScope };
  const rangeMatch: Record<string, unknown> = {};
  if (filters.dateFrom || filters.dateTo) {
    const r: Record<string, Date> = {};
    if (filters.dateFrom) r.$gte = filters.dateFrom;
    if (filters.dateTo) r.$lte = filters.dateTo;
    rangeMatch.createdAt = r;
  }
  const prev = previousPeriodRange(filters.dateFrom, filters.dateTo);
  const todayStr = now.toISOString().slice(0, 10);
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);

  const [
    totalProjects,
    activeProjects,
    completedProjects,
    onHoldProjects,
    totalClients,
    newProjects,
    prevNewProjects,
    statusAgg,
    priorityAgg,
    growthAgg,
    progressAgg,
    clientAgg,
    allForHealth,
    recentDocs,
    workload,
    deadlineOverdue,
    deadline7,
    deadline30,
  ] = await Promise.all([
    projectsCol.countDocuments(baseMatch),
    projectsCol.countDocuments({ ...baseMatch, status: { $in: ACTIVE_PROJECT_STATUSES } }),
    projectsCol.countDocuments({ ...baseMatch, status: "completed" }),
    projectsCol.countDocuments({ ...baseMatch, status: "on_hold" }),
    filters.restrictToEmployeeId ? Promise.resolve(0) : clientsCol.countDocuments(notDeleted),
    projectsCol.countDocuments({ ...baseMatch, ...rangeMatch }),
    prev
      ? projectsCol.countDocuments({ ...baseMatch, createdAt: { $gte: prev.from, $lte: prev.to } })
      : Promise.resolve(null),
    projectsCol
      .aggregate<{ _id: string; count: number }>([{ $match: baseMatch }, { $group: { _id: "$status", count: { $sum: 1 } } }])
      .toArray(),
    projectsCol
      .aggregate<{ _id: string; count: number }>([{ $match: baseMatch }, { $group: { _id: "$priority", count: { $sum: 1 } } }])
      .toArray(),
    projectsCol
      .aggregate<{ _id: string; count: number }>([
        { $match: { ...baseMatch, ...rangeMatch } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$createdAt" } }, count: { $sum: 1 } } },
      ])
      .toArray(),
    projectsCol
      .aggregate<{ _id: string; avg: number }>([
        { $match: { ...baseMatch, ...rangeMatch } },
        { $group: { _id: { $dateToString: { format: dateFormat, date: "$updatedAt" } }, avg: { $avg: "$progressPercent" } } },
      ])
      .toArray(),
    projectsCol
      .aggregate<{ _id: string; count: number }>([{ $match: baseMatch }, { $group: { _id: "$clientId", count: { $sum: 1 } } }])
      .toArray(),
    projectsCol
      .find(baseMatch, { projection: { status: 1, startDate: 1, endDate: 1, progressPercent: 1 } })
      .toArray(),
    projectsCol.find(baseMatch).sort({ createdAt: -1 }).limit(6).toArray(),
    filters.restrictToEmployeeId ? Promise.resolve([]) : employeeWorkload(),
    projectsCol.countDocuments({
      ...baseMatch,
      status: { $nin: ["completed", "cancelled"] },
      endDate: { $lt: todayStr, $ne: null },
    }),
    projectsCol.countDocuments({
      ...baseMatch,
      status: { $nin: ["completed", "cancelled"] },
      endDate: { $gte: todayStr, $lte: in7 },
    }),
    projectsCol.countDocuments({
      ...baseMatch,
      status: { $nin: ["completed", "cancelled"] },
      endDate: { $gt: in7, $lte: in30 },
    }),
  ]);

  const overdueProjects = deadlineOverdue;

  // Team utilization — average total allocation per allocated employee.
  const wl: { totalAllocationPercent: number }[] = workload as { totalAllocationPercent: number }[];
  const teamUtilization =
    wl.length > 0 ? Math.round(wl.reduce((s, w) => s + w.totalAllocationPercent, 0) / wl.length) : 0;

  // Overall completion — avg progress across every project (completed counts as 100).
  const overallCompletion =
    allForHealth.length > 0
      ? Math.round(
          allForHealth.reduce((s, p) => s + (p.status === "completed" ? 100 : p.progressPercent ?? 0), 0) /
            allForHealth.length
        )
      : 0;

  const statusMap = new Map(statusAgg.map((r) => [r._id, r.count]));
  const statusDistribution = PROJECT_STATUSES.map((s) => ({
    status: s.value,
    label: s.label,
    count: statusMap.get(s.value) ?? 0,
  }));

  const priorityMap = new Map(priorityAgg.map((r) => [r._id, r.count]));
  const priorityDistribution = PRIORITIES.map((p) => ({ label: p.label, value: priorityMap.get(p.value) ?? 0 }));

  const monthlyGrowth = growthAgg
    .map((d) => ({ date: d._id, count: d.count }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const progressTrend = progressAgg
    .map((d) => ({ date: d._id, count: Math.round(d.avg) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const clientDocs = await clientsCol
    .find({ _id: { $in: clientAgg.map((r) => r._id) } }, { projection: { companyName: 1 } })
    .toArray();
  const clientNameById = new Map<string, string>(clientDocs.map((c) => [c._id, c.companyName ?? "Unknown"]));
  const clientDistribution = clientAgg
    .map((r) => ({ label: clientNameById.get(r._id) ?? "Unknown", value: r.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 12);

  const teamWorkload = (workload as { employeeName: string; totalAllocationPercent: number }[])
    .slice(0, 12)
    .map((w) => ({ label: w.employeeName, value: w.totalAllocationPercent }));

  const deadlineBuckets = [
    { label: "Overdue", value: deadlineOverdue },
    { label: "Next 7 days", value: deadline7 },
    { label: "Next 30 days", value: deadline30 },
  ];

  /** Return a valid ISO string, falling back to epoch if the value is absent / invalid. */
  const safeIso = (v: unknown): string => {
    if (!v) return new Date(0).toISOString();
    const d = v instanceof Date ? v : new Date(v as string | number);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date(0).toISOString();
  };

  const recentProjects = recentDocs.map((p) => ({
    id: p._id,
    code: p.projectCode,
    name: p.name,
    status: p.status,
    progressPercent: p.progressPercent ?? 0,
    endDate: p.endDate ?? null,
    createdAt: safeIso(p.createdAt),
  }));

  return {
    totalProjects,
    activeProjects,
    completedProjects,
    onHoldProjects,
    overdueProjects,
    totalClients,
    teamUtilization,
    overallCompletion,
    newProjects,
    newProjectsGrowth: computeGrowthPercent(newProjects, prevNewProjects),
    statusDistribution,
    priorityDistribution,
    monthlyGrowth,
    progressTrend,
    teamWorkload,
    deadlineBuckets,
    clientDistribution,
    recentProjects,
  };
}
