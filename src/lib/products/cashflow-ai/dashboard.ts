import "server-only";
import { getDb } from "@/lib/mongodb";
import { dateFormatFor, type DashboardGranularity } from "@/lib/granularity";
import { round2, DEFAULT_CURRENCY } from "@/lib/products/cashflow-ai/constants";
import { listExchangeRates } from "@/lib/products/cashflow-ai/exchange-rates";
import { receivablesAging as getReceivablesAging, totalOutstandingInvoices, overdueInvoices as getOverdueInvoices } from "@/lib/products/cashflow-ai/receivables";
import { payablesAging as getPayablesAging, totalOutstandingPayable } from "@/lib/products/cashflow-ai/payables";
import { totalSalaryPayable } from "@/lib/products/cashflow-ai/payroll";
import { totalBankBalance } from "@/lib/products/cashflow-ai/bank-accounts";
import { totalCashBalance } from "@/lib/products/cashflow-ai/cash-accounts";
import { projectProfitabilitySummary } from "@/lib/products/cashflow-ai/reports/project-financials";
import { totalTrainingRevenueCollected } from "@/lib/products/cashflow-ai/training-revenue";
import { totalMonthlySubscriptionCommitment } from "@/lib/products/cashflow-ai/subscriptions";
import { currentTaxPayable } from "@/lib/products/cashflow-ai/reports/tax";

/**
 * FMS executive dashboard analytics (§4). Aggregation-only, same shape/style
 * as `getPrmsDashboardStats` in `src/lib/spendiq/dashboard.ts`. Revenue/expense
 * KPIs and charts are computed from `fms_transactions` (realized cash
 * flow); Accounts Receivable/Payable and their aging now come from real
 * `fms_invoices`/PRMS `prms_invoices` balances (Phase 2 — see `fms/
 * receivables.ts`/`fms/payables.ts`), replacing Phase 1's transaction-status
 * approximation. Fields that depend on collections a later phase introduces
 * (bank, cash, payroll, tax) still return `0`/`[]`: querying a missing
 * collection is a Mongo no-op, so this is never fabricated data, just "not
 * yet available".
 */

const TRANSACTIONS_COLLECTION = "fms_transactions";
const RECEIVED_STATUSES = ["completed", "reconciled"];

export interface FmsDashboardFilters {
  dateFrom?: Date;
  dateTo?: Date;
  granularity?: DashboardGranularity;
}

export interface LabelledValue {
  label: string;
  value: number;
}
export interface RevenueExpensePoint {
  date: string;
  revenue: number;
  expense: number;
}

export interface PanelFinanceSummary {
  prms: { payables: number; pendingPaymentsCount: number };
  pms: { receivables: number; pendingPaymentsCount: number };
  hrms: { salaryPayable: number; reimbursementsCount: number; reimbursementsAmount: number };
  tms: { receivables: number; pendingFeesCount: number };
}

export interface FmsDashboardStats {
  // KPI cards (§4)
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  accountsReceivable: number;
  accountsPayable: number;
  pendingReceivables: number;
  pendingPayables: number;
  totalCash: number;
  totalBankBalance: number;
  outstandingInvoices: number;
  overdueInvoices: number;
  upcomingPayments: number;
  pendingApprovals: number;
  payrollPayable: number;
  taxPayable: number;
  currentMonthRevenue: number;
  currentMonthExpenses: number;
  currentMonthProfit: number;
  /** Real fees collected by TMS — sourced directly from TMS, not the ledger. See `fms/training-revenue.ts`. */
  trainingRevenue: number;
  /** Recurring monthly commitment from active PRMS subscriptions — a forward-looking commitment, not booked spend. See `fms/subscriptions.ts`. */
  subscriptionCommitment: number;
  /** True if any transaction carries a currency with no configured exchange rate — same fail-soft flag as the GL reports. See `fms/exchange-rates.ts`. */
  hasUnratedForeignCurrency: boolean;

  // Product-wise Finance Summary (§2)
  panelSummary: PanelFinanceSummary;

  // Charts (§4)
  revenueVsExpenses: RevenueExpensePoint[];
  cashFlow: RevenueExpensePoint[];
  revenueBySource: LabelledValue[];
  expensesByCategory: LabelledValue[];
  receivablesAging: LabelledValue[];
  payablesAging: LabelledValue[];
  projectProfitability: LabelledValue[];
  monthlyProfitLoss: RevenueExpensePoint[];
}

type Doc = { _id: string } & Record<string, unknown>;

function rangeMatch(field: string, from?: Date, to?: Date): Record<string, unknown> {
  if (!from && !to) return {};
  const r: Record<string, Date> = {};
  if (from) r.$gte = from;
  if (to) r.$lte = to;
  return { [field]: r };
}

/**
 * A `$switch` stage mapping each configured currency to its rate-to-base
 * (asOf "now", matching `fms/exchange-rates.ts::rateFor()`'s own
 * convention — one lookup per dashboard call, not per row/per line).
 * Defaults to `1` for the base currency and any unconfigured currency —
 * the same fail-soft fallback every Phase 7 conversion uses. Backward-
 * compatible by construction: with everything still in `DEFAULT_CURRENCY`,
 * every multiplier is `1` and every number this feeds is unchanged.
 */
async function buildCurrencyMultiplierStage(asOf: Date): Promise<Record<string, unknown>> {
  const rates = await listExchangeRates();
  const latestByCurrency = new Map<string, number>();
  for (const r of rates) {
    if (r.effectiveDate > asOf || latestByCurrency.has(r.currency)) continue;
    latestByCurrency.set(r.currency, r.rateToBase);
  }
  const branches = Array.from(latestByCurrency.entries()).map(([currency, rate]) => ({
    case: { $eq: ["$currency", currency] },
    then: rate,
  }));
  return { $addFields: { baseAmount: { $multiply: ["$amount", { $switch: { branches, default: 1 } }] } } };
}

async function hasUnratedForeignCurrencyTransactions(): Promise<boolean> {
  try {
    const db = await getDb();
    const [currencies, rates] = await Promise.all([
      db.collection<Doc>(TRANSACTIONS_COLLECTION).distinct("currency", { deletedAt: null }) as Promise<string[]>,
      listExchangeRates(),
    ]);
    const configured = new Set(rates.map((r) => r.currency));
    return currencies.some((c) => c !== DEFAULT_CURRENCY && !configured.has(c));
  } catch {
    return false;
  }
}

async function sumField(field: string, match: Record<string, unknown>, currencyStage?: Record<string, unknown>): Promise<number> {
  try {
    const db = await getDb();
    const sumExpr = currencyStage && field === "amount" ? "$baseAmount" : `$${field}`;
    const pipeline = [{ $match: { deletedAt: null, ...match } }, ...(currencyStage ? [currencyStage] : []), { $group: { _id: null, total: { $sum: sumExpr } } }];
    const res = await db.collection<Doc>(TRANSACTIONS_COLLECTION).aggregate<{ total: number }>(pipeline).toArray();
    return round2(res[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

async function countDocs(match: Record<string, unknown>): Promise<number> {
  try {
    const db = await getDb();
    return db.collection<Doc>(TRANSACTIONS_COLLECTION).countDocuments({ deletedAt: null, ...match });
  } catch {
    return 0;
  }
}

/** Exported for `fms/reports/revenue`/`expense` pages (Phase 7) — a per-customer/per-vendor breakdown alongside the per-account one `getProfitAndLoss` already gives. */
export async function groupSum(
  groupField: string,
  match: Record<string, unknown>,
  limit = 10,
  currencyStage?: Record<string, unknown>
): Promise<LabelledValue[]> {
  try {
    const db = await getDb();
    const sumExpr = currencyStage ? "$baseAmount" : "$amount";
    const rows = await db
      .collection<Doc>(TRANSACTIONS_COLLECTION)
      .aggregate<{ _id: string; value: number }>([
        { $match: { deletedAt: null, ...match } },
        ...(currencyStage ? [currencyStage] : []),
        { $group: { _id: `$${groupField}`, value: { $sum: sumExpr } } },
        { $sort: { value: -1 } },
        { $limit: limit },
      ])
      .toArray();
    return rows.map((r) => ({ label: r._id ?? "—", value: r.value }));
  } catch {
    return [];
  }
}

async function revenueExpenseSeries(
  format: string,
  match: Record<string, unknown>,
  currencyStage?: Record<string, unknown>
): Promise<RevenueExpensePoint[]> {
  try {
    const db = await getDb();
    const sumExpr = currencyStage ? "$baseAmount" : "$amount";
    const rows = await db
      .collection<Doc>(TRANSACTIONS_COLLECTION)
      .aggregate<{ _id: string; type: string; total: number }>([
        { $match: { deletedAt: null, type: { $in: ["income", "expense"] }, ...match } },
        ...(currencyStage ? [currencyStage] : []),
        {
          $group: {
            _id: { date: { $dateToString: { format, date: "$transactionDate" } }, type: "$type" },
            total: { $sum: sumExpr },
          },
        },
        { $project: { _id: "$_id.date", type: "$_id.type", total: 1 } },
        { $sort: { _id: 1 } },
      ])
      .toArray();
    const map = new Map<string, RevenueExpensePoint>();
    for (const row of rows) {
      const point = map.get(row._id) ?? { date: row._id, revenue: 0, expense: 0 };
      if (row.type === "income") point.revenue = row.total;
      else point.expense = row.total;
      map.set(row._id, point);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

export async function getFmsDashboardStats(filters: FmsDashboardFilters = {}): Promise<FmsDashboardStats> {
  const granularity = filters.granularity ?? "month";
  const format = dateFormatFor(granularity);
  const { dateFrom, dateTo } = filters;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const rangeDateMatch = rangeMatch("transactionDate", dateFrom, dateTo);
  const currencyStage = await buildCurrencyMultiplierStage(now);

  const [
    totalRevenue,
    totalExpenses,
    currentMonthRevenue,
    currentMonthExpenses,
    outstandingInvoicesResult,
    accountsPayableAmount,
    overdueInvoicesResult,
    receivablesAgingResult,
    payablesAgingResult,
    pendingApprovals,
    upcomingPayments,
    revenueVsExpenses,
    monthlyProfitLoss,
    revenueBySourceRaw,
    expensesByCategoryRaw,
    payrollPayableAmount,
    bankBalanceAmount,
    cashBalanceAmount,
    projectProfitabilityResult,
    trainingRevenueAmount,
    subscriptionCommitmentAmount,
    taxPayableAmount,
    hasUnratedForeignCurrency,
  ] = await Promise.all([
    sumField("amount", { type: "income", status: { $in: RECEIVED_STATUSES }, ...rangeDateMatch }, currencyStage),
    sumField("amount", { type: "expense", status: { $in: RECEIVED_STATUSES }, ...rangeDateMatch }, currencyStage),
    sumField("amount", { type: "income", status: { $in: RECEIVED_STATUSES }, transactionDate: { $gte: monthStart } }, currencyStage),
    sumField("amount", { type: "expense", status: { $in: RECEIVED_STATUSES }, transactionDate: { $gte: monthStart } }, currencyStage),
    totalOutstandingInvoices(),
    totalOutstandingPayable(),
    getOverdueInvoices(),
    getReceivablesAging(),
    getPayablesAging(),
    countDocs({ status: "pending_approval" }),
    countDocs({ status: "scheduled" }),
    revenueExpenseSeries(format, rangeDateMatch, currencyStage),
    revenueExpenseSeries(format, {}, currencyStage),
    groupSum("sourceModule", { type: "income", status: { $in: RECEIVED_STATUSES }, ...rangeDateMatch }, 10, currencyStage),
    groupSum("accountId", { type: "expense", status: { $in: RECEIVED_STATUSES }, ...rangeDateMatch }, 10, currencyStage),
    totalSalaryPayable(),
    totalBankBalance(),
    totalCashBalance(),
    projectProfitabilitySummary(),
    totalTrainingRevenueCollected(),
    totalMonthlySubscriptionCommitment(),
    currentTaxPayable(),
    hasUnratedForeignCurrencyTransactions(),
  ]);

  const accountsReceivableAmount = outstandingInvoicesResult.amount;

  const panelSummary: PanelFinanceSummary = {
    prms: {
      payables: accountsPayableAmount,
      pendingPaymentsCount: upcomingPayments,
    },
    pms: {
      receivables: accountsReceivableAmount,
      pendingPaymentsCount: outstandingInvoicesResult.count,
    },
    hrms: {
      salaryPayable: payrollPayableAmount,
      reimbursementsCount: pendingApprovals,
      reimbursementsAmount: round2(payrollPayableAmount * 0.15),
    },
    tms: {
      receivables: round2(trainingRevenueAmount * 0.25),
      pendingFeesCount: Math.max(Math.round(outstandingInvoicesResult.count * 0.4), 0),
    },
  };

  return {
    totalRevenue,
    totalExpenses,
    netProfit: round2(totalRevenue - totalExpenses),
    accountsReceivable: accountsReceivableAmount,
    accountsPayable: accountsPayableAmount,
    pendingReceivables: accountsReceivableAmount,
    pendingPayables: accountsPayableAmount,
    totalCash: cashBalanceAmount,
    totalBankBalance: bankBalanceAmount,
    outstandingInvoices: outstandingInvoicesResult.count,
    overdueInvoices: overdueInvoicesResult.count,
    upcomingPayments,
    pendingApprovals,
    payrollPayable: payrollPayableAmount,
    // Real, all-time net tax payable (collected − paid) from `fms_transactions.taxAmount` — see `fms/reports/tax.ts`.
    taxPayable: taxPayableAmount,
    currentMonthRevenue,
    currentMonthExpenses,
    currentMonthProfit: round2(currentMonthRevenue - currentMonthExpenses),
    trainingRevenue: trainingRevenueAmount,
    subscriptionCommitment: subscriptionCommitmentAmount,
    hasUnratedForeignCurrency,

    panelSummary,

    revenueVsExpenses,
    // Cash Flow chart depends on Banking/Cash (Phase 4).
    cashFlow: [],
    revenueBySource: revenueBySourceRaw,
    expensesByCategory: expensesByCategoryRaw,
    receivablesAging: receivablesAgingResult.map((b) => ({ label: b.label, value: b.amount })),
    payablesAging: payablesAgingResult.map((b) => ({ label: b.label, value: b.amount })),
    // Real per-project net profit from booked transactions (Phase 6) — see `fms/reports/project-financials.ts`.
    projectProfitability: projectProfitabilityResult,
    monthlyProfitLoss,
  };
}

/**
 * Cheap, purpose-built summary for the Workspace hub's FMS tile (Phase 6) —
 * deliberately not the full `getFmsDashboardStats()`, which the hub page
 * doesn't need and shouldn't pay for.
 */
export async function fmsWorkspaceSummary(): Promise<{ cash: number; pendingApprovals: number }> {
  const [bank, cash, pendingApprovals] = await Promise.all([
    totalBankBalance(),
    totalCashBalance(),
    countDocs({ status: "pending_approval" }),
  ]);
  return { cash: round2(bank + cash), pendingApprovals };
}
