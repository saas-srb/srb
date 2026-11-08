import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { type AccountType } from "@/lib/products/cashflow-ai/constants";

/**
 * Chart of Accounts (§29). This is the Phase 1 subset only — a flat,
 * admin-configurable list of accounts under the four §29 top-level types, used
 * to classify transactions (§5 "Category"). Journal entries / general ledger /
 * account hierarchies with running balances are Phase 5 work.
 */

export const ACCOUNTS_COLLECTION = "fms_accounts";
const TRANSACTIONS_COLLECTION = "fms_transactions";

export interface Account extends AuditFields {
  _id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  description: string | null;
  isActive: boolean;
}

export interface SerializedAccount extends Omit<Account, "createdAt" | "updatedAt" | "deletedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function serializeAccount(a: Account): SerializedAccount {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
    deletedAt: a.deletedAt ? a.deletedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Account>(ACCOUNTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ code: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ type: 1 }).catch(() => {}),
      collection.createIndex({ isActive: 1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function getAccount(id: string): Promise<Account | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export async function getAccountByCode(code: string): Promise<Account | null> {
  const collection = await getCollection();
  return collection.findOne({ code, ...notDeleted });
}

/**
 * Codes of the shared control accounts Phase 5's journal-posting hook maps
 * fund accounts and unsettled-side fallbacks onto — see `fms/journal.ts`.
 * One GL account per fund-account *type* (not per literal bank/cash account).
 */
export const CONTROL_ACCOUNT_CODES = {
  cash: "1000",
  bank: "1010",
  retainedEarnings: "3000",
  accountsReceivable: "1100",
  accountsPayable: "2000",
  otherIncome: "4900",
  otherExpense: "5900",
} as const;

/** Lightweight list for the transaction form's category/account dropdown. */
export async function listAccountOptions(
  opts: { type?: AccountType; activeOnly?: boolean } = {}
): Promise<{ _id: string; code: string; name: string; type: AccountType }[]> {
  const collection = await getCollection();
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.type) filter.type = opts.type;
  if (opts.activeOnly) filter.isActive = true;
  const docs = await collection
    .find(filter, { projection: { code: 1, name: 1, type: 1 } })
    .sort({ code: 1 })
    .toArray();
  return docs.map((d) => ({ _id: d._id, code: d.code, name: d.name, type: d.type }));
}

export interface AccountFilter {
  search?: string;
  type?: AccountType;
  isActive?: boolean;
}

function buildFilter(opts: AccountFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ name: rx }, { code: rx }];
  }
  if (opts.type) filter.type = opts.type;
  if (typeof opts.isActive === "boolean") filter.isActive = opts.isActive;
  return filter;
}

export async function listAccounts(opts: AccountFilter = {}): Promise<Account[]> {
  const collection = await getCollection();
  return collection.find(buildFilter(opts)).sort({ type: 1, code: 1 }).toArray();
}

export interface AccountWriteData {
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  description: string | null;
  isActive: boolean;
}

export async function createAccount(data: AccountWriteData, actorId: string): Promise<Account> {
  const collection = await getCollection();
  const doc: Account = {
    _id: newId(),
    code: data.code,
    name: data.name,
    type: data.type,
    parentId: data.parentId,
    description: data.description,
    isActive: data.isActive,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  return doc;
}

export async function updateAccount(
  id: string,
  data: Partial<AccountWriteData>,
  actorId: string
): Promise<Account | null> {
  const collection = await getCollection();
  return collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...data, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
}

/** Soft-delete. Refuses when transactions still reference the account. */
export async function deleteAccount(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const db = await getDb();
  const openRefs = await db
    .collection(TRANSACTIONS_COLLECTION)
    .countDocuments({ accountId: id, deletedAt: null })
    .catch(() => 0);
  if (openRefs > 0) {
    return { ok: false, reason: `${openRefs} transaction(s) still reference this account.` };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  return { ok: res.modifiedCount === 1 };
}

/**
 * Default Chart of Accounts per §29. Used by the settings page's "seed
 * defaults" action and by the demo seed script — idempotent (skips codes that
 * already exist).
 */
export const DEFAULT_ACCOUNTS: Omit<AccountWriteData, "parentId">[] = [
  // Assets
  { code: "1000", name: "Cash", type: "asset", description: "Petty cash and cash-in-hand accounts.", isActive: true },
  { code: "1010", name: "Bank", type: "asset", description: "Company bank accounts.", isActive: true },
  { code: "1100", name: "Accounts Receivable", type: "asset", description: "Amounts owed by customers.", isActive: true },
  { code: "1200", name: "Equipment", type: "asset", description: "Office and technical equipment.", isActive: true },
  { code: "1210", name: "Computers", type: "asset", description: "Laptops, desktops and peripherals.", isActive: true },
  { code: "1900", name: "Other Assets", type: "asset", description: "Miscellaneous assets.", isActive: true },
  // Liabilities
  { code: "2000", name: "Accounts Payable", type: "liability", description: "Amounts owed to vendors.", isActive: true },
  { code: "2100", name: "Payroll Payable", type: "liability", description: "Salaries and wages payable.", isActive: true },
  { code: "2200", name: "Tax Payable", type: "liability", description: "Taxes collected/owed.", isActive: true },
  { code: "2900", name: "Other Liabilities", type: "liability", description: "Miscellaneous liabilities.", isActive: true },
  // Equity
  { code: "3000", name: "Retained Earnings", type: "equity", description: "Cumulative net income — computed live for the Balance Sheet, not journal-posted.", isActive: true },
  // Income
  { code: "4000", name: "Project Revenue", type: "income", description: "Revenue from client projects.", isActive: true },
  { code: "4100", name: "Training Revenue", type: "income", description: "Revenue from training & internship programs.", isActive: true },
  { code: "4200", name: "Consulting Revenue", type: "income", description: "Revenue from consulting engagements.", isActive: true },
  { code: "4900", name: "Other Income", type: "income", description: "Miscellaneous income.", isActive: true },
  // Expenses
  { code: "5000", name: "Salaries", type: "expense", description: "Employee salaries and wages.", isActive: true },
  { code: "5100", name: "Infrastructure", type: "expense", description: "Servers, hosting, cloud infrastructure.", isActive: true },
  { code: "5200", name: "Software", type: "expense", description: "Software licenses and SaaS subscriptions.", isActive: true },
  { code: "5300", name: "Office", type: "expense", description: "Office supplies, rent, utilities.", isActive: true },
  { code: "5400", name: "Marketing", type: "expense", description: "Marketing and advertising spend.", isActive: true },
  { code: "5500", name: "Travel", type: "expense", description: "Business travel and accommodation.", isActive: true },
  { code: "5900", name: "Other Expenses", type: "expense", description: "Miscellaneous expenses.", isActive: true },
];

export async function seedDefaultAccounts(actorId: string | null): Promise<number> {
  const collection = await getCollection();
  const existingCodes = new Set((await collection.find({}, { projection: { code: 1 } }).toArray()).map((d) => d.code));
  const toInsert = DEFAULT_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length === 0) return 0;
  const docs: Account[] = toInsert.map((a) => ({
    _id: newId(),
    ...a,
    parentId: null,
    ...createStamp(actorId),
  }));
  await collection.insertMany(docs);
  return docs.length;
}
