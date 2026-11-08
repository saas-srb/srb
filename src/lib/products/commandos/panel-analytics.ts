import "server-only";
import { listPanels } from "@/lib/platform/panels/store";
import { whiteLabelProductName } from "@/lib/platform/panels/types";
import { getDb } from "@/lib/mongodb";
import { getFmsDashboardStats } from "@/lib/products/cashflow-ai/dashboard";
import { getHrmsDashboardStats } from "@/lib/products/talentos/dashboard";
import { getPmsDashboardStats } from "@/lib/products/sprintos/dashboard";
import { getPrmsDashboardStats } from "@/lib/products/spendiq/dashboard";
import { getTmsDashboardStats } from "@/lib/products/cohort-ai/dashboard";
import { getMessengerDashboardStats } from "@/lib/products/huddle-ai/dashboard";
import { getDashboardStats as getCrmDashboardStats } from "@/lib/leads";
import { externalUsers } from "@/lib/portal-auth";
import { PORTAL_ROLES, type PortalRole } from "@/lib/portal-roles";
import { round2 } from "@/lib/products/cashflow-ai/constants";
import { normalizeAdminRoles } from "@/lib/admin-roles";
import { type DashboardGranularity } from "@/lib/granularity";
import { getDashboard as getSopDashboard } from "@/lib/products/playbook-ai/analytics";
import { COLLECTIONS as SOP_COLLECTIONS } from "@/lib/products/playbook-ai/db";
import type { SopViewer } from "@/lib/products/playbook-ai/types";
import { countRecords as countDlmsRecords, type RecordQuery as DlmsRecordQuery } from "@/lib/products/cybervault/records";
import { COLLECTIONS as DLMS_COLLECTIONS } from "@/lib/products/cybervault/db";
import { RECORD_TYPES as DLMS_RECORD_TYPES, RECORD_TYPE_LABEL as DLMS_RECORD_TYPE_LABEL, type RecordType as DlmsRecordType } from "@/lib/products/cybervault/constants";
import type { DlmsViewer } from "@/lib/products/cybervault/viewer";
import { getDashboard as getOtsDashboard } from "@/lib/products/evaliq/analytics";
import { COLLECTIONS as OTS_COLLECTIONS } from "@/lib/products/evaliq/db";
import { getDashboard as getAibotsDashboard } from "@/lib/products/agentos/runs";
import type { AibotsViewer } from "@/lib/products/agentos/viewer";
import { getDashboard as getSmmsDashboard, postMetricsByPlatform } from "@/lib/products/viralpulse-ai/analytics";
import { PLATFORM_META as SMMS_PLATFORM_META } from "@/lib/products/viralpulse-ai/constants";
import { getDashboard as getSeoDashboard } from "@/lib/products/rankmax-ai/analytics";
import { SEVERITIES as SEO_SEVERITIES, SEVERITY_META as SEO_SEVERITY_META, CATEGORIES as SEO_CATEGORIES, CATEGORY_LABEL as SEO_CATEGORY_LABEL } from "@/lib/products/rankmax-ai/checks";
import { BUCKETS as SEO_RANK_BUCKETS } from "@/lib/products/rankmax-ai/rankings";
import { listPages as listCmsPages } from "@/lib/products/sitecraft-ai/pages";
import { listMedia as listCmsMedia } from "@/lib/products/sitecraft-ai/media";
import { getSettings as getCmsSettings } from "@/lib/products/sitecraft-ai/settings";
import { listAdminRecords as listCmsRecords } from "@/lib/products/sitecraft-ai/collections/store";
import { COLLECTIONS as CMS_RECORD_COLLECTIONS } from "@/lib/products/sitecraft-ai/collections/registry";
import type { CollectionKey as CmsCollectionKey } from "@/lib/products/sitecraft-ai/collections/types";
import { COLLECTIONS as CMS_COLLECTIONS } from "@/lib/products/sitecraft-ai/db";
import { SITE_AREAS as CMS_SITE_AREAS, areaOf as cmsAreaOf } from "@/lib/products/sitecraft-ai/site-areas";
import { seoIssues as cmsSeoIssues } from "@/lib/products/sitecraft-ai/seo-checks";
import { getLpmsDashboard } from "@/lib/products/contractflow-ai/analytics";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import type { LpmsViewer } from "@/lib/products/contractflow-ai/types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

async function safeCount(collection: string, match: Record<string, unknown> = {}): Promise<number> {
  try {
    const db = await getDb();
    return db.collection(collection).countDocuments({ deletedAt: null, ...match });
  } catch {
    return 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FMS Analytics
// ─────────────────────────────────────────────────────────────────────────────

export interface PanelAnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  granularity?: "day" | "week" | "month" | "year";
  status?: string;
  category?: string;
  departmentId?: string;
  role?: string;
  source?: string;
  employmentType?: string;
  gender?: string;
  expenseType?: string;
  paymentStatus?: string;
  mode?: string;
  programId?: string;
  restrictToEmployeeId?: string;
}

export type FmsAnalytics = Awaited<ReturnType<typeof getFmsAnalytics>>;

export async function getFmsAnalytics(filters?: PanelAnalyticsFilters) {
  const stats = await getFmsDashboardStats({
    granularity: (filters?.granularity as DashboardGranularity) ?? "month",
    dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
  });
  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (stats.overdueInvoices > 0) alerts.push({ type: "danger", message: `${stats.overdueInvoices} overdue invoice(s) need immediate attention` });
  if (stats.pendingApprovals > 0) alerts.push({ type: "warning", message: `${stats.pendingApprovals} transaction(s) pending approval` });
  if (stats.hasUnratedForeignCurrency) alerts.push({ type: "warning", message: "Some transactions use currencies without configured exchange rates" });

  return {
    kpis: {
      totalRevenue: stats.totalRevenue,
      totalExpenses: stats.totalExpenses,
      netProfit: stats.netProfit,
      profitMargin: stats.totalRevenue > 0 ? round2((stats.netProfit / stats.totalRevenue) * 100) : 0,
      totalCash: stats.totalCash,
      totalBankBalance: stats.totalBankBalance,
      accountsReceivable: stats.accountsReceivable,
      accountsPayable: stats.accountsPayable,
      outstandingInvoices: stats.outstandingInvoices,
      overdueInvoices: stats.overdueInvoices,
      pendingApprovals: stats.pendingApprovals,
      currentMonthRevenue: stats.currentMonthRevenue,
      currentMonthExpenses: stats.currentMonthExpenses,
      currentMonthProfit: stats.currentMonthProfit,
      payrollPayable: stats.payrollPayable,
      taxPayable: stats.taxPayable,
      trainingRevenue: stats.trainingRevenue,
      subscriptionCommitment: stats.subscriptionCommitment,
    },
    charts: {
      revenueVsExpenses: stats.revenueVsExpenses,
      monthlyProfitLoss: stats.monthlyProfitLoss,
      revenueBySource: stats.revenueBySource,
      expensesByCategory: stats.expensesByCategory,
      receivablesAging: stats.receivablesAging,
      payablesAging: stats.payablesAging,
      projectProfitability: stats.projectProfitability,
    },
    panelSummary: stats.panelSummary,
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HRMS Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type HrmsAnalytics = Awaited<ReturnType<typeof getHrmsAnalytics>>;

export async function getHrmsAnalytics(filters?: PanelAnalyticsFilters) {
  const stats = await getHrmsDashboardStats({
    granularity: (filters?.granularity as DashboardGranularity) ?? "month",
    dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    departmentId: filters?.departmentId,
    employmentType: filters?.employmentType,
    status: filters?.status,
    gender: filters?.gender,
  });
  const attritionRate =
    stats.totalEmployees > 0
      ? round2((stats.attritionTimeSeries.reduce((s, p) => s + p.count, 0) / stats.totalEmployees) * 100)
      : 0;

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (attritionRate > 10) alerts.push({ type: "danger", message: `High attrition rate: ${attritionRate}%` });
  if (stats.newJoinees === 0) alerts.push({ type: "warning", message: "No new joiners in the selected period" });

  return {
    kpis: {
      totalEmployees: stats.totalEmployees,
      activeEmployees: stats.activeEmployees,
      newJoinees: stats.newJoinees,
      newJoineesGrowth: stats.newJoineesGrowth,
      departments: stats.departments,
      attritionRate,
    },
    charts: {
      headcountTimeSeries: stats.headcountTimeSeries,
      hiringTimeSeries: stats.hiringTimeSeries,
      attritionTimeSeries: stats.attritionTimeSeries,
      statusDistribution: stats.statusDistribution.map((s) => ({ label: s.label, value: s.count })),
      departmentDistribution: stats.departmentDistribution,
      genderDistribution: stats.genderDistribution.map((g) => ({ label: g.label, value: g.count })),
      employmentTypeDistribution: stats.employmentTypeDistribution,
    },
    recentJoinees: stats.recentJoinees,
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LMS (CRM / Lead Management) Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type LmsAnalytics = Awaited<ReturnType<typeof getLmsAnalytics>>;

export async function getLmsAnalytics(filters?: PanelAnalyticsFilters) {
  const stats = await getCrmDashboardStats({
    granularity: (filters?.granularity as DashboardGranularity) ?? "month",
    dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    category: filters?.category as any,
    status: filters?.status as any,
    source: filters?.source as any,
  });
  const conversionRate =
    stats.totalOverall > 0 ? round2(((stats.byStatus.completed ?? 0) / stats.totalOverall) * 100) : 0;

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (stats.staleCount > 0) alerts.push({ type: "warning", message: `${stats.staleCount} stale lead(s) not followed up in 7+ days` });

  const sourcePieData = Object.entries(stats.bySource).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

  return {
    kpis: {
      totalLeads: stats.totalOverall,
      newLeads: stats.byStatus.new ?? 0,
      inProgress: stats.byStatus.in_progress ?? 0,
      completed: stats.byStatus.completed ?? 0,
      rejected: stats.byStatus.rejected ?? 0,
      conversionRate,
      staleCount: stats.staleCount,
      previousPeriodTotal: stats.previousPeriodTotal,
      growthPercent: stats.growthPercent,
    },
    charts: {
      timeSeries: stats.timeSeries,
      bySource: sourcePieData,
      topCategories: stats.topCategories,
      funnel: stats.funnel,
      byWeekday: stats.byWeekday,
    },
    recentLeads: stats.recent.slice(0, 8).map((l) => ({
      id: String(l._id),
      name: l.name,
      category: l.category,
      status: l.status ?? "new",
      source: l.source ?? "—",
      createdAt: new Date(l.createdAt).toISOString(),
    })),
    staleLeads: stats.staleLeads.slice(0, 5).map((l) => ({
      id: String(l._id),
      name: l.name,
      category: l.category,
      status: l.status ?? "new",
      createdAt: new Date(l.createdAt).toISOString(),
    })),
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Messenger Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type MessengerAnalytics = Awaited<ReturnType<typeof getMessengerAnalytics>>;

export async function getMessengerAnalytics(filters?: PanelAnalyticsFilters) {
  const now = new Date();
  const from = filters?.dateFrom ? new Date(filters.dateFrom) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = filters?.dateTo ? new Date(filters.dateTo) : now;
  const stats = await getMessengerDashboardStats({ from, to, viewerId: "command-center" });

  const engagementRate =
    stats.kpis.activeUsers > 0
      ? round2((stats.kpis.onlineMembers / stats.kpis.activeUsers) * 100)
      : 0;

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (stats.kpis.messagesSentToday === 0) alerts.push({ type: "warning", message: "No messages sent today — team may be offline" });

  return {
    kpis: {
      activeUsers: stats.kpis.activeUsers,
      onlineMembers: stats.kpis.onlineMembers,
      totalChannels: stats.kpis.totalChannels,
      activeProjectChannels: stats.kpis.activeProjectChannels,
      messagesSentToday: stats.kpis.messagesSentToday,
      directMessagesToday: stats.kpis.directMessagesToday,
      sharedFiles: stats.kpis.sharedFiles,
      engagementRate,
    },
    charts: {
      dailyMessagingTrend: stats.dailyMessagingTrend,
      channelActivity: stats.channelActivity,
      mostActiveMembers: stats.mostActiveMembers,
      onlineVsOffline: stats.onlineVsOffline,
      fileSharing: stats.fileSharing,
      peakHours: stats.peakHours,
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PMS Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type PmsAnalytics = Awaited<ReturnType<typeof getPmsAnalytics>>;

export async function getPmsAnalytics(filters?: PanelAnalyticsFilters) {
  const stats = await getPmsDashboardStats({
    granularity: (filters?.granularity as DashboardGranularity) ?? "month",
    dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    restrictToEmployeeId: filters?.restrictToEmployeeId,
  });

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (stats.overdueProjects > 0) alerts.push({ type: "danger", message: `${stats.overdueProjects} overdue project(s) need attention` });
  if (stats.teamUtilization > 90) alerts.push({ type: "warning", message: `Team utilization at ${stats.teamUtilization}% — risk of burnout` });
  if (stats.onHoldProjects > 0) alerts.push({ type: "warning", message: `${stats.onHoldProjects} project(s) currently on hold` });

  return {
    kpis: {
      totalProjects: stats.totalProjects,
      activeProjects: stats.activeProjects,
      completedProjects: stats.completedProjects,
      onHoldProjects: stats.onHoldProjects,
      overdueProjects: stats.overdueProjects,
      totalClients: stats.totalClients,
      teamUtilization: stats.teamUtilization,
      overallCompletion: stats.overallCompletion,
      newProjects: stats.newProjects,
      newProjectsGrowth: stats.newProjectsGrowth,
    },
    charts: {
      statusDistribution: stats.statusDistribution.map((s) => ({ label: s.label, value: s.count })),
      priorityDistribution: stats.priorityDistribution,
      monthlyGrowth: stats.monthlyGrowth,
      progressTrend: stats.progressTrend,
      teamWorkload: stats.teamWorkload,
      deadlineBuckets: stats.deadlineBuckets,
      clientDistribution: stats.clientDistribution,
    },
    recentProjects: stats.recentProjects,
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type PortalAnalytics = Awaited<ReturnType<typeof getPortalAnalytics>>;

export async function getPortalAnalytics(filters?: PanelAnalyticsFilters) {
  const empty = Object.fromEntries(PORTAL_ROLES.map((r) => [r, 0])) as Record<PortalRole, number>;

  let total = 0;
  let byRole: Record<PortalRole, number> = { ...empty };
  let recentUsers: { id: string; name: string; email: string; role: string; createdAt: string }[] = [];

  const matchFilter: Record<string, unknown> = {
    ...(filters?.status && filters.status !== "all" ? { status: filters.status } : { status: "active" }),
    ...(filters?.role && filters.role !== "all" ? { role: filters.role } : {}),
  };

  try {
    const collection = await externalUsers();
    const [rows, recent] = await Promise.all([
      collection
        .aggregate<{ _id: PortalRole; count: number }>([
          { $match: matchFilter },
          { $group: { _id: "$role", count: { $sum: 1 } } },
        ])
        .toArray(),
      collection.find(matchFilter).sort({ createdAt: -1 }).limit(10).toArray(),
    ]);
    byRole = { ...empty };
    for (const r of rows) byRole[r._id] = r.count;
    total = Object.values(byRole).reduce((a, b) => a + b, 0);
    recentUsers = recent.map((u) => ({
      id: String(u._id),
      name: u.displayName ?? "—",
      email: (u.email as string) ?? "—",
      role: (u.role as string) ?? "—",
      createdAt: new Date(u.createdAt as Date).toISOString(),
    }));
  } catch {
    // Collections not yet seeded — safe fallback.
  }

  const rolePieData = PORTAL_ROLES.map((r) => ({ label: r.replace("_", " "), value: byRole[r] }));

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (total === 0) alerts.push({ type: "warning", message: "No active external portal users yet" });

  return {
    kpis: {
      total,
      clients: byRole.client,
      jobApplicants: byRole.job_applicant,
      interns: byRole.intern,
      trainees: byRole.trainee,
    },
    charts: {
      byRole: rolePieData,
    },
    recentUsers,
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRMS Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type PrmsAnalytics = Awaited<ReturnType<typeof getPrmsAnalytics>>;

export async function getPrmsAnalytics(filters?: PanelAnalyticsFilters) {
  const stats = await getPrmsDashboardStats({
    granularity: (filters?.granularity as DashboardGranularity) ?? "month",
    dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    departmentId: filters?.departmentId,
    category: filters?.category,
    expenseType: filters?.expenseType,
    paymentStatus: filters?.paymentStatus,
  });

  const budgetUtilization =
    stats.approvedBudget > 0
      ? round2(((stats.approvedBudget - stats.remainingBudget) / stats.approvedBudget) * 100)
      : 0;

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (stats.pendingPurchaseRequests > 0) alerts.push({ type: "warning", message: `${stats.pendingPurchaseRequests} purchase request(s) awaiting approval` });
  if (stats.pendingInvoicePayments > 0) alerts.push({ type: "warning", message: `${stats.pendingInvoicePayments} vendor invoice(s) pending payment` });
  if (budgetUtilization > 90) alerts.push({ type: "danger", message: `Budget utilization at ${budgetUtilization}% — nearing limit` });

  return {
    kpis: {
      totalProcurementSpend: stats.totalProcurementSpend,
      monthlyExpenses: stats.monthlyExpenses,
      approvedBudget: stats.approvedBudget,
      remainingBudget: stats.remainingBudget,
      budgetUtilization,
      totalAssetsValue: stats.totalAssetsValue,
      totalOfficeAssets: stats.totalOfficeAssets,
      activeVendors: stats.activeVendors,
      activeSubscriptions: stats.activeSubscriptions,
      infrastructureCost: stats.infrastructureCost,
      pendingPurchaseRequests: stats.pendingPurchaseRequests,
      pendingInvoicePayments: stats.pendingInvoicePayments,
      annualOperationalCost: stats.annualOperationalCost,
    },
    charts: {
      monthlyExpenseTrend: stats.monthlyExpenseTrend,
      categoryExpenses: stats.categoryExpenses,
      vendorSpend: stats.vendorSpend,
      saasSubscriptionCost: stats.saasSubscriptionCost,
      infrastructureCostTrend: stats.infrastructureCostTrend,
      assetAcquisitionTrend: stats.assetAcquisitionTrend,
      departmentExpenses: stats.departmentExpenses,
      cashOutflowTimeline: stats.cashOutflowTimeline,
      topExpenseCategories: stats.topExpenseCategories,
      budgetVsActual: stats.budgetVsActual,
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TMS Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type TmsAnalytics = Awaited<ReturnType<typeof getTmsAnalytics>>;

export async function getTmsAnalytics(filters?: PanelAnalyticsFilters) {
  const stats = await getTmsDashboardStats({
    granularity: (filters?.granularity as DashboardGranularity) ?? "month",
    dateFrom: filters?.dateFrom ? new Date(filters.dateFrom) : undefined,
    dateTo: filters?.dateTo ? new Date(filters.dateTo) : undefined,
    mode: filters?.mode as any,
    programId: filters?.programId,
  });

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (stats.placementSuccessRate < 50 && stats.totalStudents > 0)
    alerts.push({ type: "warning", message: `Placement rate at ${stats.placementSuccessRate}% — below 50% target` });

  return {
    kpis: {
      totalStudents: stats.totalStudents,
      industrialStudents: stats.industrialStudents,
      internshipStudents: stats.internshipStudents,
      activeBatches: stats.activeBatches,
      runningPrograms: stats.runningPrograms,
      completedPrograms: stats.completedPrograms,
      placementSuccessRate: stats.placementSuccessRate,
      totalRevenue: stats.totalRevenue,
      certificatesIssued: stats.certificatesIssued,
      newStudents: stats.newStudents,
      newStudentsGrowth: stats.newStudentsGrowth,
    },
    charts: {
      enrollmentTrend: stats.enrollmentTrend,
      monthlyAdmissions: stats.monthlyAdmissions,
      programEnrollment: stats.programEnrollment,
      categorySplit: stats.categorySplit.map((c) => ({ label: c.label, value: c.count })),
      revenueTrend: stats.revenueTrend,
      batchOccupancy: stats.batchOccupancy,
      completionRate: stats.completionRate,
      placementTrend: stats.placementTrend,
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Workspace Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type WorkspaceAnalytics = Awaited<ReturnType<typeof getWorkspaceAnalytics>>;

export async function getWorkspaceAnalytics(filters?: PanelAnalyticsFilters) {
  const ADMIN_USERS_COLLECTION = "admin_users";
  const matchFilter: Record<string, unknown> = { deletedAt: null };
  if (filters?.status && filters.status !== "all") matchFilter.status = filters.status;
  if (filters?.role && filters.role !== "all") matchFilter.roles = filters.role;

  const [totalUsers, activeUsers, roleDist] = await Promise.all([
    safeCount(ADMIN_USERS_COLLECTION, matchFilter),
    safeCount(ADMIN_USERS_COLLECTION, { status: "active", ...matchFilter }),
    (async () => {
      try {
        const db = await getDb();
        return db
          .collection<{ roles: string[] }>(ADMIN_USERS_COLLECTION)
          .aggregate<{ _id: string; count: number }>([
            { $match: matchFilter },
            { $unwind: "$roles" },
            { $group: { _id: "$roles", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 20 },
          ])
          .toArray();
      } catch {
        return [];
      }
    })(),
  ]);

  const inactiveUsers = totalUsers - activeUsers;
  const superAdminCount = roleDist.find((r) => r._id === "super_admin")?.count ?? 0;

  const alerts: { type: "warning" | "danger"; message: string }[] = [];
  if (inactiveUsers > 0) alerts.push({ type: "warning", message: `${inactiveUsers} user account(s) are inactive` });

  return {
    kpis: {
      totalUsers,
      activeUsers,
      inactiveUsers,
      superAdminCount,
      totalRoles: roleDist.length,
    },
    charts: {
      roleDistribution: roleDist.map((r) => ({ label: r._id, value: r.count })),
      activeVsInactive: [
        { label: "Active", value: activeUsers },
        { label: "Inactive", value: inactiveUsers },
      ],
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Products whose own dashboards are viewer-scoped (SOP, Digi Locker, AI Bots)
// ─────────────────────────────────────────────────────────────────────────────

type PanelAlert = { type: "warning" | "danger"; message: string };

/** A product helper that fails (collection not there yet, bad data) gives `null`, and the view shows zeros. */
async function soft<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    console.error("[product-analytics] a product helper failed; showing zeros:", err);
    return null;
  }
}

/** The selected period, or the last 30 days. */
function periodOf(filters?: PanelAnalyticsFilters): { $gte: Date; $lte: Date } {
  const now = new Date();
  const from = filters?.dateFrom ? new Date(filters.dateFrom) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const to = filters?.dateTo ? new Date(`${filters.dateTo.slice(0, 10)}T23:59:59.999`) : now;
  return { $gte: Number.isNaN(from.getTime()) ? new Date(0) : from, $lte: Number.isNaN(to.getTime()) ? now : to };
}

const isoDay = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/**
 * These analytics are company-wide and open only to people who see the whole
 * product (see the access rules in `nav.ts`), so the products' own viewer-scoped
 * helpers are asked as a company-wide viewer, never as the person on the page.
 */
const COMPANY_VIEWER_ID = "command-center";
const COMPANY_ROLES = ["super_admin"];

// ─────────────────────────────────────────────────────────────────────────────
// SOP Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type SopAnalytics = Awaited<ReturnType<typeof getSopAnalytics>>;

export async function getSopAnalytics(filters?: PanelAnalyticsFilters) {
  const viewer: SopViewer = {
    userId: COMPANY_VIEWER_ID,
    email: "",
    name: "",
    roles: COMPANY_ROLES,
    overrides: {},
    employeeId: null,
    hrmsDepartmentId: null,
    teamId: null,
    designationId: null,
    memberDepartmentIds: [],
    headedDepartmentIds: [],
    manageDepartmentIds: [],
    isAdmin: true,
    isManagerTier: true,
  };
  const [d, createdInPeriod] = await Promise.all([soft(() => getSopDashboard(viewer)), safeCount(SOP_COLLECTIONS.sops, { createdAt: periodOf(filters) })]);
  const k = d?.kpis;
  const ack = k?.ack ?? { assigned: 0, acknowledged: 0, pending: 0, overdue: 0, rate: null };

  const alerts: PanelAlert[] = [];
  if (ack.overdue > 0) alerts.push({ type: "danger", message: `${ack.overdue} SOP acknowledgement(s) are overdue` });
  if ((k?.overdueReviews ?? 0) > 0) alerts.push({ type: "warning", message: `${k?.overdueReviews} procedure(s) are past their review date` });
  if ((k?.expiring ?? 0) > 0) alerts.push({ type: "warning", message: `${k?.expiring} procedure(s) expire within ${d?.expiringSoonDays ?? 30} days` });

  return {
    kpis: {
      total: k?.total ?? 0,
      published: k?.published ?? 0,
      draft: k?.draft ?? 0,
      mandatory: k?.mandatory ?? 0,
      expiring: k?.expiring ?? 0,
      overdueReviews: k?.overdueReviews ?? 0,
      createdInPeriod,
      assigned: ack.assigned,
      acknowledged: ack.acknowledged,
      pendingAcknowledgements: ack.pending,
      overdueAcknowledgements: ack.overdue,
      acknowledgementRate: ack.rate ?? 0,
      departmentCoverage: k?.coverage.pct ?? 0,
    },
    charts: {
      byDepartment: (d?.byDepartment ?? []).map((x) => ({ label: x.label, value: x.value })),
      byStatus: (d?.byStatus ?? []).map((x) => ({ label: x.label, value: x.value })),
      byCategory: (d?.byCategory ?? []).map((x) => ({ label: x.label, value: x.value })),
      complianceByDepartment: (d?.compliance ?? []).map((x) => ({ label: x.label, value: x.value })),
      creationTrend: d?.creationTrend ?? [],
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DLMS (Digi Locker) Analytics — counts only, never a record's name or secret
// ─────────────────────────────────────────────────────────────────────────────

export type DlmsAnalytics = Awaited<ReturnType<typeof getDlmsAnalytics>>;

const DLMS_COLLECTION_OF: Record<DlmsRecordType, string> = {
  credential: DLMS_COLLECTIONS.credentials,
  document: DLMS_COLLECTIONS.documents,
  link: DLMS_COLLECTIONS.links,
  note: DLMS_COLLECTIONS.notes,
};

export async function getDlmsAnalytics(filters?: PanelAnalyticsFilters) {
  const ctx = { roles: COMPANY_ROLES, permissionOverrides: null };
  const viewer: DlmsViewer = { userId: COMPANY_VIEWER_ID, email: "", roles: COMPANY_ROLES, overrides: {}, ctx, seesAll: true, companyAccess: true, clientIds: [] };
  const count = async (type: DlmsRecordType, q: DlmsRecordQuery) => (await soft(() => countDlmsRecords(viewer, type, q))) ?? 0;
  const period = periodOf(filters);
  const dated = DLMS_RECORD_TYPES.filter((t) => t !== "note"); // notes have no expiry date

  const [byType, company, client, archived, expired, expiring, added] = await Promise.all([
    Promise.all(DLMS_RECORD_TYPES.map((t) => count(t, {}))),
    Promise.all(DLMS_RECORD_TYPES.map((t) => count(t, { scope: "company" }))),
    Promise.all(DLMS_RECORD_TYPES.map((t) => count(t, { scope: "client" }))),
    Promise.all(DLMS_RECORD_TYPES.map((t) => count(t, { status: "archived" }))),
    Promise.all(dated.map((t) => count(t, { expiry: "expired" }))),
    Promise.all(dated.map((t) => count(t, { expiry: "expiring" }))),
    Promise.all(DLMS_RECORD_TYPES.map((t) => safeCount(DLMS_COLLECTION_OF[t], { createdAt: period }))),
  ]);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const of = (t: DlmsRecordType) => byType[DLMS_RECORD_TYPES.indexOf(t)];

  const alerts: PanelAlert[] = [];
  if (sum(expired) > 0) alerts.push({ type: "danger", message: `${sum(expired)} vault record(s) have expired` });
  if (sum(expiring) > 0) alerts.push({ type: "warning", message: `${sum(expiring)} vault record(s) are about to expire` });

  return {
    kpis: {
      totalRecords: sum(byType),
      credentials: of("credential"),
      documents: of("document"),
      links: of("link"),
      notes: of("note"),
      companyRecords: sum(company),
      clientRecords: sum(client),
      archivedRecords: sum(archived),
      expired: sum(expired),
      expiringSoon: sum(expiring),
      addedInPeriod: sum(added),
    },
    charts: {
      byType: DLMS_RECORD_TYPES.map((t, i) => ({ label: `${DLMS_RECORD_TYPE_LABEL[t]}s`, value: byType[i] })),
      byOwnership: [
        { label: "Company vault", value: sum(company) },
        { label: "Client records", value: sum(client) },
      ],
      expiryByType: dated.map((t, i) => ({ label: `${DLMS_RECORD_TYPE_LABEL[t]}s`, expired: expired[i], expiring: expiring[i] })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OTS (Online Tests) Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type OtsAnalytics = Awaited<ReturnType<typeof getOtsAnalytics>>;

export async function getOtsAnalytics(filters?: PanelAnalyticsFilters) {
  const from = isoDay(filters?.dateFrom);
  const to = isoDay(filters?.dateTo);
  const issued = from || to ? { issuedOn: periodOf(filters) } : {};
  const [d, certificatesIssued] = await Promise.all([
    soft(() => getOtsDashboard({ from, to, status: filters?.status && filters.status !== "all" ? filters.status : undefined })),
    safeCount(OTS_COLLECTIONS.certificates, issued),
  ]);
  const a = d?.assignments;

  const alerts: PanelAlert[] = [];
  if ((a?.awaitingEvaluation ?? 0) > 0) alerts.push({ type: "warning", message: `${a?.awaitingEvaluation} submitted test(s) are waiting for evaluation` });
  if ((a?.expired ?? 0) > 0) alerts.push({ type: "warning", message: `${a?.expired} test assignment(s) expired without being taken` });

  return {
    kpis: {
      totalTests: d?.tests.total ?? 0,
      activeTests: d?.tests.active ?? 0,
      assignments: a?.total ?? 0,
      pending: a?.pending ?? 0,
      inProgress: a?.inProgress ?? 0,
      completed: a?.completed ?? 0,
      awaitingEvaluation: a?.awaitingEvaluation ?? 0,
      expired: a?.expired ?? 0,
      passed: a?.passed ?? 0,
      failed: a?.failed ?? 0,
      evaluatedAttempts: d?.performance.attempts ?? 0,
      passRate: d?.performance.passRate ?? 0,
      averageScore: d?.performance.avgPercentage ?? 0,
      candidates: d ? d.users.employees + d.users.applicants + d.users.students : 0,
      certificatesIssued,
    },
    charts: {
      assignmentStatus: (d?.charts.assignmentStatus ?? []).map((x) => ({ label: x.label, value: x.value })),
      testStatus: (d?.charts.testStatus ?? []).map((x) => ({ label: x.label, value: x.value })),
      candidateTypes: (d?.charts.byKind ?? []).map((x) => ({ label: x.label, value: x.value })),
      averageByTest: (d?.charts.byTest ?? []).map((x) => ({ label: x.label, value: x.value })),
      averageByDepartment: (d?.charts.byDepartment ?? []).map((x) => ({ label: x.label, value: x.value })),
      passFailByTest: (d?.charts.passFailByTest ?? []).map((x) => ({ label: x.label, passed: x.passed, failed: x.failed })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI Bots Analytics — the product's own usage window (last 30 days)
// ─────────────────────────────────────────────────────────────────────────────

export type AibotsAnalytics = Awaited<ReturnType<typeof getAibotsAnalytics>>;

export async function getAibotsAnalytics(_filters?: PanelAnalyticsFilters) {
  const viewer: AibotsViewer = { userId: COMPANY_VIEWER_ID, email: "", roles: COMPANY_ROLES, ctx: { roles: COMPANY_ROLES, permissionOverrides: null }, seesAll: true };
  const d = await soft(() => getAibotsDashboard(viewer));
  const runs = d?.runs30 ?? 0;
  const failed = d?.failed30 ?? 0;

  const alerts: PanelAlert[] = [];
  if (failed > 0) alerts.push({ type: "warning", message: `${failed} AI execution(s) failed in the last 30 days` });

  return {
    kpis: {
      totalBots: d?.totalBots ?? 0,
      activeBots: d?.activeBots ?? 0,
      totalChats: d?.totalChats ?? 0,
      chatsToday: d?.chatsToday ?? 0,
      executions30d: runs,
      failedExecutions30d: failed,
      failureRate30d: runs > 0 ? round2((failed / runs) * 100) : 0,
      inputTokens30d: d?.inputTokens30 ?? 0,
      outputTokens30d: d?.outputTokens30 ?? 0,
      tokens30d: (d?.inputTokens30 ?? 0) + (d?.outputTokens30 ?? 0),
      /** Estimate in USD from the per-model prices in AI Bots settings — not an invoice. */
      estimatedCostUsd30d: round2(d?.cost30 ?? 0),
    },
    charts: {
      dailyExecutions: (d?.daily ?? []).map((x) => ({ date: x.date.slice(5), count: x.runs })),
      topBots: (d?.topBots ?? []).map((b) => ({ label: b.name, value: b.runs, tokens: b.tokens, costUsd: round2(b.cost) })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMMS (Social Media) Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type SmmsAnalytics = Awaited<ReturnType<typeof getSmmsAnalytics>>;

export async function getSmmsAnalytics(filters?: PanelAnalyticsFilters) {
  const ranged = Boolean(filters?.dateFrom || filters?.dateTo);
  const period = periodOf(filters);
  // Content counts are the current state; post results cover the selected period (all time when none is picked).
  const [d, platforms] = await Promise.all([soft(() => getSmmsDashboard()), soft(() => (ranged ? postMetricsByPlatform(period.$gte, period.$lte) : postMetricsByPlatform()))]);
  const live = (counts?: Record<string, number>) => Object.entries(counts ?? {}).reduce((s, [status, n]) => (status === "archived" ? s : s + n), 0);
  const metric = (key: "impressions" | "reach" | "engagements" | "clicks") => (platforms ?? []).reduce((s, p) => s + p.metrics[key], 0);
  const failedPosts = d?.posts.failed ?? 0;

  const alerts: PanelAlert[] = [];
  if (failedPosts > 0) alerts.push({ type: "danger", message: `${failedPosts} post(s) failed to publish` });
  const unapproved = (d?.upcoming ?? []).filter((u) => !u.approved).length;
  if (unapproved > 0) alerts.push({ type: "warning", message: `${unapproved} upcoming scheduled post(s) still need approval` });

  return {
    kpis: {
      campaigns: live(d?.campaigns),
      posts: live(d?.posts),
      publishedPosts: d?.posts.published ?? 0,
      scheduledPosts: d?.posts.scheduled ?? 0,
      failedPosts,
      ads: d?.totalAds ?? 0,
      publishedVersions: (platforms ?? []).reduce((s, p) => s + p.published, 0),
      impressions: metric("impressions"),
      reach: metric("reach"),
      engagements: metric("engagements"),
      clicks: metric("clicks"),
      aiGenerations30d: d?.ai30.runs ?? 0,
      linkedAdCampaigns: d?.paid.linkedCampaigns ?? 0,
    },
    charts: {
      postsByStatus: Object.entries(d?.posts ?? {}).filter(([, n]) => n > 0).map(([status, n]) => ({ label: titleCase(status), value: n })),
      contentByPlatform: (d?.platformContent ?? []).map((p) => ({ label: SMMS_PLATFORM_META[p.platform].label, posts: p.posts, ads: p.ads })),
      engagementByPlatform: (platforms ?? []).map((p) => ({ label: SMMS_PLATFORM_META[p.platform].label, value: p.metrics.engagements })),
      platformResults: (platforms ?? []).map((p) => ({ label: SMMS_PLATFORM_META[p.platform].label, published: p.published, impressions: p.metrics.impressions, reach: p.metrics.reach, engagements: p.metrics.engagements, clicks: p.metrics.clicks })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SEO Analytics — from the product's stored crawl, keyword and Search Console data
// ─────────────────────────────────────────────────────────────────────────────

export type SeoAnalytics = Awaited<ReturnType<typeof getSeoAnalytics>>;

export async function getSeoAnalytics(_filters?: PanelAnalyticsFilters) {
  const d = await soft(() => getSeoDashboard(COMPANY_VIEWER_ID));
  const critical = d?.issues.bySeverity.critical ?? 0;

  const alerts: PanelAlert[] = [];
  if (critical > 0) alerts.push({ type: "danger", message: `${critical} critical SEO issue(s) are open` });
  if ((d?.tasks.overdue ?? 0) > 0) alerts.push({ type: "warning", message: `${d?.tasks.overdue} SEO task(s) are overdue` });
  if (d && !d.run) alerts.push({ type: "warning", message: "No site audit has completed yet — scores and page counts appear after the first crawl" });

  return {
    kpis: {
      /** `null` until a crawl has completed (there is no score to show, not a score of zero). */
      overallScore: d?.scores?.overall ?? null,
      pagesCrawled: d?.run?.pagesCrawled ?? 0,
      indexedPages: d?.indexed.value ?? 0,
      pagesNeedingOptimization: d?.needsOptimization ?? 0,
      openIssues: d?.issues.active ?? 0,
      criticalIssues: critical,
      keywordsTracked: d?.keywords.tracked ?? 0,
      keywordsRanking: d?.keywords.ranking ?? 0,
      keywordsTop10: d?.keywords.top10 ?? 0,
      backlinks: d?.backlinks.total ?? 0,
      referringDomains: d?.backlinks.referringDomains ?? 0,
      openTasks: d?.tasks.open ?? 0,
      overdueTasks: d?.tasks.overdue ?? 0,
      /** Search Console, last 28 days of stored data; `null` when Search Console isn't connected. */
      searchClicks28d: d?.search.connected ? d.search.clicks : null,
      searchImpressions28d: d?.search.connected ? d.search.impressions : null,
    },
    charts: {
      issuesBySeverity: SEO_SEVERITIES.map((s) => ({ label: SEO_SEVERITY_META[s].label, value: d?.issues.bySeverity[s] ?? 0 })),
      issuesByCategory: SEO_CATEGORIES.map((c) => ({ label: SEO_CATEGORY_LABEL[c], value: d?.issues.byCategory[c] ?? 0 })).filter((x) => x.value > 0),
      keywordPositions: SEO_RANK_BUCKETS.map((b) => ({ label: b.label, value: d?.keywords.dist[b.key] ?? 0 })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CMS (Website) Analytics — content inventory and publishing state
// ─────────────────────────────────────────────────────────────────────────────

export type CmsAnalytics = Awaited<ReturnType<typeof getCmsAnalytics>>;

export async function getCmsAnalytics(_filters?: PanelAnalyticsFilters) {
  const keys = Object.keys(CMS_RECORD_COLLECTIONS) as CmsCollectionKey[];
  const [pages, media, mediaFiles, settings, collections] = await Promise.all([
    soft(() => listCmsPages()),
    soft(() => listCmsMedia()),
    safeCount(CMS_COLLECTIONS.media),
    soft(() => getCmsSettings()),
    Promise.all(keys.map(async (key) => ({ key, rows: (await soft(() => listCmsRecords(key))) ?? [] }))),
  ]);
  const all = pages ?? [];
  const status = (s: string) => all.filter((p) => p.status === s).length;
  const pendingPages = all.filter((p) => p.hasUnpublishedChanges).length;
  const records = collections.flatMap((c) => c.rows);
  const pendingRecords = records.filter((r) => r.hasUnpublishedChanges && r.state !== "archived").length;
  // The same checks as the CMS dashboard's Site Health.
  const seoProblems = all.filter((p) => {
    if (p.status !== "published") return false;
    const seo = p.live?.seo ?? p.draft.seo ?? null;
    return cmsSeoIssues({ title: seo?.title ?? "", description: seo?.description ?? "", canonical: seo?.canonical ?? null, noindex: seo?.robots?.index === false }).length > 0;
  }).length;
  const imagesWithoutAlt = (media ?? []).filter((m) => !m.altText?.trim()).length;

  const alerts: PanelAlert[] = [];
  if (settings?.maintenanceMode.enabled) alerts.push({ type: "danger", message: "Maintenance mode is on — visitors can't see the website" });
  if (pendingPages > 0) alerts.push({ type: "warning", message: `${pendingPages} page(s) have unpublished changes` });
  if (seoProblems > 0) alerts.push({ type: "warning", message: `${seoProblems} published page(s) need SEO attention` });

  return {
    kpis: {
      totalPages: all.length,
      publishedPages: status("published"),
      draftPages: status("draft"),
      archivedPages: status("archived"),
      pagesAwaitingPublish: pendingPages,
      records: records.length,
      liveRecords: records.filter((r) => r.state === "published").length,
      recordsAwaitingPublish: pendingRecords,
      mediaFiles,
      /** Counted over the most recent 200 media files, as the CMS dashboard does. */
      imagesWithoutAlt,
      pagesNeedingSeo: seoProblems,
    },
    charts: {
      pagesByStatus: (["published", "draft", "archived"] as const).map((s) => ({ label: titleCase(s), value: status(s) })),
      pagesByArea: CMS_SITE_AREAS.map((a) => ({ label: a.label, value: all.filter((p) => cmsAreaOf(p.path) === a.key).length })).filter((a) => a.value > 0),
      recordsByCollection: collections.map((c) => ({
        label: CMS_RECORD_COLLECTIONS[c.key].label as string,
        total: c.rows.length,
        live: c.rows.filter((r) => r.state === "published").length,
        drafts: c.rows.filter((r) => r.state === "draft").length,
      })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LPMS (Legal & Documents) Analytics
// ─────────────────────────────────────────────────────────────────────────────

export type LpmsAnalytics = Awaited<ReturnType<typeof getLpmsAnalytics>>;

export async function getLpmsAnalytics(_filters?: PanelAnalyticsFilters) {
  const viewer: LpmsViewer = {
    userId: COMPANY_VIEWER_ID,
    email: "",
    roles: COMPANY_ROLES as any,
    overrides: {},
    lpmsRoles: COMPANY_ROLES as any,
    employeeId: null,
    companyId: (await currentCompanyId()) ?? "",
  };
  const d = await soft(() => getLpmsDashboard(viewer));

  const alerts: PanelAlert[] = [];
  if ((d?.kpis.pendingApprovals ?? 0) > 0)
    alerts.push({ type: "warning", message: `${d?.kpis.pendingApprovals} document(s) pending approval` });

  return {
    kpis: {
      totalDocuments: d?.kpis.totalDocuments ?? 0,
      activeDocuments: d?.kpis.activeDocuments ?? 0,
      draftDocuments: d?.kpis.draftDocuments ?? 0,
      pendingApprovals: d?.kpis.pendingApprovals ?? 0,
      aiGenerated: d?.kpis.aiGenerated ?? 0,
    },
    charts: {
      byStatus: (d?.byStatus ?? []).map((x) => ({ label: x.label, value: x.value })),
      byCategory: (d?.byCategory ?? []).map((x) => ({ label: x.label, value: x.value })),
    },
    alerts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Product-key → aggregator mapping
// ─────────────────────────────────────────────────────────────────────────────

export const PANEL_CONFIGS = {
  aibots: {
    label: "AgentOS – AgentOS Analytics",
    description: "Bots, chats, AI executions, token usage, estimated cost and failures across the AgentOS product (last 30 days).",
    href: "/agentos",
    ctaLabel: "Open AgentOS",
  },
  cms: {
    label: "CMS – Website Analytics",
    description: "Website content inventory: pages, records and media, what is published, and what is waiting to be published or needs attention.",
    href: "/sitecraft-ai",
    ctaLabel: "Open Website Product",
  },
  dlms: {
    label: "CyberVault – CyberVault Analytics",
    description: "Vault size by record type and ownership, records added, and what has expired or is about to. Counts only — never a record or a secret.",
    href: "/cybervault",
    ctaLabel: "Open CyberVault",
  },
  fms: {
    label: "CashFlow – Finance Analytics",
    description: "Ledger-backed revenue, expenses, profit, cash position, and receivables/payables across the Finance Management System.",
    href: "/cashflow-ai",
    ctaLabel: "Open Finance Product",
  },
  hrms: {
    label: "TalentOS – HR Analytics",
    description: "Headcount, hiring velocity, attrition, gender & department distribution across the Human Resource Management System.",
    href: "/talentos",
    ctaLabel: "Open HR Product",
  },
  lms: {
    label: "DealFlow – Lead Analytics",
    description: "Lead pipeline, conversion funnel, source breakdown, stale leads, and campaign performance from the Lead Management System.",
    href: "/dealflow-ai",
    ctaLabel: "Open DealFlow Product",
  },
  lpms: {
    label: "ContractFlow – Legal & Documents Analytics",
    description: "Legal agreements, policy documents, maker types, approval workflows and digital signatures.",
    href: "/contractflow-ai",
    ctaLabel: "Open Legal & Documents",
  },
  messenger: {
    label: "Messenger – Messenger Analytics",
    description: "Team communication volume, active channels, peak hours, file sharing, and member engagement.",
    href: "/huddle-ai",
    ctaLabel: "Open Messenger",
  },
  ots: {
    label: "EvalIQ – Online Tests Analytics",
    description: "Tests, assignments, completion, pass rate, average scores and certificates across the Online Test System.",
    href: "/evaliq",
    ctaLabel: "Open Online Tests",
  },
  pms: {
    label: "SprintOS – Project Analytics",
    description: "Project health, delivery status, team utilization, client portfolio, and deadline risk.",
    href: "/sprintos",
    ctaLabel: "Open Projects Product",
  },
  portal: {
    label: "Portal – Portal Analytics",
    description: "External user distribution across clients, applicants, interns, and trainees in the External Portal.",
    href: "/clientos",
    ctaLabel: "Open External Portal",
  },
  prms: {
    label: "SpendIQ – Procurement Analytics",
    description: "Procurement spend, vendor management, asset valuation, budget utilization, and operational costs.",
    href: "/spendiq",
    ctaLabel: "Open Procurement Product",
  },
  seo: {
    label: "SEO – RankMax Analytics",
    description: "Site audit score, open issues, tracked keywords and their positions, backlinks, and SEO tasks.",
    href: "/rankmax-ai",
    ctaLabel: "Open SEO Product",
  },
  smms: {
    label: "ViralPulse – Social Media Analytics",
    description: "Campaigns, posts and ads by status and platform, and the reach and engagement recorded for published posts.",
    href: "/viralpulse-ai",
    ctaLabel: "Open Social Media Product",
  },
  sop: {
    label: "Playbook – Playbook Analytics",
    description: "SOP library size and status, acknowledgement compliance, department coverage, and procedures due for review or expiring.",
    href: "/playbook-ai",
    ctaLabel: "Open Playbook Library",
  },
  tms: {
    label: "Cohort AI – Training Analytics",
    description: "Student enrollment, batch occupancy, placement rate, revenue, and certificate issuance.",
    href: "/cohort-ai",
    ctaLabel: "Open Training Product",
  },
  workspace: {
    label: "Workspace – Workspace Analytics",
    description: "Internal user accounts, role distribution, active vs inactive staff across the Staff Hub.",
    href: "/commandos",
    ctaLabel: "Open Staff Hub",
  },
} as const;

export type PanelKey = keyof typeof PANEL_CONFIGS;

export interface PanelConfigView {
  label: string;
  description: string;
  href: string;
  ctaLabel: string;
}

/**
 * `PANEL_CONFIGS` with the Product Registry applied: the product's name, route and "Open …" button come from the registry
 * (so they match every other listing), while the description stays the analytics-specific text above.
 */
export async function panelConfigs(): Promise<Record<PanelKey, PanelConfigView>> {
  const registry = new Map((await listPanels()).map((p) => [p.key, p]));
  return Object.fromEntries(
    (Object.keys(PANEL_CONFIGS) as PanelKey[]).map((k) => {
      const base = PANEL_CONFIGS[k];
      const r = registry.get(k);
      const productName = r ? whiteLabelProductName(r.name) : null;
      return [k, { label: productName ? `${productName} Analytics` : base.label, description: base.description, href: r?.route ?? base.href, ctaLabel: productName ? `Open ${productName}` : base.ctaLabel }];
    }),
  ) as Record<PanelKey, PanelConfigView>;
}

export function isPanelKey(val: unknown): val is PanelKey {
  // Own keys only: "toString" and friends are `in` every object.
  return typeof val === "string" && Object.prototype.hasOwnProperty.call(PANEL_CONFIGS, val);
}

/**
 * The first three numeric KPIs of a product's analytics, for the dashboard's Product Performance Matrix: every card
 * shows exactly three figures. Never throws — a product that can't be read just shows dashes.
 */
export async function getPanelHeadlineStats(panel: PanelKey, filters?: PanelAnalyticsFilters): Promise<{ label: string; value: number }[]> {
  const getters: Record<PanelKey, (f?: PanelAnalyticsFilters) => Promise<{ kpis?: unknown }>> = {
    aibots: getAibotsAnalytics, cms: getCmsAnalytics, dlms: getDlmsAnalytics, fms: getFmsAnalytics, hrms: getHrmsAnalytics,
    lms: getLmsAnalytics, lpms: getLpmsAnalytics, messenger: getMessengerAnalytics, ots: getOtsAnalytics, pms: getPmsAnalytics, portal: getPortalAnalytics,
    prms: getPrmsAnalytics, seo: getSeoAnalytics, smms: getSmmsAnalytics, sop: getSopAnalytics, tms: getTmsAnalytics,
    workspace: getWorkspaceAnalytics,
  };
  try {
    const data = await getters[panel](filters);
    return Object.entries((data.kpis ?? {}) as Record<string, unknown>)
      .filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
      .slice(0, 3)
      .map(([key, value]) => ({ label: key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase()), value }));
  } catch {
    return [];
  }
}
