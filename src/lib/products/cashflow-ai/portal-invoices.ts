import "server-only";
import { listInvoicesForCustomer } from "@/lib/products/cashflow-ai/invoices";
import { invoiceBalance, formatMoney, getInvoiceStatusMeta } from "@/lib/products/cashflow-ai/constants";

/**
 * Thin, portal-safe read of real FMS invoices for a client (§51 Phase 6).
 * Keeps `fms/invoices.ts`'s full CRUD/internal-fields surface out of what
 * portal code imports — a client only ever needs this minimal shape, never
 * `createInvoice`/`updateInvoice`/etc.
 */

export interface PortalInvoice {
  invoiceNumber: string;
  status: string;
  statusLabel: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: number;
  amountPaid: number;
  balance: number;
  currency: string;
  formattedTotal: string;
  formattedBalance: string;
}

export async function listPortalInvoicesForClient(clientId: string, limit = 50): Promise<PortalInvoice[]> {
  const invoices = await listInvoicesForCustomer(clientId, limit);
  return invoices
    .filter((inv) => inv.status !== "void" && inv.status !== "draft")
    .map((inv) => {
      const balance = invoiceBalance(inv);
      return {
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        statusLabel: getInvoiceStatusMeta(inv.status).label,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount,
        amountPaid: inv.amountPaid,
        balance,
        currency: inv.currency,
        formattedTotal: formatMoney(inv.totalAmount, inv.currency),
        formattedBalance: formatMoney(balance, inv.currency),
      };
    });
}
