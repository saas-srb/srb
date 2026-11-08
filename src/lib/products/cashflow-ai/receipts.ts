import { fmsEvents } from "@/lib/notify/triggers/fms";
import "server-only";
import { getDb } from "@/lib/mongodb";
import { escapeRegExp } from "@/lib/text-search";
import { newId, createStamp, updateStamp, notDeleted, nextYearSequence, formatYearCode, type AuditFields } from "@/lib/products/cashflow-ai/db";
import { DEFAULT_CURRENCY, round2, type PaymentMethod, type FundAccountType } from "@/lib/products/cashflow-ai/constants";
import { getInvoice, applyReceiptToInvoice, invoiceBalance, type Invoice } from "@/lib/products/cashflow-ai/invoices";
import { checkReceiptRules } from "@/lib/products/cashflow-ai/receipt-rules";
import { listBankAccounts } from "@/lib/products/cashflow-ai/bank-accounts";
import { listCashAccounts } from "@/lib/products/cashflow-ai/cash-accounts";
import type { StoredAttachment } from "@/lib/products/cashflow-ai/attachment-storage";
import { recordAudit } from "@/lib/products/cashflow-ai/audit";
import { getAccrualSettings } from "@/lib/products/cashflow-ai/accrual/settings";
import { postingBlocked, syncReceiptTdsAccrual, trySync } from "@/lib/products/cashflow-ai/accrual/posting";
import { postSystemTransaction, changeTransactionStatus } from "@/lib/products/cashflow-ai/transactions";

/**
 * Payment receipts (§8) — money received from a customer, applied against
 * one or more outstanding invoices (multi-invoice allocation), with any
 * leftover tracked as an unallocated advance. Every recorded receipt posts a
 * linked, already-`completed` `fms_transaction` via `postSystemTransaction`
 * (a receipt is a record of money that already moved, not a proposal).
 */

export const RECEIPTS_COLLECTION = "fms_receipts";
const RECEIPT_NUMBER_PREFIX = "REC";

export interface ReceiptAllocation {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export interface Receipt extends AuditFields {
  _id: string;
  receiptNumber: string;
  customerId: string;
  customerName: string;
  receiptDate: Date;
  amount: number;
  method: PaymentMethod;
  transactionReference: string | null;
  allocations: ReceiptAllocation[];
  /** `amount` minus the sum of `allocations` — an unapplied advance. */
  advanceAmount: number;
  currency: string;
  /** "pending_clearance": a cheque received but not yet cleared by the bank (nothing is applied or booked yet); "bounced": it did not clear. */
  status: "completed" | "voided" | "pending_clearance" | "bounced";
  chequeNumber?: string | null;
  chequeDate?: string | null;
  chequeBank?: string | null;
  clearedAt?: Date | null;
  bounceReason?: string | null;
  transactionId: string | null;
  notes: string | null;
  /** Income tax the customer deducted before paying (TDS). The invoices are settled by the money received plus this. */
  tdsDeducted?: number;
  tdsSection?: string | null;
  /** True for a payment that arrived through Razorpay: the gateway is its proof. */
  viaGateway?: boolean;
  /** Proof the money arrived: bank advice, cheque image, deposit slip. Added after the fact and never removed. */
  documents?: StoredAttachment[];
}

export interface SerializedReceipt extends Omit<Receipt, "createdAt" | "updatedAt" | "deletedAt" | "receiptDate"> {
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  receiptDate: string;
}

export function serializeReceipt(r: Receipt): SerializedReceipt {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    deletedAt: r.deletedAt ? r.deletedAt.toISOString() : null,
    receiptDate: r.receiptDate.toISOString().slice(0, 10),
  };
}

let indexesEnsured = false;
async function getCollection() {
  const db = await getDb();
  const collection = db.collection<Receipt>(RECEIPTS_COLLECTION);
  if (!indexesEnsured) {
    indexesEnsured = true;
    await Promise.all([
      collection.createIndex({ receiptNumber: 1 }, { unique: true }).catch(() => {}),
      collection.createIndex({ customerId: 1 }).catch(() => {}),
      collection.createIndex({ "allocations.invoiceId": 1 }).catch(() => {}),
      collection.createIndex({ receiptDate: -1 }).catch(() => {}),
    ]);
  }
  return collection;
}

export async function generateReceiptNumber(year = new Date().getFullYear()): Promise<string> {
  const seq = await nextYearSequence(RECEIPT_NUMBER_PREFIX, year);
  return formatYearCode(RECEIPT_NUMBER_PREFIX, year, seq);
}

export async function getReceipt(id: string): Promise<Receipt | null> {
  const collection = await getCollection();
  return collection.findOne({ _id: id, ...notDeleted });
}

export const MAX_RECEIPT_DOCUMENTS = 10;

/** Adds a proof document to a receipt. Documents are evidence, so they can be added but not removed. */
export async function addReceiptDocument(
  id: string,
  stored: StoredAttachment,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const collection = await getCollection();
  const receipt = await collection.findOne({ _id: id, ...notDeleted });
  if (!receipt) return { ok: false, error: "Receipt not found." };
  if ((receipt.documents?.length ?? 0) >= MAX_RECEIPT_DOCUMENTS) return { ok: false, error: `A receipt can hold at most ${MAX_RECEIPT_DOCUMENTS} documents.` };
  // the count is re-checked in the update itself so two uploads at once cannot pass the limit
  const res = await collection.updateOne(
    { _id: id, ...notDeleted, [`documents.${MAX_RECEIPT_DOCUMENTS - 1}`]: { $exists: false } },
    { $push: { documents: stored }, $set: updateStamp(actorId) }
  );
  if (res.modifiedCount !== 1) return { ok: false, error: `A receipt can hold at most ${MAX_RECEIPT_DOCUMENTS} documents.` };
  await recordAudit({ actorId, actorEmail, action: "update", entity: "receipt", entityId: id, entityLabel: receipt.receiptNumber, summary: `proof added: ${stored.filename}` });
  return { ok: true };
}

export async function getReceiptByNumber(receiptNumber: string): Promise<Receipt | null> {
  const collection = await getCollection();
  return collection.findOne({ receiptNumber, ...notDeleted });
}

export async function listReceiptsForCustomer(customerId: string, limit = 200): Promise<Receipt[]> {
  const collection = await getCollection();
  return collection.find({ customerId, ...notDeleted }).sort({ receiptDate: -1 }).limit(limit).toArray();
}

export async function listReceiptsForInvoice(invoiceId: string): Promise<Receipt[]> {
  const collection = await getCollection();
  return collection.find({ "allocations.invoiceId": invoiceId, ...notDeleted }).sort({ receiptDate: -1 }).toArray();
}

export interface ReceiptFilter {
  search?: string;
  customerId?: string;
  status?: Receipt["status"];
}

function buildFilter(opts: ReceiptFilter): Record<string, unknown> {
  const filter: Record<string, unknown> = { ...notDeleted };
  if (opts.search?.trim()) {
    const rx = new RegExp(escapeRegExp(opts.search.trim()), "i");
    filter.$or = [{ receiptNumber: rx }, { customerName: rx }, { transactionReference: rx }];
  }
  if (opts.customerId) filter.customerId = opts.customerId;
  if (opts.status) filter.status = opts.status;
  return filter;
}

export async function searchReceipts(
  opts: ReceiptFilter & { page?: number; pageSize?: number; sortBy?: "receiptDate" | "amount"; sortDir?: "asc" | "desc" } = {}
) {
  const collection = await getCollection();
  const page = Math.max(opts.page ?? 1, 1);
  const pageSize = Math.min(Math.max(opts.pageSize ?? 20, 1), 100);
  const filter = buildFilter(opts);
  const sortField = opts.sortBy ?? "receiptDate";
  const sortDir = opts.sortDir === "asc" ? 1 : -1;
  const [items, total] = await Promise.all([
    collection.find(filter).sort({ [sortField]: sortDir }).skip((page - 1) * pageSize).limit(pageSize).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items, total, page, pageSize, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

export interface RecordReceiptData {
  customerId: string;
  customerName: string;
  receiptDate: string;
  amount: number;
  method: PaymentMethod;
  transactionReference: string | null;
  allocations: { invoiceId: string; amount: number }[];
  currency: string;
  fundAccountId?: string | null;
  fundAccountType?: FundAccountType | null;
  chequeNumber?: string | null;
  chequeDate?: string | null;
  chequeBank?: string | null;
  /** Made by the Razorpay checkout (the gateway has already proved the money arrived), not entered by hand. */
  viaGateway?: boolean;
  tdsDeducted?: number;
  tdsSection?: string | null;
  notes: string | null;
}

export async function recordReceipt(
  data: RecordReceiptData,
  actorId: string,
  actorEmail: string | null
): Promise<{ ok: true; receipt: Receipt } | { ok: false; reason: string }> {
  const amount = round2(data.amount);
  if (amount <= 0) return { ok: false, reason: "Enter a receipt amount." };

  const tds = round2(data.tdsDeducted ?? 0);
  if (!Number.isFinite(tds) || tds < 0) return { ok: false, reason: "TDS deducted cannot be negative." };
  if (tds > 0) {
    if (data.viaGateway) return { ok: false, reason: "A Razorpay payment carries no customer TDS." };
    const tdsBlocked = await postingBlocked(data.receiptDate);
    if (tdsBlocked) return { ok: false, reason: tdsBlocked };
    if (!(await getAccrualSettings())) return { ok: false, reason: "To record TDS deducted by a customer, switch on accrual books first (Settings → Accrual books): the tax credit has to be booked against the invoice." };
  }
  const allocatedTotal = round2(data.allocations.reduce((s, a) => s + a.amount, 0));
  if (allocatedTotal > round2(amount + tds) + 0.01) {
    return { ok: false, reason: tds > 0 ? "The invoices settled cannot exceed the money received plus the TDS deducted." : "Allocated amount cannot exceed the receipt total." };
  }

  const invoices: Invoice[] = [];
  for (const alloc of data.allocations) {
    if (alloc.amount <= 0) continue;
    const inv = await getInvoice(alloc.invoiceId);
    if (!inv) return { ok: false, reason: "One of the selected invoices was not found." };
    if (inv.customerId !== data.customerId) return { ok: false, reason: `${inv.invoiceNumber} does not belong to this customer.` };
    if (inv.status === "cancelled" || inv.status === "void") return { ok: false, reason: `${inv.invoiceNumber} is ${inv.status}: a payment cannot be applied to it.` };
    // a draft invoice that this payment issues has to be posted too: it must not fall in a closed period
    if (inv.status === "draft") {
      const blocked = await postingBlocked(inv.invoiceDate);
      if (blocked) return { ok: false, reason: `${inv.invoiceNumber}: ${blocked}` };
    }
    const outstanding = invoiceBalance(inv);
    if (alloc.amount > outstanding + 0.01) {
      return { ok: false, reason: `Allocation to ${inv.invoiceNumber} (${alloc.amount}) exceeds its outstanding balance (${outstanding}).` };
    }
    invoices.push(inv);
  }

  const collection = await getCollection();
  const isCheque = data.method === "cheque" && !data.viaGateway;

  // Rules for a payment that did not come through the gateway: cash limit, cheque details, the bank's reference.
  const cashToday = data.method === "cash"
    ? (await collection.find({ customerId: data.customerId, method: "cash", receiptDate: new Date(`${data.receiptDate}T00:00:00`), status: { $in: ["completed", "pending_clearance"] }, ...notDeleted }).toArray()).reduce((n, r) => n + r.amount, 0)
    : 0;
  const broken = data.viaGateway ? null : checkReceiptRules({ method: data.method, amount, currency: data.currency || DEFAULT_CURRENCY, receiptDate: data.receiptDate, reference: data.transactionReference, chequeNumber: data.chequeNumber, chequeDate: data.chequeDate, chequeBank: data.chequeBank, cashToday });
  if (broken) return { ok: false, reason: broken };
  // The money has to land somewhere: if the company has accounts, say which one.
  if (!data.fundAccountId && !data.viaGateway) {
    const [banks, cash] = await Promise.all([listBankAccounts({ status: "active" }), listCashAccounts()]);
    if (banks.length + cash.length > 0) return { ok: false, reason: isCheque ? "Choose the bank account the cheque will be deposited in." : data.method === "cash" ? "Choose the cash account the money was put in." : "Choose the bank account the money was received in." };
  }
  // The same payment is not recorded twice.
  if (isCheque) {
    if (await collection.findOne({ chequeNumber: data.chequeNumber!.trim(), chequeBank: data.chequeBank!.trim(), status: { $in: ["completed", "pending_clearance"] }, ...notDeleted })) return { ok: false, reason: "This cheque is already recorded." };
  } else if (!data.viaGateway && data.method !== "cash" && data.transactionReference?.trim()) {
    if (await collection.findOne({ transactionReference: data.transactionReference.trim(), amount, status: { $in: ["completed", "pending_clearance"] }, ...notDeleted })) return { ok: false, reason: "A receipt with this bank reference and amount is already recorded." };
  }

  const receiptDate = new Date(`${data.receiptDate}T00:00:00`);
  const doc: Receipt = {
    _id: newId(),
    receiptNumber: await generateReceiptNumber(receiptDate.getFullYear()),
    customerId: data.customerId,
    customerName: data.customerName,
    receiptDate,
    amount,
    method: data.method,
    transactionReference: data.transactionReference,
    allocations: invoices
      .map((inv) => {
        const alloc = data.allocations.find((a) => a.invoiceId === inv._id)!;
        return { invoiceId: inv._id, invoiceNumber: inv.invoiceNumber, amount: round2(alloc.amount) };
      })
      .filter((a) => a.amount > 0),
    advanceAmount: round2(amount + tds - allocatedTotal),
    ...(tds > 0 ? { tdsDeducted: tds, tdsSection: data.tdsSection?.trim().slice(0, 20) || null } : {}),
    currency: data.currency || DEFAULT_CURRENCY,
    status: isCheque ? "pending_clearance" : "completed",
    transactionId: null,
    notes: data.notes,
    ...(data.viaGateway ? { viaGateway: true } : {}),
    ...(isCheque ? { chequeNumber: data.chequeNumber!.trim(), chequeDate: data.chequeDate!, chequeBank: data.chequeBank!.trim() } : {}),
    ...createStamp(actorId),
  };

  // A cheque is only a promise until the bank clears it: nothing is applied to the invoices or booked until then (see `clearCheque`).
  if (isCheque) {
    (doc as Receipt & { fundAccountId?: string | null; fundAccountType?: FundAccountType | null }).fundAccountId = data.fundAccountId ?? null;
    (doc as Receipt & { fundAccountType?: FundAccountType | null }).fundAccountType = data.fundAccountType ?? null;
    await collection.insertOne(doc);
    return { ok: true, receipt: doc };
  }

  for (const alloc of doc.allocations) {
    await applyReceiptToInvoice(alloc.invoiceId, alloc.amount, actorId);
  }

  const txn = await postSystemTransaction(
    {
      type: "income",
      accrualRole: "receivable",
      transactionDate: receiptDate,
      postingDate: receiptDate,
      amount,
      currency: doc.currency,
      paymentMethod: data.method,
      sourceModule: "fms",
      sourceRecordId: doc._id,
      customerId: data.customerId,
      vendorId: null,
      employeeId: null,
      projectId: null,
      department: null,
      accountId: null,
      fundAccountId: data.fundAccountId ?? null,
      fundAccountType: data.fundAccountType ?? null,
      taxAmount: 0,
      referenceNumber: data.transactionReference,
      description: `Receipt ${doc.receiptNumber} from ${data.customerName}`,
      attachments: [],
    },
    actorId,
    actorEmail
  );
  if ("ok" in txn) return txn;
  doc.transactionId = txn._id;

  await collection.insertOne(doc);
  if (doc.status === "completed" && tds > 0) await trySync(() => syncReceiptTdsAccrual(doc._id, { id: actorId, email: actorEmail }));

  // Wallet & Credits: a real receipt is the "first payment" qualifying event for a pending referral. Best-effort; never affects the receipt.
  try {
    const { qualifyReferralForRecord } = await import("@/lib/wallet/referrals");
    await qualifyReferralForRecord({ clientId: data.customerId });
  } catch {
    /* non-blocking */
  }

  await fmsEvents.receiptRecorded({ id: doc._id, receiptNumber: doc.receiptNumber, customerName: doc.customerName, amount: doc.amount, currency: doc.currency, method: String(doc.method ?? "") }, actorId);
  return { ok: true, receipt: doc };
}

/** Reverses every allocation and the linked transaction. Used to correct a mis-entered receipt. */
export async function voidReceipt(id: string, actorId: string): Promise<{ ok: boolean; reason?: string }> {
  const collection = await getCollection();
  const receipt = await collection.findOne({ _id: id, ...notDeleted });
  if (!receipt) return { ok: false, reason: "Receipt not found." };
  if (receipt.status === "voided") return { ok: true };
  // A receipt booked before accrual books started went to income, not to the receivable: taking it back here would reopen the invoice
  // without reopening the receivable. Correct it with a credit note or a journal from the CA.
  if (receipt.status === "completed") {
    const settings = await getAccrualSettings();
    if (settings && receipt.createdAt.getTime() < settings.activatedAt.getTime()) {
      return { ok: false, reason: "This receipt was recorded before accrual books were switched on, so it cannot be voided here. Ask your CA to correct it." };
    }
  }

  // A cheque that never cleared (or bounced) applied nothing and booked nothing, so there is nothing to take back.
  if (receipt.status === "completed") {
    for (const alloc of receipt.allocations) {
      await applyReceiptToInvoice(alloc.invoiceId, -alloc.amount, actorId);
    }
    if (receipt.transactionId) {
      await changeTransactionStatus(receipt.transactionId, "reversed", actorId, null);
    }
  }
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status: "voided", ...updateStamp(actorId) } });
  await trySync(() => syncReceiptTdsAccrual(id, { id: actorId, email: null }));
  await fmsEvents.receiptVoided({ id: receipt._id, receiptNumber: receipt.receiptNumber, customerName: receipt.customerName, amount: receipt.amount, currency: receipt.currency }, actorId);
  return { ok: true };
}

/** The bank has cleared the cheque: only now is the money applied to the invoices and booked to the account it was deposited in. */
export async function clearCheque(id: string, clearedOn: string, actorId: string, actorEmail: string | null): Promise<{ ok: true } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const r = (await collection.findOne({ _id: id, ...notDeleted })) as (Receipt & { fundAccountId?: string | null; fundAccountType?: FundAccountType | null }) | null;
  if (!r) return { ok: false, reason: "Receipt not found." };
  if (r.status !== "pending_clearance") return { ok: false, reason: `This cheque is ${r.status.replace("_", " ")}, not waiting for clearance.` };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clearedOn)) return { ok: false, reason: "Enter the date the cheque cleared." };
  if (clearedOn > new Date().toISOString().slice(0, 10)) return { ok: false, reason: "The clearing date cannot be in the future." };

  for (const alloc of r.allocations) {
    const inv = await getInvoice(alloc.invoiceId);
    if (!inv) return { ok: false, reason: `Invoice ${alloc.invoiceNumber} no longer exists.` };
    if (alloc.amount > invoiceBalance(inv) + 0.01) return { ok: false, reason: `${alloc.invoiceNumber} has been paid in the meantime: its balance is now less than this cheque's share. Bounce or void the cheque, or record it again against the right invoice.` };
  }
  if ((r as { tdsDeducted?: number }).tdsDeducted) {
    const blocked = await postingBlocked(clearedOn);
    if (blocked) return { ok: false, reason: blocked };
  }
  const date = new Date(`${clearedOn}T00:00:00`);
  const txn = await postSystemTransaction(
    {
      type: "income", accrualRole: "receivable", transactionDate: date, postingDate: date, amount: r.amount, currency: r.currency, paymentMethod: "cheque", sourceModule: "fms", sourceRecordId: r._id,
      customerId: r.customerId, vendorId: null, employeeId: null, projectId: null, department: null, accountId: null,
      fundAccountId: r.fundAccountId ?? null, fundAccountType: r.fundAccountType ?? null, taxAmount: 0,
      referenceNumber: `Cheque ${r.chequeNumber}`, description: `Receipt ${r.receiptNumber} from ${r.customerName} (cheque ${r.chequeNumber}, ${r.chequeBank})`, attachments: [],
    },
    actorId,
    actorEmail,
  );
  if ("ok" in txn) return txn;
  for (const alloc of r.allocations) await applyReceiptToInvoice(alloc.invoiceId, alloc.amount, actorId);
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status: "completed", transactionId: txn._id, clearedAt: date, ...updateStamp(actorId) } });
  await trySync(() => syncReceiptTdsAccrual(id, { id: actorId, email: actorEmail }));
  try {
    const { qualifyReferralForRecord } = await import("@/lib/wallet/referrals");
    await qualifyReferralForRecord({ clientId: r.customerId });
  } catch {
    /* non-blocking */
  }
  await fmsEvents.receiptRecorded({ id: r._id, receiptNumber: r.receiptNumber, customerName: r.customerName, amount: r.amount, currency: r.currency, method: "cheque" }, actorId);
  return { ok: true };
}

/** The cheque bounced: nothing was applied or booked, the invoices stay unpaid, and the reason is kept. */
export async function bounceCheque(id: string, reason: string, actorId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const collection = await getCollection();
  const r = await collection.findOne({ _id: id, ...notDeleted });
  if (!r) return { ok: false, reason: "Receipt not found." };
  if (r.status !== "pending_clearance") return { ok: false, reason: `This cheque is ${r.status.replace("_", " ")}, not waiting for clearance.` };
  if (!reason.trim()) return { ok: false, reason: "Say why it bounced (for example insufficient funds), so the customer can be asked for another payment." };
  await collection.updateOne({ _id: id, ...notDeleted }, { $set: { status: "bounced", bounceReason: reason.trim().slice(0, 300), ...updateStamp(actorId) } });
  return { ok: true };
}
