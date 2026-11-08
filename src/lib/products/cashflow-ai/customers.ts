import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { searchClients, getClient, type Client, type SearchClientsOptions } from "@/lib/products/sprintos/clients";
import { transactionsForCustomer } from "@/lib/products/cashflow-ai/transactions";
import { INVOICES_COLLECTION, listInvoicesForCustomer } from "@/lib/products/cashflow-ai/invoices";

/**
 * FMS's "Customers" view (§9 Accounts Receivable). Per the platform's
 * architecture principle, PMS owns the client master record (`pms_clients`)
 * — FMS never duplicates it. This module re-exports PMS's own client search
 * and layers a financial summary on top, now computed from real
 * `fms_invoices` balances (Phase 2) rather than Phase 1's transaction-status
 * approximation — `totalReceived` = sum of `amountPaid` across the
 * customer's invoices, `totalOutstanding` = sum of open-invoice balances
 * (`total - paid - credited`), `transactionCount` = invoice count.
 */

const OPEN_STATUSES = ["sent", "partially_paid", "overdue"];

export interface CustomerFinancialSummary {
  totalReceived: number;
  totalOutstanding: number;
  transactionCount: number;
}

const EMPTY_SUMMARY: CustomerFinancialSummary = { totalReceived: 0, totalOutstanding: 0, transactionCount: 0 };

async function getFinancialSummaries(customerIds: string[]): Promise<Map<string, CustomerFinancialSummary>> {
  const map = new Map<string, CustomerFinancialSummary>();
  if (customerIds.length === 0) return map;
  try {
    const db = await getDb();
    const rows = await db
      .collection(INVOICES_COLLECTION)
      .aggregate<{ _id: string; amountPaid: number; balance: number; status: string }>([
        { $match: { customerId: { $in: customerIds }, ...notDeleted } },
        {
          $project: {
            customerId: 1,
            amountPaid: 1,
            status: 1,
            balance: { $subtract: ["$totalAmount", { $add: ["$amountPaid", "$amountCredited"] }] },
          },
        },
      ])
      .toArray();
    for (const row of rows as unknown as { customerId: string; amountPaid: number; balance: number; status: string }[]) {
      const entry = map.get(row.customerId) ?? { totalReceived: 0, totalOutstanding: 0, transactionCount: 0 };
      entry.transactionCount += 1;
      entry.totalReceived += row.amountPaid;
      if (OPEN_STATUSES.includes(row.status) && row.balance > 0.01) entry.totalOutstanding += row.balance;
      map.set(row.customerId, entry);
    }
  } catch {
    // Empty/missing collection is a no-op — never break the customers page.
  }
  return map;
}

export interface CustomerListRow extends Client {
  projectCount: number;
  financials: CustomerFinancialSummary;
}

export async function listCustomers(
  opts: SearchClientsOptions = {}
): Promise<{ items: CustomerListRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const result = await searchClients(opts);
  const summaries = await getFinancialSummaries(result.items.map((c) => c._id));
  return {
    ...result,
    items: result.items.map((c) => ({ ...c, financials: summaries.get(c._id) ?? EMPTY_SUMMARY })),
  };
}

export async function getCustomerDetail(id: string) {
  const [client, transactions, invoices] = await Promise.all([
    getClient(id),
    transactionsForCustomer(id),
    listInvoicesForCustomer(id),
  ]);
  if (!client) return null;
  const summaries = await getFinancialSummaries([id]);
  return {
    client,
    financials: summaries.get(id) ?? EMPTY_SUMMARY,
    transactions,
    invoices,
  };
}

export async function totalReceivables(): Promise<number> {
  try {
    const db = await getDb();
    const res = await db
      .collection(INVOICES_COLLECTION)
      .aggregate<{ total: number }>([
        { $match: { status: { $in: OPEN_STATUSES }, ...notDeleted } },
        { $group: { _id: null, total: { $sum: { $subtract: ["$totalAmount", { $add: ["$amountPaid", "$amountCredited"] }] } } } },
      ])
      .toArray();
    return Math.round((res[0]?.total ?? 0) * 100) / 100;
  } catch {
    return 0;
  }
}
