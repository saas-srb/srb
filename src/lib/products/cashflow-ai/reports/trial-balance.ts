import "server-only";
import { listAccounts } from "@/lib/products/cashflow-ai/accounts";
import { allLinesInRange } from "@/lib/products/cashflow-ai/journal";
import { convertLinesToBase } from "@/lib/products/cashflow-ai/exchange-rates";
import { round2, type AccountType } from "@/lib/products/cashflow-ai/constants";

/** Trial Balance (§29 — Phase 5): every account's total debits/credits as of a date. Proves Σdebits == Σcredits. */

export interface TrialBalanceRow {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  totalDebit: number;
  totalCredit: number;
}

export interface TrialBalanceResult {
  asOf: string | null;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
  balanced: boolean;
  /** True if any line was converted to base currency using the fail-soft 1.0 fallback — see `fms/exchange-rates.ts`. */
  hasUnratedForeignCurrency: boolean;
}

export async function getTrialBalance(opts: { asOf?: Date } = {}): Promise<TrialBalanceResult> {
  const asOf = opts.asOf ?? new Date();
  const [accounts, rawLines] = await Promise.all([listAccounts(), allLinesInRange(opts.asOf ? { dateTo: opts.asOf } : {})]);
  const { lines, hasUnratedForeignCurrency } = await convertLinesToBase(rawLines, asOf);

  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const l of lines) {
    const totals = byAccount.get(l.accountId) ?? { debit: 0, credit: 0 };
    if (l.side === "debit") totals.debit += l.baseAmount;
    else totals.credit += l.baseAmount;
    byAccount.set(l.accountId, totals);
  }

  const rows: TrialBalanceRow[] = [];
  let totalDebits = 0;
  let totalCredits = 0;
  for (const account of accounts) {
    const totals = byAccount.get(account._id);
    if (!totals) continue;
    const totalDebit = round2(totals.debit);
    const totalCredit = round2(totals.credit);
    if (totalDebit === 0 && totalCredit === 0) continue;
    totalDebits += totalDebit;
    totalCredits += totalCredit;
    rows.push({ accountId: account._id, accountCode: account.code, accountName: account.name, accountType: account.type, totalDebit, totalCredit });
  }
  rows.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  totalDebits = round2(totalDebits);
  totalCredits = round2(totalCredits);

  return {
    asOf: opts.asOf ? opts.asOf.toISOString() : null,
    rows,
    totalDebits,
    totalCredits,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01,
    hasUnratedForeignCurrency,
  };
}
