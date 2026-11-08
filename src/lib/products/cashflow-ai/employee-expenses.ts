import "server-only";
import {
  searchExpenses as searchPrmsExpenses,
  getExpense as getPrmsExpense,
  type Expense,
  type ExpenseFilter,
} from "@/lib/products/spendiq/expenses";
import { listReimbursementsForExpense } from "@/lib/products/cashflow-ai/reimbursements";

/**
 * FMS's "Employee Expenses" view (§13, Phase 3). PRMS already unifies
 * employee-submitted and vendor-billed expenses in one `prms_expenses`
 * collection with one flat approval tier — there is no separate "employee
 * expense" shape to peel apart. Every expense has a mandatory
 * `raisedByUserId`, even a staff-logged vendor cost, so that field alone
 * can't distinguish a personal claim; the real signal is `vendorId` being
 * unset (money owed back to the person who paid, not to a vendor) — see the
 * additive `personalClaimOnly` filter on PRMS's own `ExpenseFilter`
 * (`src/lib/spendiq/expenses.ts`). This module re-exports PRMS's own
 * `searchExpenses`/`getExpense` filtered that way — same wrapping pattern
 * as Phase 1's Vendors and Phase 2's Bills. Never duplicates PRMS's data.
 */

export type EmployeeExpenseFilter = Omit<ExpenseFilter, "personalClaimOnly">;

export async function listEmployeeExpenses(
  opts: EmployeeExpenseFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
) {
  return searchPrmsExpenses({ ...opts, personalClaimOnly: true });
}

export async function getEmployeeExpenseDetail(id: string): Promise<{ expense: Expense; reimbursedTotal: number } | null> {
  const expense = await getPrmsExpense(id);
  if (!expense || expense.vendorId) return null;
  const reimbursements = await listReimbursementsForExpense(id);
  const reimbursedTotal = reimbursements.reduce((s, r) => s + r.amount, 0);
  return { expense, reimbursedTotal };
}
