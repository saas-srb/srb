import "server-only";
import { getDb } from "@/lib/mongodb";
import { searchBudgets, type Budget } from "@/lib/products/spendiq/budgets";
import { round2 } from "@/lib/products/cashflow-ai/constants";

/**
 * Budget vs Actual (§51 Phase 7) — wraps PRMS's real `prms_budgets`
 * (allocation is real, admin-entered) against FMS's own real settled
 * spend (not PRMS's own expense+PO consumption — FMS is the ledger of
 * record per Phase 6's posture). Only `company` (scope-free) and `project`
 * (shares the `pms_projects._id` key with `Transaction.projectId`) levels
 * are joinable today; `department` and `category` levels have no shared
 * key with FMS yet (PRMS budgets use a real `departmentId`, FMS
 * `Transaction.department` is free text) — listed separately, not silently
 * omitted or wrongly joined.
 */

const TRANSACTIONS_COLLECTION = "fms_transactions";
const SETTLED_STATUSES = ["completed", "reconciled"];

interface Doc {
  _id: string;
}

async function actualSpend(periodStart: Date, periodEnd: Date, projectId: string | null): Promise<number> {
  try {
    const db = await getDb();
    const match: Record<string, unknown> = {
      deletedAt: null,
      type: "expense",
      status: { $in: SETTLED_STATUSES },
      transactionDate: { $gte: periodStart, $lte: periodEnd },
    };
    if (projectId) match.projectId = projectId;
    const rows = await db
      .collection<Doc>(TRANSACTIONS_COLLECTION)
      .aggregate<{ total: number }>([{ $match: match }, { $group: { _id: null, total: { $sum: "$amount" } } }])
      .toArray();
    return round2(rows[0]?.total ?? 0);
  } catch {
    return 0;
  }
}

export interface BudgetVsActualRow {
  budgetId: string;
  budgetCode: string;
  name: string;
  level: "company" | "project";
  periodStart: string;
  periodEnd: string;
  allocated: number;
  actual: number;
  variance: number;
  utilisationPercent: number;
}

export interface UncomparableBudget {
  budgetId: string;
  budgetCode: string;
  name: string;
  level: string;
  scopeName: string | null;
  allocated: number;
  consumedInPrms: number;
}

export interface BudgetVsActualResult {
  rows: BudgetVsActualRow[];
  uncomparable: UncomparableBudget[];
}

export async function getBudgetVsActual(): Promise<BudgetVsActualResult> {
  const { items: budgets } = await searchBudgets({ pageSize: 100 });

  const rows: BudgetVsActualRow[] = [];
  const uncomparable: UncomparableBudget[] = [];

  await Promise.all(
    budgets.map(async (b: Budget) => {
      // A record without a period (an older or differently-shaped one) cannot be compared with actual spend.
      if (!(b.periodStart instanceof Date) || !(b.periodEnd instanceof Date)) return;
      if (b.level !== "company" && b.level !== "project") {
        uncomparable.push({
          budgetId: b._id,
          budgetCode: b.budgetCode,
          name: b.name,
          level: b.level,
          scopeName: b.scopeName,
          allocated: b.allocatedAmount,
          consumedInPrms: b.consumedAmount,
        });
        return;
      }
      const actual = await actualSpend(b.periodStart, b.periodEnd, b.level === "project" ? b.scopeId : null);
      const variance = round2(b.allocatedAmount - actual);
      rows.push({
        budgetId: b._id,
        budgetCode: b.budgetCode,
        name: b.name,
        level: b.level,
        periodStart: b.periodStart.toISOString(),
        periodEnd: b.periodEnd.toISOString(),
        allocated: b.allocatedAmount,
        actual,
        variance,
        utilisationPercent: b.allocatedAmount > 0 ? round2((actual / b.allocatedAmount) * 100) : 0,
      });
    })
  );

  rows.sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  return { rows, uncomparable };
}
