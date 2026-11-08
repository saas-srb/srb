import "server-only";
import {
  searchInvoices as searchPrmsInvoices,
  getInvoice as getPrmsBill,
  type Invoice as PrmsBill,
  type InvoiceFilter as PrmsInvoiceFilter,
} from "@/lib/products/spendiq/invoices";
import { listPaymentsForInvoice, type Payment as PrmsPayment } from "@/lib/products/spendiq/payments";
import { listDebitNotesForBill, activeDebitNoteTotalsByVendor, type DebitNote } from "@/lib/products/cashflow-ai/debit-notes";

/**
 * FMS's "Bills" view (§11 Purchase & PRMS Integration) — a read-only
 * financial reference over PRMS's real vendor bills (`prms_invoices`), the
 * same wrapping pattern Phase 1 used for Vendors. Never writes into PRMS's
 * collection; debit notes are FMS's own additive layer on top (see
 * `debit-notes.ts`).
 */

export interface BillListRow extends PrmsBill {
  outstanding: number;
  debitNoteTotal: number;
}

export async function listBills(
  opts: PrmsInvoiceFilter & { page?: number; pageSize?: number; sortBy?: string; sortDir?: "asc" | "desc" } = {}
): Promise<{ items: BillListRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const result = await searchPrmsInvoices(opts);
  const debitTotals = await activeDebitNoteTotalsByVendor();
  return {
    ...result,
    items: result.items.map((bill) => ({
      ...bill,
      outstanding: Math.round((bill.netPayable - bill.amountPaid) * 100) / 100,
      debitNoteTotal: debitTotals.get(bill.vendorId) ?? 0,
    })),
  };
}

export interface BillDetail {
  bill: PrmsBill;
  payments: PrmsPayment[];
  debitNotes: DebitNote[];
  outstanding: number;
}

export async function getBillDetail(id: string): Promise<BillDetail | null> {
  const bill = await getPrmsBill(id);
  if (!bill) return null;
  const [payments, debitNotes] = await Promise.all([listPaymentsForInvoice(id), listDebitNotesForBill(id)]);
  return {
    bill,
    payments,
    debitNotes,
    outstanding: Math.round((bill.netPayable - bill.amountPaid) * 100) / 100,
  };
}
