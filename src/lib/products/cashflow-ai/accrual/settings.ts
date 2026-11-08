import "server-only";
import { getDb } from "@/lib/mongodb";
import { getAccount, getAccountByCode, createAccount, CONTROL_ACCOUNT_CODES, type Account } from "@/lib/products/cashflow-ai/accounts";
import { ENGINE_ACCOUNTS, type AccountRef, type AccrualAccounts } from "@/lib/products/cashflow-ai/accrual/core";

/**
 * The company's accrual-books switch. One document. While there is none,
 * nothing here changes how the ledger works.
 */
export const ACCRUAL_SETTINGS_COLLECTION = "fms_accrual_settings";
const KEY = "main";

export interface AccrualSettings {
  _id: string;
  /** YYYY-MM-DD (India date) accrual books started. Documents are posted from this date; before it the ledger stays as it was. */
  startDate: string;
  /** The moment of switching on. Anything recorded after it is accrual; anything recorded before it is in the opening balances. */
  activatedAt: Date;
  activatedBy: string;
  /** Where invoice revenue goes, as chosen by the company. */
  revenueAccountId: string;
  /** Where vendor-bill cost goes by default, as chosen by the company. */
  expenseAccountId: string;
  openingReceivable: number;
  openingPayable: number;
}

export async function getAccrualSettings(): Promise<AccrualSettings | null> {
  const db = await getDb();
  return db.collection<AccrualSettings>(ACCRUAL_SETTINGS_COLLECTION).findOne({ _id: KEY });
}

export async function saveAccrualSettingsIfAbsent(s: Omit<AccrualSettings, "_id">): Promise<boolean> {
  const db = await getDb();
  const res = await db.collection<AccrualSettings>(ACCRUAL_SETTINGS_COLLECTION).updateOne({ _id: KEY }, { $setOnInsert: { _id: KEY, ...s } }, { upsert: true });
  return res.upsertedCount === 1;
}

const ref = (a: Account): AccountRef => ({ _id: a._id, code: a.code, name: a.name });

/** Finds or creates one of the engine's own accounts. Never renames or changes an account that already has the code. */
async function engineAccount(def: { code: string; name: string; type: "asset" | "liability" | "equity" }, actorId: string): Promise<AccountRef> {
  const existing = await getAccountByCode(def.code);
  if (existing) return ref(existing);
  try {
    return ref(await createAccount({ code: def.code, name: def.name, type: def.type, parentId: null, description: "Used by accrual books.", isActive: true }, actorId));
  } catch {
    // two requests created it together: the other one won
    const again = await getAccountByCode(def.code);
    if (again) return ref(again);
    throw new Error(`Could not create the ${def.name} account.`);
  }
}

/** All the accounts the engine posts to. `null` when the chart of accounts lacks Accounts Receivable / Payable or the chosen revenue / expense account. */
export async function resolveAccrualAccounts(s: Pick<AccrualSettings, "revenueAccountId" | "expenseAccountId">, actorId: string): Promise<AccrualAccounts | null> {
  const [receivable, payable, revenue, expense] = await Promise.all([
    getAccountByCode(CONTROL_ACCOUNT_CODES.accountsReceivable),
    getAccountByCode(CONTROL_ACCOUNT_CODES.accountsPayable),
    getAccount(s.revenueAccountId),
    getAccount(s.expenseAccountId),
  ]);
  if (!receivable || !payable || !revenue || !expense) return null;
  const [gstInput, gstOutput, tdsPayable, openingEquity, tdsReceivable] = await Promise.all([
    engineAccount(ENGINE_ACCOUNTS.gstInput, actorId),
    engineAccount(ENGINE_ACCOUNTS.gstOutput, actorId),
    engineAccount(ENGINE_ACCOUNTS.tdsPayable, actorId),
    engineAccount(ENGINE_ACCOUNTS.openingEquity, actorId),
    engineAccount(ENGINE_ACCOUNTS.tdsReceivable, actorId),
  ]);
  return { receivable: ref(receivable), payable: ref(payable), revenue: ref(revenue), expense: ref(expense), gstInput, gstOutput, tdsPayable, openingEquity, tdsReceivable };
}

/** Is this transaction (recorded now) to be booked the accrual way? */
export function accrualAppliesTo(settings: AccrualSettings | null, createdAt: Date): boolean {
  return !!settings && createdAt.getTime() >= settings.activatedAt.getTime();
}
