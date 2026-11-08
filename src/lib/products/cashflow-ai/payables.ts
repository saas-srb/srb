import "server-only";
import { getDb } from "@/lib/mongodb";
import { agingBucketFor, round2 } from "@/lib/products/cashflow-ai/constants";
import { activeDebitNoteTotalsByVendor } from "@/lib/products/cashflow-ai/debit-notes";

/**
 * Accounts Payable reporting (§10) — real aging + vendor-wise views computed
 * from PRMS's real `prms_invoices` (vendor bills) plus FMS's own active
 * debit notes layered on top. Replaces Phase 1's transaction-based
 * approximation. Reads PRMS's collection directly for the aggregation (same
 * precedent as `src/lib/spendiq/pickers.ts` reading `pms_projects`) — never
 * writes to it.
 */

const OPEN_STATUSES = ["pending", "approved", "partially_paid", "overdue"];

interface OpenBillRow {
  _id: string;
  invoiceNumber: string;
  vendorId: string;
  vendorName: string;
  dueDate: string;
  netPayable: number;
  amountPaid: number;
  currency: string;
}

async function openBills(): Promise<OpenBillRow[]> {
  try {
    const db = await getDb();
    return await db
      .collection<OpenBillRow>("prms_invoices")
      .find(
        { status: { $in: OPEN_STATUSES }, deletedAt: null },
        { projection: { invoiceNumber: 1, vendorId: 1, vendorName: 1, dueDate: 1, netPayable: 1, amountPaid: 1, currency: 1 } }
      )
      .toArray();
  } catch {
    return [];
  }
}

function balanceOf(bill: OpenBillRow): number {
  return round2(bill.netPayable - bill.amountPaid);
}

export interface AgingBucket {
  label: string;
  amount: number;
}

export async function payablesAging(): Promise<AgingBucket[]> {
  const bills = await openBills();
  const today = new Date();
  const buckets = new Map<string, number>();
  for (const bill of bills) {
    const balance = balanceOf(bill);
    if (balance <= 0.01) continue;
    const daysOverdue = Math.floor((today.getTime() - new Date(`${bill.dueDate}T00:00:00`).getTime()) / 86400000);
    const label = agingBucketFor(daysOverdue);
    buckets.set(label, round2((buckets.get(label) ?? 0) + balance));
  }
  return Array.from(buckets.entries()).map(([label, amount]) => ({ label, amount }));
}

export interface VendorPayable {
  vendorId: string;
  vendorName: string;
  outstanding: number;
  debitNoteTotal: number;
  billCount: number;
}

export async function vendorWisePayables(): Promise<VendorPayable[]> {
  const [bills, debitTotals] = await Promise.all([openBills(), activeDebitNoteTotalsByVendor()]);
  const byVendor = new Map<string, VendorPayable>();
  for (const bill of bills) {
    const balance = balanceOf(bill);
    if (balance <= 0.01) continue;
    const entry = byVendor.get(bill.vendorId) ?? {
      vendorId: bill.vendorId,
      vendorName: bill.vendorName,
      outstanding: 0,
      debitNoteTotal: debitTotals.get(bill.vendorId) ?? 0,
      billCount: 0,
    };
    entry.outstanding = round2(entry.outstanding + balance);
    entry.billCount += 1;
    byVendor.set(bill.vendorId, entry);
  }
  // Vendors with active debit notes but no open bill still owe that amount.
  for (const [vendorId, total] of debitTotals) {
    if (!byVendor.has(vendorId) && total > 0.01) {
      byVendor.set(vendorId, { vendorId, vendorName: vendorId, outstanding: 0, debitNoteTotal: total, billCount: 0 });
    }
  }
  return Array.from(byVendor.values()).sort(
    (a, b) => b.outstanding + b.debitNoteTotal - (a.outstanding + a.debitNoteTotal)
  );
}

export async function totalOutstandingPayable(): Promise<number> {
  const [bills, debitTotals] = await Promise.all([openBills(), activeDebitNoteTotalsByVendor()]);
  const billTotal = bills.reduce((s, b) => s + balanceOf(b), 0);
  const debitTotal = Array.from(debitTotals.values()).reduce((s, v) => s + v, 0);
  return round2(billTotal + debitTotal);
}

export async function overdueBills(): Promise<{ count: number; amount: number }> {
  const bills = await openBills();
  const today = new Date();
  let count = 0;
  let amount = 0;
  for (const bill of bills) {
    const balance = balanceOf(bill);
    if (balance <= 0.01) continue;
    if (new Date(`${bill.dueDate}T00:00:00`).getTime() < today.getTime()) {
      count += 1;
      amount = round2(amount + balance);
    }
  }
  return { count, amount };
}
