import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import {
  newId,
  createStamp,
  updateStamp,
  notDeleted,
  nextYearSequence,
  formatYearCode,
  type AuditFields,
} from "@/lib/products/cashflow-ai/db";
import {
  DEFAULT_CURRENCY,
  round2,
  canTransitionTransaction,
  type TransactionType,
  type TransactionStatus,
  type PaymentMethod,
  type SourceModule,
  type FundAccountType,
} from "@/lib/products/cashflow-ai/constants";
import { recordAudit, diffSummary } from "@/lib/products/cashflow-ai/audit";
import { applyToFundAccount } from "@/lib/products/cashflow-ai/fund-accounts";
import { postJournalEntryForTransaction, reverseJournalEntryForTransaction } from "@/lib/products/cashflow-ai/journal";
import { isDateInClosedPeriod } from "@/lib/products/cashflow-ai/fiscal-periods";

/** Transactions whose fund-account effect is already applied — see `applyFundAccountEffect`. */
const SETTLED_STATUSES = new Set<TransactionStatus>(["completed", "reconciled"]);

/**
 * `income` credits the fund account, `expense` debits it — unambiguous.
 * `transfer`/`adjustment` have no single inferred sign: a real transfer
 * between two fund accounts is posted as an `expense` leg (source) + an
 * `income` leg (destination) sharing a `transferId` — see
 * `fms/fund-transfers.ts` — rather than teaching this function a second
 * sign convention for a `"transfer"`-typed row.
 */
function fundEffectSign(type: TransactionType): number {
  if (type === "income") return 1;
  if (type === "expense") return -1;
  return 0;
}

/**
 * Centralized transaction log (§5) — the single source of truth for every
 * financial event in FMS. Full field set per spec; controlled status
 * transitions live in `TRANSACTION_TRANSITIONS` (`fms/constants.ts`) and are
 * enforced here, never left to the UI alone.
 */

export const TRANSACTIONS_COLLECTION = "fms_transactions";
const TXN_NUMBER_PREFIX = "TXN";

export interface TransactionAttachment {
  storageKey: string;
  filename: string;
  contentType: string;
  size: number;
}

export interface Transaction extends AuditFields {
  _id: string;
  transactionNumber: string;
  type: TransactionType;
  transactionDate: Date;
  postingDate: Date;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  sourceModule: SourceModule;
  sourceRecordId: string | null;
  /** Reference into `pms_clients` — never a duplicated customer record. */
  customerId: string | null;
  /** Reference into `prms_vendors` — never a duplicated vendor record. */
  vendorId: string | null;
  /** Reference into `hrms_employees` — reserved for the Payroll phase. */
  employeeId: string | null;
  /** Reference into `pms_projects`. */
  projectId: string | null;
  department: string | null;
  /** Reference into `fms_accounts` (Chart of Accounts / category). */
  accountId: string | null;
  /** Which real bank/cash account this settled through (§19/§21) — distinct from `accountId`'s category. */
  fundAccountId: string | null;
  fundAccountType: FundAccountType | null;
  /** Set on both legs of a fund transfer — see `fms/fund-transfers.ts`. */
  transferId: string | null;
  /** Set on a customer receipt ("receivable") or a vendor-bill payment ("payable"): under accrual books it settles that balance instead of booking income / cost. */
  accrualRole?: "receivable" | "payable" | null;
  taxAmount: number;
  referenceNumber: string | null;
  description: string | null;
  attachments: TransactionAttachment[];
  approvedBy: string | null;
  approvedAt: Date | null;
  status: TransactionStatus;
}

export interface SerializedTransaction
  extends Omit<Transaction, "createdAt" | "updatedAt" | "deletedAt" | "transactionDate" | "postingDate" | "approvedAt"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  transactionDate: string;
  postingDate: string;
  approvedAt: string | null;
}

export function serializeTransaction(t: Transaction): SerializedTransaction {
  return {
    ...t,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt ? t.deletedAt.toISOString() : null,
    transactionDate: t.transactionDate.toISOString(),
    postingDate: t.postingDate.toISOString(),
    approvedAt: t.approvedAt ? t.approvedAt.toISOString() : null,
  };
}

let indexesEnsured = false;

async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Transaction>(TRANSACTIONS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ transactionNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ type: 1 }).catch(() => {}),
      collection.createIndex({ status: 1 }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
      collection.createIndex({ vendorId: 1 }).catch(() => {}),
      collection.createIndex({ projectId: 1 }).catch(() => {}),
      collection.createIndex({ accountId: 1 }).catch(() => {}),
      collection.createIndex({ transactionDate: -1 }).catch(() => {}),
      collection.createIndex({ createdAt: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateTransactionNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(TXN_NUMBER_PREFIX, year);
  return formatYearCode(TXN_NUMBER_PREFIX, year, seq);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getTransaction(id: string): Promise<Transaction | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export interface TransactionFilter {
  search?: string;
  type?: TransactionType;
  status?: TransactionStatus;
  customerId?: string;
  vendorId?: string;
  projectId?: string;
  department?: string;
  accountId?: string;
  sourceModule?: SourceModule;
  fundAccountType?: FundAccountType;
  fundAccountId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

function buildFilter(opts: TransactionFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ transactionNumber: rx }, { referenceNumber: rx }, { description: rx }];
  }
  if (opts.type) filter.type = opts.type;
  if (opts.status) filter.status = opts.status;
  if (opts.customerId) filter.customerId = opts.customerId;
  if (opts.vendorId) filter.vendorId = opts.vendorId;
  if (opts.projectId) filter.projectId = opts.projectId;
  if (opts.department) filter.department = opts.department;
  if (opts.accountId) filter.accountId = opts.accountId;
  if (opts.sourceModule) filter.sourceModule = opts.sourceModule;
  if (opts.fundAccountType) filter.fundAccountType = opts.fundAccountType;
  if (opts.fundAccountId) filter.fundAccountId = opts.fundAccountId;
  if (opts.dateFrom || opts.dateTo) {
    const range: Record<string, Date> = {};
    if (opts.dateFrom) range.$gte = opts.dateFrom;
    if (opts.dateTo) range.$lte = opts.dateTo;
    filter.transactionDate = range;
  }
  return filter;
}

export interface SearchTransactionsOptions extends TransactionFilter {
  page?: number;
  pageSize?: number;
  sortBy?: "transactionDate" | "createdAt" | "amount" | "transactionNumber" | "status";
  sortDir?: "asc" | "desc";
}

export async function searchTransactions(opts: SearchTransactionsOptions = {}) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);

  const sortField = opts.sortBy ?? "transactionDate";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;

  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);

  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

const EXPORT_ROW_LIMIT = 5000;

export async function exportTransactions(opts: TransactionFilter & { ids?: string[] } = {}): Promise<Transaction[]> {
  const collection = await getCollection();
  const filter = opts.ids && opts.ids.length > 0 ? { _id: { $in: opts.ids }, ...notDeleted } : buildFilter(opts);
  return collection.find(filter).sort({ transactionDate: -1 }).limit(EXPORT_ROW_LIMIT).toArray();
}

/** All non-deleted income/expense transactions referencing a customer, newest first. */
export async function transactionsForCustomer(customerId: string, limit = 200): Promise<Transaction[]> {
  const collection = await getCollection();
  return collection.find({ customerId, ...notDeleted }).sort({ transactionDate: -1 }).limit(limit).toArray();
}

/** All non-deleted transactions referencing a vendor, newest first. */
export async function transactionsForVendor(vendorId: string, limit = 200): Promise<Transaction[]> {
  const collection = await getCollection();
  return collection.find({ vendorId, ...notDeleted }).sort({ transactionDate: -1 }).limit(limit).toArray();
}

/** All non-deleted transactions settled through a given bank/cash account, newest first. */
export async function transactionsForFundAccount(
  fundAccountType: FundAccountType,
  fundAccountId: string,
  limit = 200
): Promise<Transaction[]> {
  const collection = await getCollection();
  return collection.find({ fundAccountId, fundAccountType, ...notDeleted }).sort({ transactionDate: -1 }).limit(limit).toArray();
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export interface TransactionWriteData {
  type: TransactionType;
  transactionDate: Date;
  postingDate: Date;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  sourceModule: SourceModule;
  sourceRecordId: string | null;
  customerId: string | null;
  vendorId: string | null;
  employeeId: string | null;
  projectId: string | null;
  department: string | null;
  accountId: string | null;
  fundAccountId?: string | null;
  fundAccountType?: FundAccountType | null;
  transferId?: string | null;
  accrualRole?: "receivable" | "payable" | null;
  taxAmount: number;
  referenceNumber: string | null;
  description: string | null;
  attachments: TransactionAttachment[];
}

export async function createTransaction(
  data: TransactionWriteData,
  actorId: string,
  actorEmail: string | null
): Promise<Transaction> {
  return insertTransaction(data, actorId, actorEmail, "draft");
}

/**
 * Posts a transaction already in a settled status (`completed` by default),
 * bypassing the guarded `draft → pending_approval → …` workflow. For
 * automated postings from another FMS record that represents an
 * already-decided financial fact — a receipt that was just recorded, a
 * vendor payment PRMS just processed, a completed refund — not a
 * user-entered proposal that still needs review. Manual entries always go
 * through `createTransaction` (draft) + `changeTransactionStatus` instead.
 *
 * Refuses (Phase 7 §39) when `transactionDate` falls inside a closed fiscal
 * period — a draft never reaches this function (see `createTransaction`),
 * so this is the one real gate needed to keep a closed period's ledger from
 * changing after close.
 */
export async function postSystemTransaction(
  data: TransactionWriteData,
  actorId: string,
  actorEmail: string | null,
  status: TransactionStatus = "completed"
): Promise<Transaction | { ok: false; reason: string }> {
  if (SETTLED_STATUSES.has(status) && (await isDateInClosedPeriod(data.transactionDate))) {
    return { ok: false, reason: "Cannot post a transaction dated inside a closed fiscal period." };
  }
  return insertTransaction(data, actorId, actorEmail, status);
}

async function insertTransaction(
  data: TransactionWriteData,
  actorId: string,
  actorEmail: string | null,
  status: TransactionStatus
): Promise<Transaction> {
  const collection = await getCollection();
  const doc: Transaction = {
    _id: newId(),
    transactionNumber: await generateTransactionNumber(data.transactionDate.getFullYear()),
    type: data.type,
    transactionDate: data.transactionDate,
    postingDate: data.postingDate,
    amount: round2(data.amount),
    currency: data.currency || DEFAULT_CURRENCY,
    paymentMethod: data.paymentMethod,
    sourceModule: data.sourceModule,
    sourceRecordId: data.sourceRecordId,
    customerId: data.customerId,
    vendorId: data.vendorId,
    employeeId: data.employeeId,
    projectId: data.projectId,
    department: data.department,
    accountId: data.accountId,
    fundAccountId: data.fundAccountId ?? null,
    fundAccountType: data.fundAccountType ?? null,
    transferId: data.transferId ?? null,
    ...(data.accrualRole ? { accrualRole: data.accrualRole } : {}),
    taxAmount: round2(data.taxAmount),
    referenceNumber: data.referenceNumber,
    description: data.description,
    attachments: data.attachments,
    approvedBy: status === "draft" ? null : actorId,
    approvedAt: status === "draft" ? null : new Date(),
    status,
    ...createStamp(actorId),
  };
  await collection.insertOne(doc);
  if (doc.fundAccountId && doc.fundAccountType && SETTLED_STATUSES.has(status)) {
    const sign = fundEffectSign(doc.type);
    if (sign !== 0) await applyToFundAccount(doc.fundAccountType, doc.fundAccountId, sign * doc.amount);
  }
  if (SETTLED_STATUSES.has(status)) {
    await postJournalEntryForTransaction(doc, actorId);
  }
  await recordAudit({
    actorId,
    actorEmail,
    action: "create",
    entity: "transaction",
    entityId: doc._id,
    entityLabel: doc.transactionNumber,
    summary: `Created ${doc.type} transaction for ${doc.amount} ${doc.currency} (${status})`,
  });
  return doc;
}

/** Only draft transactions may be freely edited — once submitted, correct via a reversal, not a silent edit. */
export async function updateTransaction(
  id: string,
  data: Partial<TransactionWriteData>,
  actorId: string,
  actorEmail: string | null
): Promise<Transaction | { ok: false; reason: string } | null> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return null;
  if (existing.status !== "draft") {
    return { ok: false, reason: "Only draft transactions can be edited. Cancel and re-raise instead." };
  }

  const patch: Record<string, unknown> = { ...data };
  if (typeof data.amount === "number") patch.amount = round2(data.amount);
  if (typeof data.taxAmount === "number") patch.taxAmount = round2(data.taxAmount);

  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...patch, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (updated) {
    const summary = diffSummary(existing as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, [
      "amount",
      "type",
      "accountId",
      "referenceNumber",
    ]);
    await recordAudit({
      actorId,
      actorEmail,
      action: "update",
      entity: "transaction",
      entityId: id,
      entityLabel: updated.transactionNumber,
      summary,
    });
  }
  return updated;
}

/** Soft-delete — only draft transactions. Anything submitted must be cancelled instead. */
export async function deleteTransaction(
  id: string,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return { ok: false, reason: "Not found." };
  if (existing.status !== "draft") {
    return { ok: false, reason: "Only draft transactions can be deleted. Cancel it instead." };
  }
  const res = await collection.updateOne(
    { _id: id, ...notDeleted },
    { $set: { deletedAt: new Date(), ...updateStamp(actorId) } }
  );
  if (res.modifiedCount === 1) {
    await recordAudit({
      actorId,
      actorEmail,
      action: "delete",
      entity: "transaction",
      entityId: id,
      entityLabel: existing.transactionNumber,
    });
  }
  return { ok: res.modifiedCount === 1 };
}

/**
 * Controlled status transition (§5). Validates the move against
 * `TRANSACTION_TRANSITIONS` before writing anything — an illegal transition
 * (e.g. `draft` straight to `completed`) is rejected, not silently allowed.
 */
export async function changeTransactionStatus(
  id: string,
  toStatus: TransactionStatus,
  actorId: string,
  actorEmail: string | null
): Promise<Transaction | { ok: false; reason: string } | null> {
  const collection = await getCollection();
  const existing = await collection.findOne({ _id: id, ...notDeleted });
  if (!existing) return null;

  if (!canTransitionTransaction(existing.status, toStatus)) {
    return { ok: false, reason: `Cannot move a ${existing.status} transaction to ${toStatus}.` };
  }

  const wasSettled = SETTLED_STATUSES.has(existing.status);
  const nowSettled = SETTLED_STATUSES.has(toStatus);
  if (wasSettled !== nowSettled && (await isDateInClosedPeriod(existing.transactionDate))) {
    return { ok: false, reason: "Cannot change the settlement state of a transaction dated inside a closed fiscal period." };
  }

  const patch: Record<string, unknown> = { status: toStatus };
  if (toStatus === "approved") {
    patch.approvedBy = actorId;
    patch.approvedAt = new Date();
  }

  const updated = await collection.findOneAndUpdate(
    { _id: id, ...notDeleted },
    { $set: { ...patch, ...updateStamp(actorId) } },
    { returnDocument: "after" }
  );
  if (updated) {
    if (existing.fundAccountId && existing.fundAccountType) {
      const sign = fundEffectSign(existing.type);
      if (sign !== 0) {
        if (!wasSettled && nowSettled) {
          await applyToFundAccount(existing.fundAccountType, existing.fundAccountId, sign * existing.amount);
        } else if (wasSettled && !nowSettled) {
          await applyToFundAccount(existing.fundAccountType, existing.fundAccountId, -sign * existing.amount);
        }
      }
    }
    if (!wasSettled && nowSettled) {
      await postJournalEntryForTransaction(updated, actorId);
    } else if (wasSettled && !nowSettled) {
      await reverseJournalEntryForTransaction(existing, actorId);
    }
    await recordAudit({
      actorId,
      actorEmail,
      action: toStatus === "approved" ? "approve" : toStatus === "rejected" ? "reject" : toStatus === "cancelled" ? "cancel" : toStatus === "reversed" ? "reverse" : toStatus === "reconciled" ? "reconcile" : "status_change",
      entity: "transaction",
      entityId: id,
      entityLabel: updated.transactionNumber,
      summary: `status: ${existing.status} → ${toStatus}`,
    });
    const tx = { id, transactionNumber: updated.transactionNumber, amount: updated.amount, currency: updated.currency, createdBy: existing.createdBy, type: String(updated.type), description: updated.description };
    if (toStatus === "pending_approval") await fmsEvents.transactionNeedsApproval(tx, actorId);
    else if (toStatus === "approved" || toStatus === "rejected" || toStatus === "failed" || toStatus === "cancelled") await fmsEvents.transactionDecided(tx, toStatus, actorId);
  }
  return updated;
}
