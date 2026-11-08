import { round2 } from "@/lib/products/cashflow-ai/constants";

/**
 * FMS's own line-item pricing convention (§7 Invoice Management). Mirrors
 * the proration algorithm in `src/lib/spendiq/purchase-orders.ts`'s
 * `priceItems()` exactly (per-line discount-adjusted tax via a subtotal
 * ratio), renamed from PRMS's GST-specific fields to a generic `taxRate`/
 * `taxAmount` since FMS invoices aren't limited to GST-only line items.
 */

export interface FmsLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  /** Pre-tax line total. */
  lineTotal: number;
  taxAmount: number;
  /** HSN / SAC code, when entered (needed for GST returns). Older invoices have none. */
  hsnSac?: string | null;
}

export interface FmsLineItemInput {
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  hsnSac?: string | null;
}

export interface PricedItems {
  items: FmsLineItem[];
  subtotal: number;
  discount: number;
  taxableAmount: number;
  taxAmount: number;
  totalAmount: number;
}

export function priceLineItems(items: FmsLineItemInput[], discount: number): PricedItems {
  const priced: FmsLineItem[] = items.map((it) => ({
    description: it.description,
    quantity: it.quantity,
    unitPrice: round2(it.unitPrice),
    taxRate: Number.isFinite(it.taxRate) ? it.taxRate : 0,
    lineTotal: round2(it.quantity * it.unitPrice),
    taxAmount: 0,
    ...(it.hsnSac?.trim() ? { hsnSac: it.hsnSac.trim() } : {}),
  }));

  const subtotal = round2(priced.reduce((s, it) => s + it.lineTotal, 0));
  const disc = round2(Math.min(Math.max(discount, 0), subtotal));
  const taxableAmount = round2(subtotal - disc);
  const ratio = subtotal > 0 ? taxableAmount / subtotal : 0;

  let taxAmount = 0;
  for (const it of priced) {
    it.taxAmount = round2(it.lineTotal * ratio * (it.taxRate / 100));
    taxAmount += it.taxAmount;
  }
  taxAmount = round2(taxAmount);

  return {
    items: priced,
    subtotal,
    discount: disc,
    taxableAmount,
    taxAmount,
    totalAmount: round2(taxableAmount + taxAmount),
  };
}
