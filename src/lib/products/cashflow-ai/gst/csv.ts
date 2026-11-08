/**
 * CSV of the sales register, for pasting into a GSTR-1 tool. One row per invoice per rate line. This only prepares data: nothing is filed.
 * Pure (no DB), so it can be tested and used by a server action.
 */
import type { OutwardRow } from "@/lib/products/cashflow-ai/gst/core";
import { placeLabel } from "@/lib/products/cashflow-ai/gst/register";

/**
 * One CSV field, RFC 4180: quoted when it holds a comma, quote, or line break, with quotes doubled. Text a spreadsheet would run as a
 * formula (starts with = + - @, or a tab / carriage return) gets a leading apostrophe so it opens as plain text. Numbers are written
 * by the caller, so a negative amount is not mistaken for text.
 */
export function csvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

const money = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const dmy = (iso: string) => iso.split("-").reverse().join("-");

export const SALES_CSV_HEADER = [
  "GSTIN of recipient",
  "Recipient name",
  "Invoice number",
  "Invoice date",
  "Invoice value",
  "Place of supply",
  "Rate (%)",
  "Taxable value",
  "IGST",
  "CGST",
  "SGST",
  "HSN/SAC",
  "Type",
  "Currency",
] as const;

export function salesCsv(rows: OutwardRow[]): string {
  const out: string[] = [SALES_CSV_HEADER.map(csvField).join(",")];
  for (const r of rows) {
    for (const l of r.lines) {
      out.push(
        [
          csvField(r.recipientGstin ?? ""),
          csvField(r.customerName),
          csvField(r.invoiceNumber),
          dmy(r.invoiceDate),
          money(r.invoiceValue),
          csvField(placeLabel(r.placeOfSupply) === "Not known" ? "" : placeLabel(r.placeOfSupply)),
          String(l.rate),
          money(l.taxable),
          money(l.heads.igst),
          money(l.heads.cgst),
          money(l.heads.sgst),
          csvField(l.hsnSac ?? ""),
          r.kind === "b2b" ? "B2B" : "B2C",
          csvField(r.currency),
        ].join(",")
      );
    }
  }
  return out.join("\r\n") + "\r\n";
}
