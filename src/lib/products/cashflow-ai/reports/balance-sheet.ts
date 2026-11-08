import "server-only";
import { listAccounts } from "@/lib/products/cashflow-ai/accounts";
import { allLinesInRange } from "@/lib/products/cashflow-ai/journal";
import { convertLinesToBase } from "@/lib/products/cashflow-ai/exchange-rates";
import { round2 } from "@/lib/products/cashflow-ai/constants";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";

/**
 * Balance Sheet (§30 — Phase 5, updated Phase 7): assets/liabilities/equity
 * as of a date. Retained Earnings = whatever's already posted via a real
 * fiscal-period closing entry (`fms/fiscal-periods.ts`'s `closePeriod` —
 * 0 if no period has ever been closed) + live net income for the
 * still-open remainder. A closing entry's own lines exactly offset that
 * period's real activity within `getProfitAndLoss`'s range sum, so the
 * live term automatically nets to just the unclosed portion — this is
 * backward-compatible by construction: an install that never closes a
 * period gets exactly Phase 5's original "cumulative net income since
 * inception" figure.
 */

export interface BalanceSheetLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
}

export interface BalanceSheetResult {
  asOf: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  retainedEarnings: number;
  balanced: boolean;
  /** True if any line was converted to base currency using the fail-soft 1.0 fallback — see `fms/exchange-rates.ts`. */
  hasUnratedForeignCurrency: boolean;
}

export async function getBalanceSheet(asOf: Date = new Date()): Promise<BalanceSheetResult> {
  const [accounts, rawLines, pl] = await Promise.all([
    listAccounts(),
    allLinesInRange({ dateTo: asOf }),
    getProfitAndLoss({ dateTo: asOf, includeClosing: true }),
  ]);
  const { lines, hasUnratedForeignCurrency: linesUnrated } = await convertLinesToBase(rawLines, asOf);
  const accountById = new Map(accounts.map((a) => [a._id, a]));
  const totals = new Map<string, number>();

  for (const l of lines) {
    const account = accountById.get(l.accountId);
    if (!account || (account.type !== "asset" && account.type !== "liability" && account.type !== "equity")) continue;
    const sign = account.type === "asset" ? (l.side === "debit" ? 1 : -1) : l.side === "credit" ? 1 : -1;
    totals.set(l.accountId, round2((totals.get(l.accountId) ?? 0) + sign * l.baseAmount));
  }

  const retainedEarningsAccount = accounts.find((a) => a.type === "equity");

  const assets: BalanceSheetLine[] = [];
  const liabilities: BalanceSheetLine[] = [];
  const equity: BalanceSheetLine[] = [];
  for (const [accountId, amount] of totals) {
    const account = accountById.get(accountId);
    if (!account) continue;
    if (retainedEarningsAccount && accountId === retainedEarningsAccount._id) continue; // merged below with the live open-period figure
    const line = { accountId, accountCode: account.code, accountName: account.name, amount };
    if (account.type === "asset") assets.push(line);
    else if (account.type === "liability") liabilities.push(line);
    else equity.push(line);
  }

  const postedRetainedEarnings = retainedEarningsAccount ? totals.get(retainedEarningsAccount._id) ?? 0 : 0;
  const retainedEarnings = round2(postedRetainedEarnings + pl.netProfit);
  equity.push({
    accountId: retainedEarningsAccount?._id ?? "retained-earnings",
    accountCode: retainedEarningsAccount?.code ?? "3000",
    accountName: retainedEarningsAccount?.name ?? "Retained Earnings",
    amount: retainedEarnings,
  });

  assets.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  liabilities.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  equity.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  const totalAssets = round2(assets.reduce((s, l) => s + l.amount, 0));
  const totalLiabilities = round2(liabilities.reduce((s, l) => s + l.amount, 0));
  const totalEquity = round2(equity.reduce((s, l) => s + l.amount, 0));

  return {
    asOf: asOf.toISOString(),
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    retainedEarnings,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
    hasUnratedForeignCurrency: linesUnrated || pl.hasUnratedForeignCurrency,
  };
}
