import "server-only";
import { getDb } from "@/lib/mongodb";
import { searchVendors, getVendor, type Vendor, type SearchVendorsOptions } from "@/lib/products/spendiq/vendors";
import { transactionsForVendor } from "@/lib/products/cashflow-ai/transactions";
import { activeDebitNoteTotalsByVendor } from "@/lib/products/cashflow-ai/debit-notes";

/**
 * FMS's "Vendors" view (§10 Accounts Payable). PRMS owns the vendor master
 * record (`prms_vendors`) — FMS never duplicates it. This module re-exports
 * PRMS's own vendor search and layers a financial summary on top, now
 * computed from PRMS's real `prms_invoices` (vendor bills, Phase 2) plus
 * FMS's own active debit notes, rather than Phase 1's transaction-status
 * approximation. `totalPaid` = sum of `amountPaid` across the vendor's
 * bills, `totalOutstanding` = open-bill balances + active debit notes,
 * `transactionCount` = bill count.
 */

const OPEN_STATUSES = ["pending", "approved", "partially_paid", "overdue"];

export interface VendorFinancialSummary {
  totalPaid: number;
  totalOutstanding: number;
  transactionCount: number;
}

const EMPTY_SUMMARY: VendorFinancialSummary = { totalPaid: 0, totalOutstanding: 0, transactionCount: 0 };

async function getFinancialSummaries(vendorIds: string[]): Promise<Map<string, VendorFinancialSummary>> {
  const map = new Map<string, VendorFinancialSummary>();
  if (vendorIds.length === 0) return map;
  try {
    const db = await getDb();
    const rows = await db
      .collection("prms_invoices")
      .aggregate<{ vendorId: string; amountPaid: number; balance: number; status: string }>([
        { $match: { vendorId: { $in: vendorIds }, deletedAt: null } },
        {
          $project: {
            vendorId: 1,
            amountPaid: 1,
            status: 1,
            balance: { $subtract: ["$netPayable", "$amountPaid"] },
          },
        },
      ])
      .toArray();
    for (const row of rows) {
      const entry = map.get(row.vendorId) ?? { totalPaid: 0, totalOutstanding: 0, transactionCount: 0 };
      entry.transactionCount += 1;
      entry.totalPaid += row.amountPaid;
      if (OPEN_STATUSES.includes(row.status) && row.balance > 0.01) entry.totalOutstanding += row.balance;
      map.set(row.vendorId, entry);
    }

    const debitTotals = await activeDebitNoteTotalsByVendor();
    for (const [vendorId, total] of debitTotals) {
      if (!vendorIds.includes(vendorId)) continue;
      const entry = map.get(vendorId) ?? { totalPaid: 0, totalOutstanding: 0, transactionCount: 0 };
      entry.totalOutstanding += total;
      map.set(vendorId, entry);
    }
  } catch {
    // Empty/missing collection is a no-op — never break the vendors page.
  }
  return map;
}

export interface VendorListRow extends Vendor {
  financials: VendorFinancialSummary;
}

export async function listVendors(
  opts: SearchVendorsOptions = {}
): Promise<{ items: VendorListRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const result = await searchVendors(opts);
  const summaries = await getFinancialSummaries(result.items.map((v) => v._id));
  return {
    ...result,
    items: result.items.map((v) => ({ ...v, financials: summaries.get(v._id) ?? EMPTY_SUMMARY })),
  };
}

export async function getVendorDetail(id: string) {
  const [vendor, transactions] = await Promise.all([getVendor(id), transactionsForVendor(id)]);
  if (!vendor) return null;
  const summaries = await getFinancialSummaries([id]);
  return {
    vendor,
    financials: summaries.get(id) ?? EMPTY_SUMMARY,
    transactions,
  };
}

export async function totalPayables(): Promise<number> {
  try {
    const db = await getDb();
    const [billsRes, debitTotals] = await Promise.all([
      db
        .collection("prms_invoices")
        .aggregate<{ total: number }>([
          { $match: { status: { $in: OPEN_STATUSES }, deletedAt: null } },
          { $group: { _id: null, total: { $sum: { $subtract: ["$netPayable", "$amountPaid"] } } } },
        ])
        .toArray(),
      activeDebitNoteTotalsByVendor(),
    ]);
    const billTotal = billsRes[0]?.total ?? 0;
    const debitTotal = Array.from(debitTotals.values()).reduce((s, v) => s + v, 0);
    return Math.round((billTotal + debitTotal) * 100) / 100;
  } catch {
    return 0;
  }
}
