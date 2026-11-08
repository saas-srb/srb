/**
 * CSV of the quarterly TDS statement working, for the CA to paste into their return-preparation tool. It is NOT in the government's
 * upload format and nothing is filed from here. Pure (no DB). One row per bill on which tax was deducted; no total row, so a paste
 * stays clean (the totals are on the page).
 */
import { csvField } from "@/lib/products/cashflow-ai/gst/csv";
import { DEDUCTION_FLAG_TEXT } from "@/lib/products/cashflow-ai/tds/core";
import type { StatementLine } from "@/lib/products/cashflow-ai/tds/statement";

const money = (n: number) => (Math.round((n + Number.EPSILON) * 100) / 100).toFixed(2);
const dmy = (iso: string) => iso.split("-").reverse().join("-");

export const STATEMENT_CSV_HEADER = [
  "Deductee name",
  "PAN",
  "Section",
  "Bill number",
  "Date of payment or credit",
  "Amount paid or credited",
  "Rate of deduction (%)",
  "Tax deducted",
  "Financial year",
  "Quarter",
  "Checks to look at",
] as const;

export { csvField };

export function statementCsv(lines: StatementLine[], fy: string, quarter: number): string {
  const out: string[] = [STATEMENT_CSV_HEADER.map(csvField).join(",")];
  for (const l of lines) {
    out.push(
      [
        csvField(l.vendorName),
        csvField(l.pan ?? ""),
        csvField(l.section ?? ""),
        csvField(l.billNumber),
        dmy(l.date),
        money(l.paid),
        String(l.rate),
        money(l.deducted),
        csvField(fy),
        `Q${quarter}`,
        csvField(l.flags.map((f) => DEDUCTION_FLAG_TEXT[f].title).join("; ")),
      ].join(",")
    );
  }
  return out.join("\r\n") + "\r\n";
}
