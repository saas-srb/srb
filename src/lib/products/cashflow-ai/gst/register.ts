/**
 * The GST sales register, the pure part: a month's outward rows split into B2B and B2C, totals, a rate-wise summary and the plain-English
 * reason for every flag. No threshold is applied (for example the B2C large / small split): the CA decides any further split.
 */
import { addHeads, totalOf, zeroHeads, type Heads, type OutwardFlag, type OutwardRow } from "@/lib/products/cashflow-ai/gst/core";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface RegisterTotals {
  invoices: number;
  taxable: number;
  heads: Heads;
  invoiceValue: number;
}

export interface RegisterRateRow {
  rate: number;
  taxable: number;
  heads: Heads;
}

export interface SalesRegister {
  b2b: OutwardRow[];
  b2c: OutwardRow[];
  totals: RegisterTotals;
  b2bTotals: RegisterTotals;
  b2cTotals: RegisterTotals;
  byRate: RegisterRateRow[];
  attention: { row: OutwardRow; flags: OutwardFlag[] }[];
}

export function totalsOf(rows: OutwardRow[]): RegisterTotals {
  let taxable = 0;
  let value = 0;
  let heads = zeroHeads();
  for (const r of rows) {
    taxable = r2(taxable + r.taxable);
    value = r2(value + r.invoiceValue);
    heads = addHeads(heads, r.heads);
  }
  return { invoices: rows.length, taxable, heads, invoiceValue: value };
}

export function buildSalesRegister(rows: OutwardRow[]): SalesRegister {
  const b2b = rows.filter((r) => r.kind === "b2b");
  const b2c = rows.filter((r) => r.kind === "b2c");
  const byRate = new Map<number, RegisterRateRow>();
  for (const r of rows) {
    for (const l of r.lines) {
      const prev = byRate.get(l.rate);
      byRate.set(l.rate, { rate: l.rate, taxable: r2((prev?.taxable ?? 0) + l.taxable), heads: prev ? addHeads(prev.heads, l.heads) : l.heads });
    }
  }
  return {
    b2b,
    b2c,
    totals: totalsOf(rows),
    b2bTotals: totalsOf(b2b),
    b2cTotals: totalsOf(b2c),
    byRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    attention: rows.filter((r) => r.flags.length > 0).map((row) => ({ row, flags: row.flags })),
  };
}

export const FLAG_TEXT: Record<OutwardFlag, { title: string; explain: string }> = {
  recipient_gstin_invalid: {
    title: "Customer GSTIN looks wrong",
    explain: "The GSTIN saved for this customer is not a valid GSTIN, so the sale is shown as B2C. Correct it on the customer, then it moves to B2B.",
  },
  place_of_supply_unknown: {
    title: "Place of supply not known",
    explain: "The customer has no valid GSTIN or state saved, so we cannot tell where the sale is made. The tax split (CGST and SGST, or IGST) assumes your own state. Add the customer's state on the customer (Billing → State). For an export or a supply to a special economic zone (SEZ), which are not separated here, ask your CA.",
  },
  company_state_unknown: {
    title: "Your own state is not set",
    explain: "Your company's GSTIN or state is missing, so the place of supply and the CGST / SGST / IGST split cannot be worked out reliably. Add them in Settings → Company details.",
  },
  hsn_sac_missing: {
    title: "HSN/SAC code missing",
    explain: "One or more lines have no HSN (goods) or SAC (services) code. GST returns ask for it. Open the invoice, edit it and add the code on each line.",
  },
  foreign_currency: {
    title: "Not in rupees",
    explain: "This invoice is in a foreign currency. It is listed with its original amounts and not converted to rupees, so it is included in the totals as entered. Your CA should decide how to treat it.",
  },
  tax_on_unregistered_inter_state: {
    title: "Tax charged on an out-of-state sale to an unregistered customer",
    explain: "Tax is shown as IGST on a sale to a customer with no GSTIN in another state. Check the customer's state and whether tax should apply, and ask your CA.",
  },
};

export const placeLabel = (p: { code: string; name: string } | null) => (p ? `${p.code}-${p.name}` : "Not known");
export const taxOf = (r: { heads: Heads }) => totalOf(r.heads);
