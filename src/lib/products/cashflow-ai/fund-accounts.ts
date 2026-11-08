import "server-only";
import { getDb } from "@/lib/mongodb";
import { round2, type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { listBankAccountOptions } from "@/lib/products/cashflow-ai/bank-accounts";
import { listCashAccountOptions } from "@/lib/products/cashflow-ai/cash-accounts";

/**
 * Shared balance-maintenance helper for both bank and cash accounts —
 * §19/§21 both want a real running "Current Balance", and both account
 * types update it the exact same way, so this lives once rather than being
 * duplicated in `bank-accounts.ts`/`cash-accounts.ts`. Called from
 * `fms/transactions.ts` whenever a transaction carrying a `fundAccountId`
 * enters or leaves a settled (`completed`/`reconciled`) status — see that
 * file's `applyFundAccountEffect`.
 */

const COLLECTION_BY_TYPE: Record<FundAccountType, string> = {
  bank: "fms_bank_accounts",
  cash: "fms_cash_accounts",
};

export async function applyToFundAccount(type: FundAccountType, accountId: string, delta: number): Promise<void> {
  if (delta === 0) return;
  try {
    const db = await getDb();
    const collection = db.collection<{ _id: string; currentBalance: number }>(COLLECTION_BY_TYPE[type]);
    const account = await collection.findOne({ _id: accountId });
    if (!account) return;
    const currentBalance = round2(account.currentBalance + delta);
    await collection.updateOne({ _id: accountId }, { $set: { currentBalance, updatedAt: new Date() } });
  } catch {
    // A missing/unconfigured account must never break the transaction it's attached to.
  }
}

export async function getFundAccountLabel(type: FundAccountType | null, accountId: string | null): Promise<string | null> {
  if (!type || !accountId) return null;
  try {
    const db = await getDb();
    const collection = db.collection<{ _id: string; accountName: string }>(COLLECTION_BY_TYPE[type]);
    const account = await collection.findOne({ _id: accountId }, { projection: { accountName: 1 } });
    return account?.accountName ?? null;
  } catch {
    return null;
  }
}

export interface FundAccountOption {
  key: string;
  type: FundAccountType;
  id: string;
  label: string;
  currency: string;
}

/**
 * Combined bank+cash picker list (fast-follow to the Fund Account picker
 * retrofit) — one reusable build instead of each new hosting page
 * constructing the same `{key, type, id, label}` shape inline the way
 * `transactions/page.tsx` already does for `TransactionForm`. Includes
 * `currency` so a caller can filter to accounts matching a fixed or
 * user-chosen currency before rendering the picker.
 */
export async function listFundAccountOptions(): Promise<FundAccountOption[]> {
  const [banks, cashes] = await Promise.all([listBankAccountOptions(), listCashAccountOptions()]);
  return [
    ...banks.map((b) => ({ key: `bank:${b._id}`, type: "bank" as const, id: b._id, label: `${b.accountName} (${b.bankName})`, currency: b.currency })),
    ...cashes.map((c) => ({ key: `cash:${c._id}`, type: "cash" as const, id: c._id, label: c.accountName, currency: c.currency })),
  ];
}
