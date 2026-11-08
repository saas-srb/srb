import "server-only";
import { getDb } from "@/lib/mongodb";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { previousPeriodRange, computeGrowthPercent } from "@/lib/period-comparison";
import { PENDING_REQUISITION_STATUSES, getExpenseCategoryLabel } from "@/lib/products/spendiq/constants";

/**
 * PRMS executive dashboard analytics. Aggregation-only, same shape/style as
 * `getTmsDashboardStats` in `src/lib/cohort-ai/dashboard.ts`. Collections that later
 * phases introduce (expenses, purchase orders, assets, invoices, budgets…)
 * simply return zero / empty until they exist — querying a missing collection
 * is a no-op in Mongo.
 */

const VENDORS_COLLECTION = "prms_vendors";
const REQUISITIONS_COLLECTION = "prms_requisitions";
const PURCHASE_ORDERS_COLLECTION = "prms_purchase_orders";
const EXPENSES_COLLECTION = "prms_expenses";
const ASSETS_COLLECTION = "prms_assets";
const SUBSCRIPTIONS_COLLECTION = "prms_software_subscriptions";
const INFRASTRUCTURE_COLLECTION = "prms_infrastructure";
const INVOICES_COLLECTION = "prms_invoices";
const BUDGETS_COLLECTION = "prms_budgets";

export interface PrmsDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
  departmentId?: string;
  projectId?: string;
  vendorId?: string;
  category?: string;
  paymentStatus?: string;
  expenseType?: string;
}

export interface LabelledValue {
  label: string;
  value: number;
}
export interface TimePoint {
  date: string;
  count: number;
}

export interface PrmsDashboardStats {
  // KPI cards
  totalProcurementSpend: number;
  monthlyExpenses: number;
  approvedBudget: number;
  remainingBudget: number;
  totalAssetsValue: number;
  activeVendors: number;
  activeSubscriptions: number;
  infrastructureCost: number;
  pendingPurchaseRequests: number;
  pendingInvoicePayments: number;
  totalOfficeAssets: number;
  annualOperationalCost: number;
  /** Spend in the selected range + growth vs the previous period. */
  periodSpend: number;
  periodSpendGrowth: number | null;

  // Charts
  monthlyExpenseTrend: TimePoint[];
  budgetVsActual: { label: string; budget: number; actual: number }[];
  departmentExpenses: LabelledValue[];
  categoryExpenses: LabelledValue[];
  vendorSpend: LabelledValue[];
  infrastructureCostTrend: TimePoint[];
  saasSubscriptionCost: LabelledValue[];
  assetAcquisitionTrend: TimePoint[];
  topExpenseCategories: LabelledValue[];
  cashOutflowTimeline: TimePoint[];
}

type Doc = { _id: string } & Record<string, unknown>;

function rangeMatch(field: string, from?: Date, to?: Date): Record<string, unknown> {
  if (!from && !to) return {};
  const r: Record<string, Date> = {};
  if (from) r.$gte = from;
  if (to) r.$lte = to;
  return { [field]: r };
}

async function sumField(
  collection: string,
  field: string,
  match: Record<string, unknown>
): Promise<number> {
  try {
    const db = await getDb();
    const res = await db
      .collection<Doc>(collection)
      .aggregate<{ total: number }>([
        { $match: { deletedAt: null, ...match } },
        { $group: { _id: null, total: { $sum: `$${field}` } } },
      ])
      .toArray();
    return res[0]?.total ?? 0;
  } catch {
    return 0;
  }
}

async function countDocs(collection: string, match: Record<string, unknown>): Promise<number> {
  try {
    const db = await getDb();
    return db.collection<Doc>(collection).countDocuments({ deletedAt: null, ...match });
  } catch {
    return 0;
  }
}

async function timeSeries(
  collection: string,
  dateField: string,
  format: string,
  match: Record<string, unknown>,
  valueField?: string
): Promise<TimePoint[]> {
  try {
    const db = await getDb();
    const rows = await db
      .collection<Doc>(collection)
      .aggregate<{ _id: string; count: number }>([
        { $match: { deletedAt: null, ...match } },
        {
          $group: {
            _id: { $dateToString: { format, date: `$${dateField}` } },
            count: valueField ? { $sum: `$${valueField}` } : { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    return rows.map((r) => ({ date: r._id, count: r.count }));
  } catch {
    return [];
  }
}

async function groupSum(
  collection: string,
  groupField: string,
  valueField: string,
  match: Record<string, unknown>,
  limit = 10
): Promise<LabelledValue[]> {
  try {
    const db = await getDb();
    const rows = await db
      .collection<Doc>(collection)
      .aggregate<{ _id: string; value: number }>([
        { $match: { deletedAt: null, ...match } },
        { $group: { _id: `$${groupField}`, value: { $sum: `$${valueField}` } } },
        { $sort: { value: -1 } },
        { $limit: limit },
      ])
      .toArray();
    return rows.map((r) => ({ label: r._id ?? "—", value: r.value }));
  } catch {
    return [];
  }
}

export async function getPrmsDashboardStats(
  filters: PrmsDashboardFilters = {}
): Promise<PrmsDashboardStats> {
  const granularity = filters.granularity ?? "month";
  const format = dateFormatFor(granularity);
  const { dateFrom, dateTo } = filters;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  const expenseScope: Record<string, unknown> = {};
  if (filters.departmentId) expenseScope.departmentId = filters.departmentId;
  if (filters.projectId) expenseScope.projectId = filters.projectId;
  if (filters.vendorId) expenseScope.vendorId = filters.vendorId;
  if (filters.category) expenseScope.category = filters.category;
  if (filters.paymentStatus) expenseScope.approvalStatus = filters.paymentStatus;
  if (filters.expenseType) expenseScope.expenseType = filters.expenseType;

  const rangeExpense = { ...expenseScope, ...rangeMatch("expenseDate", dateFrom, dateTo) };
  const prev = previousPeriodRange(dateFrom, dateTo);

  const [
    activeVendors,
    pendingPurchaseRequests,
    poSpend,
    expenseSpendAll,
    monthlyExpenses,
    periodSpend,
    prevPeriodSpend,
    totalAssetsValue,
    totalOfficeAssets,
    activeSubscriptions,
    saasMonthly,
    infraMonthly,
    pendingInvoiceCount,
    approvedBudget,
    budgetConsumed,
    monthlyExpenseTrend,
    infrastructureCostTrend,
    assetAcquisitionTrend,
    cashOutflowTimeline,
    departmentExpenses,
    categoryExpensesRaw,
    vendorSpend,
    saasSubscriptionCost,
  ] = await Promise.all([
    countDocs(VENDORS_COLLECTION, { status: "active" }),
    countDocs(REQUISITIONS_COLLECTION, { status: { $in: PENDING_REQUISITION_STATUSES } }),
    sumField(PURCHASE_ORDERS_COLLECTION, "totalAmount", {}),
    sumField(EXPENSES_COLLECTION, "amount", expenseScope),
    sumField(EXPENSES_COLLECTION, "amount", { ...expenseScope, expenseDate: { $gte: monthStart } }),
    sumField(EXPENSES_COLLECTION, "amount", rangeExpense),
    prev
      ? sumField(EXPENSES_COLLECTION, "amount", {
          ...expenseScope,
          expenseDate: { $gte: prev.from, $lte: prev.to },
        })
      : Promise.resolve(0),
    sumField(ASSETS_COLLECTION, "currentValue", {}),
    countDocs(ASSETS_COLLECTION, {}),
    countDocs(SUBSCRIPTIONS_COLLECTION, { status: "active" }),
    sumField(SUBSCRIPTIONS_COLLECTION, "monthlyCost", { status: "active" }),
    sumField(INFRASTRUCTURE_COLLECTION, "monthlyCost", { status: "active" }),
    countDocs(INVOICES_COLLECTION, { status: { $in: ["pending", "approved", "overdue"] } }),
    sumField(BUDGETS_COLLECTION, "allocatedAmount", { periodStart: { $gte: yearStart } }),
    sumField(BUDGETS_COLLECTION, "consumedAmount", { periodStart: { $gte: yearStart } }),
    timeSeries(EXPENSES_COLLECTION, "expenseDate", format, rangeExpense, "amount"),
    timeSeries(INFRASTRUCTURE_COLLECTION, "createdAt", format, {}, "monthlyCost"),
    timeSeries(ASSETS_COLLECTION, "purchaseDate", format, rangeMatch("purchaseDate", dateFrom, dateTo)),
    timeSeries("prms_payments", "paymentDate", format, rangeMatch("paymentDate", dateFrom, dateTo), "amount"),
    groupSum(EXPENSES_COLLECTION, "departmentName", "amount", rangeExpense),
    groupSum(EXPENSES_COLLECTION, "category", "amount", rangeExpense),
    groupSum(EXPENSES_COLLECTION, "vendorName", "amount", rangeExpense),
    groupSum(SUBSCRIPTIONS_COLLECTION, "serviceName", "monthlyCost", { status: "active" }),
  ]);

  const totalProcurementSpend = poSpend + expenseSpendAll;
  const infrastructureCost = infraMonthly;
  const annualOperationalCost = (saasMonthly + infraMonthly) * 12 + expenseSpendAll;

  const categoryExpenses = categoryExpensesRaw.map((c) => ({
    label: getExpenseCategoryLabel(c.label),
    value: c.value,
  }));

  return {
    totalProcurementSpend,
    monthlyExpenses,
    approvedBudget,
    remainingBudget: Math.max(approvedBudget - budgetConsumed, 0),
    totalAssetsValue,
    activeVendors,
    activeSubscriptions,
    infrastructureCost,
    pendingPurchaseRequests,
    pendingInvoicePayments: pendingInvoiceCount,
    totalOfficeAssets,
    annualOperationalCost,
    periodSpend,
    periodSpendGrowth: computeGrowthPercent(periodSpend, prev ? prevPeriodSpend : null),

    monthlyExpenseTrend,
    budgetVsActual: approvedBudget
      ? [{ label: "This Year", budget: approvedBudget, actual: budgetConsumed }]
      : [],
    departmentExpenses,
    categoryExpenses,
    vendorSpend,
    infrastructureCostTrend,
    saasSubscriptionCost,
    assetAcquisitionTrend,
    topExpenseCategories: [...categoryExpenses].sort((a, b) => b.value - a.value).slice(0, 10),
    cashOutflowTimeline,
  };
}
