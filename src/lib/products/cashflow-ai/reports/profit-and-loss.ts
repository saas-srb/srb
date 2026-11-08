import "server-only";
import { listAccounts } from "@/lib/products/cashflow-ai/accounts";
import { allLinesInRange } from "@/lib/products/cashflow-ai/journal";
import { convertLinesToBase } from "@/lib/products/cashflow-ai/exchange-rates";
import { round2 } from "@/lib/products/cashflow-ai/constants";

/** Profit & Loss (§30 — Phase 5): income/expense account totals for a date range, computed from journal lines. */

export interface ProfitAndLossLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface ProfitAndLossResult {
  dateFrom: string | null;
  dateTo: string | null;
  income: ProfitAndLossLine[];
  expenses: ProfitAndLossLine[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  /** True if any line was converted to base currency using the fail-soft 1.0 fallback — see `fms/exchange-rates.ts`. */
  hasUnratedForeignCurrency: boolean;
}

/**
 * `includeClosing` keeps the entries that close a fiscal period (they move profit into Retained Earnings). The report leaves them out so a closed
 * period still shows its profit; the balance sheet keeps them in, because there the posted Retained Earnings already holds the closed profit.
 */
export async function getProfitAndLoss(opts: { dateFrom?: Date; dateTo?: Date; includeClosing?: boolean } = {}): Promise<ProfitAndLossResult> {
  const { includeClosing, ...range } = opts;
  const [accounts, rawLines] = await Promise.all([listAccounts(), allLinesInRange({ ...range, excludeClosing: !includeClosing })]);
  const { lines, hasUnratedForeignCurrency } = await convertLinesToBase(rawLines, range.dateTo ?? new Date());
  const accountById = new Map(accounts.map((a) => [a._id, a]));
  const totals = new Map<string, number>();

  for (const l of lines) {
    const account = accountById.get(l.accountId);
    if (!account || (account.type !== "income" && account.type !== "expense")) continue;
    const sign = account.type === "income" ? (l.side === "credit" ? 1 : -1) : l.side === "debit" ? 1 : -1;
    totals.set(l.accountId, round2((totals.get(l.accountId) ?? 0) + sign * l.baseAmount));
  }

  const income: ProfitAndLossLine[] = [];
  const expenses: ProfitAndLossLine[] = [];
  for (const [accountId, amount] of totals) {
    const account = accountById.get(accountId);
    if (!account) continue;
    const line = { accountId, accountCode: account.code, accountName: account.name, amount };
    if (account.type === "income") income.push(line);
    else expenses.push(line);
  }
  income.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  expenses.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalIncome = round2(income.reduce((s, l) => s + l.amount, 0));
  const totalExpenses = round2(expenses.reduce((s, l) => s + l.amount, 0));

  return {
    dateFrom: range.dateFrom ? range.dateFrom.toISOString() : null,
    dateTo: range.dateTo ? range.dateTo.toISOString() : null,
    income,
    expenses,
    totalIncome,
    totalExpenses,
    netProfit: round2(totalIncome - totalExpenses),
    hasUnratedForeignCurrency,
  };
}
