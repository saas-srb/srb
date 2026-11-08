import "server-only";
import { getAccount } from "@/lib/products/cashflow-ai/accounts";
import { linesForAccount, type JournalLine } from "@/lib/products/cashflow-ai/journal";
import { convertLinesToBase } from "@/lib/products/cashflow-ai/exchange-rates";
import { normalBalanceSide, round2, type AccountType } from "@/lib/products/cashflow-ai/constants";

/**
 * General Ledger (§29 — Phase 5): a per-account running balance built from
 * `fms_journal_lines`, never a stored/cached total — same "recompute from
 * source" discipline as `fms/receivables.ts`/`fms/payables.ts`. Amounts are
 * converted to base currency (Phase 7) before the running balance is
 * computed — see `fms/exchange-rates.ts`.
 */

export interface GeneralLedgerLine {
  entryId: string;
  entryDate: string;
  transactionId: string | null;
  transactionNumber: string | null;
  description: string | null;
  side: "debit" | "credit";
  amount: number;
  currency: string;
  runningBalance: number;
}

export interface GeneralLedgerResult {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingBalance: number;
  lines: GeneralLedgerLine[];
  closingBalance: number;
  hasUnratedForeignCurrency: boolean;
}

type ConvertedLine = JournalLine & { baseAmount: number };

function netBalance(lines: ConvertedLine[], side: "debit" | "credit"): number {
  let total = 0;
  for (const l of lines) {
    if (side === "debit") total += l.side === "debit" ? l.baseAmount : -l.baseAmount;
    else total += l.side === "credit" ? l.baseAmount : -l.baseAmount;
  }
  return total;
}

export async function generalLedgerForAccount(
  accountId: string,
  opts: { dateFrom?: Date; dateTo?: Date } = {}
): Promise<GeneralLedgerResult | null> {
  const account = await getAccount(accountId);
  if (!account) return null;
  const side = normalBalanceSide(account.type);
  const asOf = opts.dateTo ?? new Date();

  const [rawPriorLines, rawRangeLines] = await Promise.all([
    opts.dateFrom ? linesForAccount(accountId, { dateTo: new Date(opts.dateFrom.getTime() - 1) }) : Promise.resolve([]),
    linesForAccount(accountId, opts),
  ]);
  const [{ lines: priorLines, hasUnratedForeignCurrency: priorUnrated }, { lines: rangeLines, hasUnratedForeignCurrency: rangeUnrated }] =
    await Promise.all([convertLinesToBase(rawPriorLines, asOf), convertLinesToBase(rawRangeLines, asOf)]);

  const openingBalance = round2(netBalance(priorLines, side));

  let running = openingBalance;
  const lines: GeneralLedgerLine[] = rangeLines.map((l) => {
    const delta = side === "debit" ? (l.side === "debit" ? l.baseAmount : -l.baseAmount) : l.side === "credit" ? l.baseAmount : -l.baseAmount;
    running = round2(running + delta);
    return {
      entryId: l.entryId,
      entryDate: l.entryDate.toISOString(),
      transactionId: l.transactionId,
      transactionNumber: l.transactionNumber,
      description: l.description,
      side: l.side,
      amount: l.baseAmount,
      currency: l.currency,
      runningBalance: running,
    };
  });

  return {
    accountId: account._id,
    accountCode: account.code,
    accountName: account.name,
    accountType: account.type,
    openingBalance,
    lines,
    closingBalance: running,
    hasUnratedForeignCurrency: priorUnrated || rangeUnrated,
  };
}
