/**
 * CSV of a month's purchases for the CA, the pure part. It prepares data only; nothing is filed. Text is quoted as RFC 4180 asks and
 * any text that a spreadsheet would run as a formula (starts with = + - @, or a tab / carriage return) gets a leading apostrophe,
 * so a vendor invoice number such as "=HYPERLINK(...)" is shown, never executed. Numbers are ours and are written as plain amounts.
 */
import { carriesGst, decisionLabel } from "@/lib/products/cashflow-ai/gst/purchases-core";
import type { InwardRow } from "@/lib/products/cashflow-ai/gst/core";

export const PURCHASES_CSV_HEADER = ["Vendor GSTIN", "Vendor invoice number", "Date", "Taxable value", "IGST", "CGST", "SGST", "Input credit decision", "Note"];

/** Text that a spreadsheet could read as a formula. */
export function neutraliseFormula(v: string): string {
  return /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

/** One RFC 4180 field: quoted when it holds a comma, quote, or line break, with quotes doubled. */
export function csvField(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export const csvText = (v: string | null | undefined) => csvField(neutraliseFormula(v ?? ""));
const amount = (n: number) => n.toFixed(2);

export function buildPurchasesCsv(rows: InwardRow[], notes: ReadonlyMap<string, string> = new Map()): string {
  const lines = [PURCHASES_CSV_HEADER.map(csvField).join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvText(r.vendorGstin),
        csvText(r.vendorInvoiceNumber),
        csvText(r.invoiceDate),
        amount(r.taxable),
        amount(r.heads.igst),
        amount(r.heads.cgst),
        amount(r.heads.sgst),
        // a bill with no GST has no credit to decide on
        carriesGst(r) ? csvText(decisionLabel(r.decision)) : "",
        csvText(notes.get(r.billId)),
      ].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
