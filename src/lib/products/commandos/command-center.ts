import "server-only";
import { getDb } from "@/lib/mongodb";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { CATEGORIES } from "@/lib/categories";
import { PORTAL_ROLES, type PortalRole } from "@/lib/portal-roles";
import { externalUsers } from "@/lib/portal-auth";
import { MEETINGS_COLLECTION } from "@/lib/products/huddle-ai/meetings";
import { getPmsDashboardStats } from "@/lib/products/sprintos/dashboard";
import { getPortfolioCosting } from "@/lib/products/sprintos/costing";
import { getPrmsDashboardStats } from "@/lib/products/spendiq/dashboard";
import { getTmsDashboardStats } from "@/lib/products/cohort-ai/dashboard";
import { getDashboardStats as getCrmDashboardStats } from "@/lib/leads";
import { getCareerDashboardStats } from "@/lib/career-applications";
import { getMessengerDashboardStats } from "@/lib/products/huddle-ai/dashboard";
import { getChatbotDashboardStats } from "@/lib/chatbot-analytics";
import { getVoiceDashboardStats } from "@/lib/voice-analytics";
import { getFmsDashboardStats } from "@/lib/products/cashflow-ai/dashboard";

/**
 * Director Command Center aggregation — Phase 1 (executive KPIs, financial
 * intelligence, module overview). Composes the existing per-module dashboard
 * aggregators (`getPmsDashboardStats`, `getTmsDashboardStats`, …) rather than
 * re-querying their collections, per the "don't duplicate data" requirement.
 *
 * Every sub-aggregator is called with no date filter, so every headline total
 * here is a lifetime figure (the same convention PMS/PRMS/TMS already use for
 * their own "total" KPI cards) and trend charts are all-time, month-bucketed.
 * A period date-range picker (matching every other module's dashboard) is a
 * fast-follow, not Phase 1.
 *
 * Two small aggregations have no existing module equivalent and are added
 * here, in the same defensive try/catch → 0 style as `src/lib/spendiq/dashboard.ts`'s
 * `sumField` helper, so an unseeded collection never breaks the page:
 *  - CRM deal-value sums/trends (leads don't have a value aggregator today)
 *  - External Portal active-user counts by role
 */

export interface LabelledValue {
  label: string;
  value: number;
}
export interface TimePoint {
  date: string;
  count: number;
}

export interface ModuleSummary {
  key: string;
  label: string;
  href?: string;
  stats: LabelledValue[];
}

export interface CommandCenterStats {
  business: {
    totalRevenue: number;
    monthlyRevenue: number;
    annualRevenue: number;
    totalTurnover: number;
    grossProfit: number;
    netProfit: number;
    profitMarginPercent: number;
    totalExpenses: number;
  };
  salesCrm: {
    totalLeads: number;
    newLeadsToday: number;
    conversionRate: number;
    activeClients: number;
    closedDeals: number;
    pipelineValue: number;
    wonValue: number;
  };
  operations: {
    activeProjects: number;
    completedProjects: number;
    overdueProjects: number;
    teamUtilization: number;
    billableHours: number;
    nonBillableHours: number;
  };
  training: {
    activeStudents: number;
    internshipStudents: number;
    industrialStudents: number;
    placementRate: number;
    trainingRevenue: number;
  };
  procurement: {
    totalProcurementSpend: number;
    infrastructureCost: number;
    saasCost: number;
    assetValue: number;
    pendingPurchaseOrders: number;
  };
  aiComms: {
    aiChatSessions: number;
    voiceAiUsage: number;
    internalMessages: number;
    activeMeetings: number;
  };
  financial: {
    revenueTrend: TimePoint[];
    expenseTrend: TimePoint[];
    profitTrend: TimePoint[];
    expenseByCategory: LabelledValue[];
  };
  /**
   * Real, ledger-backed figures from FMS (Phase 6) — deliberately separate
   * from `business`/`financial` above, which remain a PMS/TMS/CRM/PRMS-
   * derived proxy. Not merged in, since replacing those already-shipped
   * numbers can't be fully verified from here without auditing whether
   * every PRMS spend category already lands in an `fms_transaction`.
   */
  finance: {
    totalRevenue: number;
    totalExpenses: number;
    netProfit: number;
    totalCash: number;
    totalBankBalance: number;
    accountsReceivable: number;
    accountsPayable: number;
    pendingApprovals: number;
    overdueInvoices: number;
  };
  modules: ModuleSummary[];
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// New small aggregations (no existing module equivalent).
// ---------------------------------------------------------------------------

type CrmStatus = "new" | "in_progress" | "completed" | "rejected";

async function crmDealValueTotal(statuses: CrmStatus[]): Promise<number> {
  const sums = await Promise.all(
    CATEGORIES.map(async (c) => {
      try {
        const db = await getDb();
        const res = await db
          .collection(c.collection)
          .aggregate<{ total: number }>([
            { $match: { status: { $in: statuses } } },
            { $group: { _id: null, total: { $sum: { $ifNull: ["$dealValue", 0] } } } },
          ])
          .toArray();
        return res[0]?.total ?? 0;
      } catch {
        return 0;
      }
    })
  );
  return sums.reduce((a, b) => a + b, 0);
}

async function crmDealValueTimeSeries(status: CrmStatus, format: string): Promise<TimePoint[]> {
  const results = await Promise.all(
    CATEGORIES.map(async (c) => {
      try {
        const db = await getDb();
        return await db
          .collection(c.collection)
          .aggregate<{ _id: string; total: number }>([
            { $match: { status } },
            {
              $group: {
                _id: { $dateToString: { format, date: "$createdAt" } },
                total: { $sum: { $ifNull: ["$dealValue", 0] } },
              },
            },
          ])
          .toArray();
      } catch {
        return [];
      }
    })
  );
  const merged = new Map<string, number>();
  for (const rows of results) for (const r of rows) merged.set(r._id, (merged.get(r._id) ?? 0) + r.total);
  return Array.from(merged.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

async function crmLeadsCreatedSince(since: Date): Promise<number> {
  const counts = await Promise.all(
    CATEGORIES.map(async (c) => {
      try {
        const db = await getDb();
        return await db.collection(c.collection).countDocuments({ createdAt: { $gte: since } });
      } catch {
        return 0;
      }
    })
  );
  return counts.reduce((a, b) => a + b, 0);
}

async function portalUserCounts(): Promise<{ total: number; byRole: Record<PortalRole, number> }> {
  const empty = Object.fromEntries(PORTAL_ROLES.map((r) => [r, 0])) as Record<PortalRole, number>;
  try {
    const collection = await externalUsers();
    const rows = await collection
      .aggregate<{ _id: PortalRole; count: number }>([
        { $match: { status: "active" } },
        { $group: { _id: "$role", count: { $sum: 1 } } },
      ])
      .toArray();
    const byRole = { ...empty };
    for (const r of rows) byRole[r._id] = r.count;
    return { total: Object.values(byRole).reduce((a, b) => a + b, 0), byRole };
  } catch {
    return { total: 0, byRole: empty };
  }
}

async function activeMeetingsCount(): Promise<number> {
  try {
    const db = await getDb();
    return await db.collection(MEETINGS_COLLECTION).countDocuments({ status: "live", deletedAt: null });
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Time-series merge helpers — align sub-module trends that share the same
// dateFormat bucket key so they can be summed/diffed into one company-wide line.
// ---------------------------------------------------------------------------

function mergeSum(...series: TimePoint[][]): TimePoint[] {
  const merged = new Map<string, number>();
  for (const points of series) for (const p of points) merged.set(p.date, (merged.get(p.date) ?? 0) + p.count);
  return Array.from(merged.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeSubtract(minuend: TimePoint[], subtrahend: TimePoint[]): TimePoint[] {
  const sub = new Map(subtrahend.map((p) => [p.date, p.count]));
  return minuend.map((p) => ({ date: p.date, count: p.count - (sub.get(p.date) ?? 0) }));
}

// ---------------------------------------------------------------------------

export interface CommandCenterFilters {
  dateFrom?: string;
  dateTo?: string;
  granularity?: DashboardGranularity;
}

export async function getCommandCenterStats(filters: CommandCenterFilters = {}): Promise<CommandCenterStats> {
  const granularity: DashboardGranularity = filters.granularity ?? "month";
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : undefined;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : undefined;
  const format = dateFormatFor(granularity);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const last30 = dateFrom ?? new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const toDate = dateTo ?? now;

  const [
    pms,
    portfolio,
    prms,
    tms,
    crm,
    careers,
    messenger,
    chatbot,
    voice,
    fms,
    pipelineValue,
    wonValueLifetime,
    newLeadsToday,
    portal,
    activeMeetings,
    wonValueTrend,
  ] = await Promise.all([
    getPmsDashboardStats({ granularity, dateFrom, dateTo }),
    getPortfolioCosting(),
    getPrmsDashboardStats({ granularity, dateFrom, dateTo }),
    getTmsDashboardStats({ granularity, dateFrom, dateTo }),
    getCrmDashboardStats({ granularity, dateFrom, dateTo }),
    getCareerDashboardStats({ granularity, dateFrom, dateTo }),
    getMessengerDashboardStats({ from: last30, to: toDate, viewerId: "command-center" }),
    getChatbotDashboardStats({ granularity, dateFrom, dateTo }),
    getVoiceDashboardStats({ granularity, dateFrom, dateTo }),
    getFmsDashboardStats({ granularity, dateFrom, dateTo }),
    crmDealValueTotal(["new", "in_progress"]),
    crmDealValueTotal(["completed"]),
    crmLeadsCreatedSince(startOfToday),
    portalUserCounts(),
    activeMeetingsCount(),
    crmDealValueTimeSeries("completed", format),
  ]);

  const currentMonthKey = monthStart.toISOString().slice(0, 7); // "YYYY-MM"
  const wonThisMonth = wonValueTrend.find((p) => p.date === currentMonthKey)?.count ?? 0;

  const totalRevenue = portfolio.totalContractValue + tms.totalRevenue + wonValueLifetime;
  const tmsRevenueThisMonth = tms.revenueTrend.find((p) => p.date === currentMonthKey)?.count ?? 0;
  const monthlyRevenue = tmsRevenueThisMonth + wonThisMonth;
  const annualRevenueFromTms = tms.revenueTrend
    .filter((p) => p.date >= yearStart.toISOString().slice(0, 7))
    .reduce((s, p) => s + p.count, 0);
  const annualRevenueFromCrm = wonValueTrend
    .filter((p) => p.date >= yearStart.toISOString().slice(0, 7))
    .reduce((s, p) => s + p.count, 0);
  const annualRevenue = annualRevenueFromTms + annualRevenueFromCrm;

  const costOfDelivery = portfolio.totalActualCost;
  const operatingExpenses = prms.totalProcurementSpend;
  const totalExpenses = costOfDelivery + operatingExpenses;
  const grossProfit = totalRevenue - costOfDelivery;
  const netProfit = grossProfit - operatingExpenses;
  const profitMarginPercent = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

  const saasCost = prms.saasSubscriptionCost.reduce((s, r) => s + r.value, 0);

  const revenueTrend = mergeSum(tms.revenueTrend, wonValueTrend);
  const expenseTrend = prms.monthlyExpenseTrend;
  const profitTrend = mergeSubtract(revenueTrend, expenseTrend);

  const modules: ModuleSummary[] = [
    {
      key: "crm",
      label: "CRM / Lead Management",
      href: "/dealflow-ai",
      stats: [
        { label: "Total Leads", value: crm.totalOverall },
        { label: "Completed", value: crm.byStatus.completed ?? 0 },
        { label: "Pipeline Value", value: pipelineValue },
      ],
    },
    {
      key: "pms",
      label: "Project Management",
      href: "/sprintos",
      stats: [
        { label: "Active Projects", value: pms.activeProjects },
        { label: "Completed", value: pms.completedProjects },
        { label: "Clients", value: pms.totalClients },
      ],
    },
    {
      key: "tms",
      label: "Training Management",
      href: "/cohort-ai",
      stats: [
        { label: "Active Students", value: tms.totalStudents },
        { label: "Placement Rate", value: tms.placementSuccessRate },
        { label: "Revenue", value: tms.totalRevenue },
      ],
    },
    {
      key: "prms",
      label: "Procurement",
      href: "/spendiq",
      stats: [
        { label: "Active Vendors", value: prms.activeVendors },
        { label: "Pending PRs", value: prms.pendingPurchaseRequests },
        { label: "Total Spend", value: prms.totalProcurementSpend },
      ],
    },
    {
      key: "careers",
      label: "Careers / Hiring",
      href: "/dealflow-ai/careers",
      stats: [
        { label: "Applications", value: careers.total },
        { label: "Hired", value: careers.byStatus.hired ?? 0 },
        { label: "Conversion", value: careers.hiringConversionRate },
      ],
    },
    {
      key: "portal",
      label: "External Portal",
      stats: [
        { label: "Active Users", value: portal.total },
        { label: "Clients", value: portal.byRole.client },
        { label: "Applicants", value: portal.byRole.job_applicant },
      ],
    },
    {
      key: "fms",
      label: "Finance",
      href: "/cashflow-ai",
      stats: [
        { label: "Cash + Bank", value: fms.totalCash + fms.totalBankBalance },
        { label: "Net Profit", value: fms.netProfit },
        { label: "Pending Approvals", value: fms.pendingApprovals },
      ],
    },
  ];

  return {
    business: {
      totalRevenue,
      monthlyRevenue,
      annualRevenue,
      totalTurnover: totalRevenue,
      grossProfit,
      netProfit,
      profitMarginPercent,
      totalExpenses,
    },
    salesCrm: {
      totalLeads: crm.totalOverall,
      newLeadsToday,
      conversionRate: crm.totalOverall > 0 ? Math.round(((crm.byStatus.completed ?? 0) / crm.totalOverall) * 1000) / 10 : 0,
      activeClients: pms.totalClients,
      closedDeals: crm.byStatus.completed ?? 0,
      pipelineValue,
      wonValue: wonValueLifetime,
    },
    operations: {
      activeProjects: pms.activeProjects,
      completedProjects: pms.completedProjects,
      overdueProjects: pms.overdueProjects,
      teamUtilization: pms.teamUtilization,
      billableHours: portfolio.totalBillableHours,
      nonBillableHours: portfolio.totalNonBillableHours,
    },
    training: {
      activeStudents: tms.totalStudents,
      internshipStudents: tms.internshipStudents,
      industrialStudents: tms.industrialStudents,
      placementRate: tms.placementSuccessRate,
      trainingRevenue: tms.totalRevenue,
    },
    procurement: {
      totalProcurementSpend: prms.totalProcurementSpend,
      infrastructureCost: prms.infrastructureCost,
      saasCost,
      assetValue: prms.totalAssetsValue,
      pendingPurchaseOrders: prms.pendingPurchaseRequests,
    },
    aiComms: {
      aiChatSessions: chatbot.totalSessions,
      voiceAiUsage: voice.totalConversations,
      internalMessages: messenger.kpis.messagesSentToday,
      activeMeetings,
    },
    financial: {
      revenueTrend,
      expenseTrend,
      profitTrend,
      expenseByCategory: prms.categoryExpenses,
    },
    finance: {
      totalRevenue: fms.totalRevenue,
      totalExpenses: fms.totalExpenses,
      netProfit: fms.netProfit,
      totalCash: fms.totalCash,
      totalBankBalance: fms.totalBankBalance,
      accountsReceivable: fms.accountsReceivable,
      accountsPayable: fms.accountsPayable,
      pendingApprovals: fms.pendingApprovals,
      overdueInvoices: fms.overdueInvoices,
    },
    modules,
    generatedAt: now.toISOString(),
  };
}
