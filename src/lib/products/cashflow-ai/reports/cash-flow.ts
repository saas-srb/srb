import "server-only";
import { getDb } from "@/lib/mongodb";
import { round2 } from "@/lib/products/cashflow-ai/constants";

/**
 * Cash Flow (§30 — Phase 5), direct method: opening balance + cash-in
 * (settled income transactions with a real `fundAccountId`) − cash-out
 * (settled expense, same condition) = closing balance. Intentionally simple
 * — no operating/investing/financing categorization, which would need
 * per-transaction activity tagging this phase doesn't add. Computed from
 * `fms_transactions` history (not accounts' live `currentBalance`, which
 * only reflects "now") so any date range is consistent.
 */

const TRANSACTIONS_COLLECTION = "fms_transactions";
const SETTLED_STATUSES = ["completed", "reconciled"];

interface Doc {
  _id: string;
}

async function fundMovementSum(match: Record<string, unknown>): Promise<{ income: number; expense: number }> {
  try {
    const db = await getDb();
    const rows = await db
      .collection<Doc>(TRANSACTIONS_COLLECTION)
      .aggregate<{ _id: string; total: number }>([
        {
          $match: {
            deletedAt: null,
            fundAccountId: { $ne: null },
            status: { $in: SETTLED_STATUSES },
            type: { $in: ["income", "expense"] },
            ...match,
          },
        },
        { $group: { _id: "$type", total: { $sum: "$amount" } } },
      ])
      .toArray();
    return {
      income: round2(rows.find((r) => r._id === "income")?.total ?? 0),
      expense: round2(rows.find((r) => r._id === "expense")?.total ?? 0),
    };
  } catch {
    return { income: 0, expense: 0 };
  }
}

export interface CashFlowResult {
  dateFrom: string;
  dateTo: string;
  openingBalance: number;
  cashIn: number;
  cashOut: number;
  netCashFlow: number;
  closingBalance: number;
}

export async function getCashFlow(dateFrom: Date, dateTo: Date): Promise<CashFlowResult> {
  const [before, within] = await Promise.all([
    fundMovementSum({ transactionDate: { $lt: dateFrom } }),
    fundMovementSum({ transactionDate: { $gte: dateFrom, $lte: dateTo } }),
  ]);
  const openingBalance = round2(before.income - before.expense);
  const cashIn = within.income;
  const cashOut = within.expense;
  const netCashFlow = round2(cashIn - cashOut);
  const closingBalance = round2(openingBalance + netCashFlow);

  return {
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString(),
    openingBalance,
    cashIn,
    cashOut,
    netCashFlow,
    closingBalance,
  };
}
