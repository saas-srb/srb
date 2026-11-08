import "server-only";
import { getDb } from "@/lib/mongodb";
import { notDeleted } from "@/lib/products/cashflow-ai/db";
import { agingBucketFor, round2 } from "@/lib/products/cashflow-ai/constants";
import { INVOICES_COLLECTION } from "@/lib/products/cashflow-ai/invoices";

/**
 * Accounts Receivable reporting (§9) — real aging + customer-wise views
 * computed directly from `fms_invoices` balances (`total - paid - credited`).
 * Replaces Phase 1's transaction-based approximation.
 */

const OPEN_STATUSES = ["sent", "partially_paid", "overdue"];

interface OpenInvoiceRow {
  _id: string;
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  amountCredited: number;
  currency: string;
}

async function openInvoices(): Promise<OpenInvoiceRow[]> {
  try {
    const db = await getDb();
    return await db
      .collection<OpenInvoiceRow>(INVOICES_COLLECTION)
      .find(
        { status: { $in: OPEN_STATUSES }, ...notDeleted },
        {
          projection: {
            invoiceNumber: 1,
            customerId: 1,
            customerName: 1,
            dueDate: 1,
            totalAmount: 1,
            amountPaid: 1,
            amountCredited: 1,
            currency: 1,
          },
        }
      )
      .toArray();
  } catch {
    return [];
  }
}

function balanceOf(inv: OpenInvoiceRow): number {
  return round2(inv.totalAmount - inv.amountPaid - inv.amountCredited);
}

export interface AgingBucket {
  label: string;
  amount: number;
}

export async function receivablesAging(): Promise<AgingBucket[]> {
  const invoices = await openInvoices();
  const today = new Date();
  const buckets = new Map<string, number>();
  for (const inv of invoices) {
    const balance = balanceOf(inv);
    if (balance <= 0.01) continue;
    const daysOverdue = Math.floor((today.getTime() - new Date(`${inv.dueDate}T00:00:00`).getTime()) / 86400000);
    const label = agingBucketFor(daysOverdue);
    buckets.set(label, round2((buckets.get(label) ?? 0) + balance));
  }
  return Array.from(buckets.entries()).map(([label, amount]) => ({ label, amount }));
}

export interface CustomerReceivable {
  customerId: string;
  customerName: string;
  outstanding: number;
  invoiceCount: number;
}

export async function customerWiseReceivables(): Promise<CustomerReceivable[]> {
  const invoices = await openInvoices();
  const byCustomer = new Map<string, CustomerReceivable>();
  for (const inv of invoices) {
    const balance = balanceOf(inv);
    if (balance <= 0.01) continue;
    const entry = byCustomer.get(inv.customerId) ?? {
      customerId: inv.customerId,
      customerName: inv.customerName,
      outstanding: 0,
      invoiceCount: 0,
    };
    entry.outstanding = round2(entry.outstanding + balance);
    entry.invoiceCount += 1;
    byCustomer.set(inv.customerId, entry);
  }
  return Array.from(byCustomer.values()).sort((a, b) => b.outstanding - a.outstanding);
}

export async function totalOutstandingInvoices(): Promise<{ count: number; amount: number }> {
  const invoices = await openInvoices();
  let count = 0;
  let amount = 0;
  for (const inv of invoices) {
    const balance = balanceOf(inv);
    if (balance > 0.01) {
      count += 1;
      amount = round2(amount + balance);
    }
  }
  return { count, amount };
}

export async function overdueInvoices(): Promise<{ count: number; amount: number }> {
  const invoices = await openInvoices();
  const today = new Date();
  let count = 0;
  let amount = 0;
  for (const inv of invoices) {
    const balance = balanceOf(inv);
    if (balance <= 0.01) continue;
    if (new Date(`${inv.dueDate}T00:00:00`).getTime() < today.getTime()) {
      count += 1;
      amount = round2(amount + balance);
    }
  }
  return { count, amount };
}

/** Open invoices whose due date falls between today and `days` days ahead (still unpaid). */
export async function invoicesDueWithin(days: number): Promise<{ count: number; amount: number }> {
  const invoices = await openInvoices();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + days * 86_400_000);
  let count = 0;
  let amount = 0;
  for (const inv of invoices) {
    const balance = balanceOf(inv);
    if (balance <= 0.01) continue;
    const due = new Date(`${inv.dueDate}T00:00:00`).getTime();
    if (due >= start.getTime() && due <= end.getTime()) {
      count += 1;
      amount = round2(amount + balance);
    }
  }
  return { count, amount };
}
