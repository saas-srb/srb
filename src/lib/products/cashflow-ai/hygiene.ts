import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { INVOICES_COLLECTION as BILLS_COLLECTION } from "@/lib/products/spendiq/invoices";
import { RECEIPTS_COLLECTION } from "@/lib/products/cashflow-ai/receipts";
import { EXPENSES_COLLECTION } from "@/lib/products/spendiq/expenses";
import { TRANSACTIONS_COLLECTION } from "@/lib/products/cashflow-ai/transactions";
import { getAccrualSettings, accrualAppliesTo } from "@/lib/products/cashflow-ai/accrual/settings";
import { findDuplicateBills, normalizeInvoiceRef, type BillLite, type DuplicateGroup } from "@/lib/products/cashflow-ai/hygiene-core";

type BillRow = { _id: string; invoiceNumber: string; vendorId: string; vendorName: string; vendorInvoiceNumber: string | null; invoiceDate: string; totalAmount: number; status: string; storageKey: string | null };

async function allBills(): Promise<BillRow[]> {
  const db = await getDb();
  return db.collection<BillRow>(BILLS_COLLECTION).find({ ...notDeleted }, { projection: { invoiceNumber: 1, vendorId: 1, vendorName: 1, vendorInvoiceNumber: 1, invoiceDate: 1, totalAmount: 1, status: 1, storageKey: 1 } }).toArray();
}

/** An existing bill from the same vendor with the same vendor invoice number, if there is one. Used to refuse a second entry of the same bill. */
export async function findExistingBill(vendorId: string, vendorInvoiceNumber: string | null, exceptId?: string): Promise<{ id: string; invoiceNumber: string } | null> {
  const ref = normalizeInvoiceRef(vendorInvoiceNumber);
  if (!ref) return null;
  const bills = await allBills();
  const hit = bills.find((b) => b._id !== exceptId && b.vendorId === vendorId && b.status !== "cancelled" && normalizeInvoiceRef(b.vendorInvoiceNumber) === ref);
  return hit ? { id: hit._id, invoiceNumber: hit.invoiceNumber } : null;
}

export interface CleanupReport {
  billsWithoutDocument: { id: string; invoiceNumber: string; vendorName: string; invoiceDate: string; totalAmount: number }[];
  duplicates: DuplicateGroup[];
  /** Receipts a person recorded (cash, cheque, transfer) that have no proof attached. */
  receiptsWithoutProof: { id: string; receiptNumber: string; customerName: string; date: string; amount: number; method: string }[];
  /** Company expenses (not rejected) with no bill or voucher attached. */
  expensesWithoutBill: { id: string; expenseCode: string; category: string; date: string; totalAmount: number }[];
  unclassified: { id: string; transactionNumber: string; type: string; date: string; amount: number; description: string | null }[];
}

export async function cleanupReport(): Promise<CleanupReport> {
  const db = await getDb();
  const bills = await allBills();
  const live = bills.filter((b) => b.status !== "cancelled");
  const lite: BillLite[] = live.map((b) => ({ id: b._id, vendorId: b.vendorId, vendorName: b.vendorName, vendorInvoiceNumber: b.vendorInvoiceNumber, invoiceDate: b.invoiceDate, totalAmount: b.totalAmount, status: b.status }));
  const accrual = await getAccrualSettings();
  const txns = await db
    .collection<{ _id: string; transactionNumber: string; type: string; transactionDate: Date; amount: number; description: string | null; accrualRole?: string | null; createdAt: Date }>(TRANSACTIONS_COLLECTION)
    .find({ status: { $in: ["completed", "reconciled"] }, type: { $in: ["income", "expense"] }, accountId: null, transferId: null, ...notDeleted })
    .sort({ transactionDate: -1 })
    .limit(500)
    .toArray();
  const receipts = await db
    .collection<{ _id: string; receiptNumber: string; customerName: string; receiptDate: Date; amount: number; method: string; viaGateway?: boolean; notes: string | null; documents?: unknown[] }>(RECEIPTS_COLLECTION)
    .find({ status: { $in: ["completed", "pending_clearance"] }, ...notDeleted })
    .sort({ receiptDate: -1 })
    .limit(2000)
    .toArray();
  // receipts made before the gateway flag existed are recognised by the note the gateway writes
  const isGateway = (r: { viaGateway?: boolean; notes: string | null }) => r.viaGateway === true || (r.notes ?? "").startsWith("Automated payment for ");
  const expenses = await db
    .collection<{ _id: string; expenseCode: string; category: string; expenseDate: Date; totalAmount: number; invoiceStorageKey: string | null; status: string }>(EXPENSES_COLLECTION)
    .find({ status: { $in: ["pending", "approved", "reimbursed"] }, invoiceStorageKey: null, ...notDeleted })
    .sort({ expenseDate: -1 })
    .limit(2000)
    .toArray();
  return {
    receiptsWithoutProof: receipts.filter((r) => !isGateway(r) && !(r.documents && r.documents.length > 0)).map((r) => ({ id: r._id, receiptNumber: r.receiptNumber, customerName: r.customerName, date: r.receiptDate.toISOString().slice(0, 10), amount: r.amount, method: r.method })),
    expensesWithoutBill: expenses.map((e) => ({ id: e._id, expenseCode: e.expenseCode, category: e.category, date: e.expenseDate.toISOString().slice(0, 10), totalAmount: e.totalAmount })),
    billsWithoutDocument: live.filter((b) => !b.storageKey).map((b) => ({ id: b._id, invoiceNumber: b.invoiceNumber, vendorName: b.vendorName, invoiceDate: b.invoiceDate, totalAmount: b.totalAmount })),
    duplicates: findDuplicateBills(lite),
    // under accrual books a receipt or vendor payment settles the receivable / payable: that is its account
    unclassified: txns.filter((t) => !(t.accrualRole && accrualAppliesTo(accrual, t.createdAt))).map((t) => ({ id: t._id, transactionNumber: t.transactionNumber, type: t.type, date: t.transactionDate.toISOString().slice(0, 10), amount: t.amount, description: t.description })),
  };
}
