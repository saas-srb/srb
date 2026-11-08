/**
 * The quarterly TDS statement working, the pure part — no DB. Turns the quarter's deduction rows into the lines, section subtotals and
 * "needs attention" list shown on the page and written to the CSV. Nothing here is a filing: the return is prepared by the CA.
 */
import { r2, type DeductionFlag, type DeductionRow, type Quarter } from "@/lib/products/cashflow-ai/tds/core";
import { lowerCertCovering, type LowerCertLike } from "@/lib/products/cashflow-ai/tds/certificates-core";

export const QUARTER_LABEL: Record<Quarter, string> = { 1: "Q1 (Apr–Jun)", 2: "Q2 (Jul–Sep)", 3: "Q3 (Oct–Dec)", 4: "Q4 (Jan–Mar)" };

export interface StatementLine {
  billId: string;
  vendorId: string;
  vendorName: string;
  /** Valid PAN, or null when missing / wrong. */
  pan: string | null;
  panAsSaved: string | null;
  section: string | null;
  billNumber: string;
  date: string;
  paid: number;
  rate: number;
  deducted: number;
  flags: DeductionFlag[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** One line per bill on which tax was deducted, grouped by section, then vendor, then date. */
export function statementLines(rows: DeductionRow[]): StatementLine[] {
  return rows
    .filter((r) => r.deducted > 0)
    .map((r) => ({
      billId: r.bill.billId,
      vendorId: r.bill.vendorId,
      vendorName: r.bill.vendorName,
      pan: r.vendorPan,
      panAsSaved: r.bill.vendorPan?.trim() || null,
      section: r.section,
      billNumber: r.bill.billNumber,
      date: r.bill.date,
      paid: r.bill.base,
      rate: r.bill.tdsRate,
      deducted: r.deducted,
      flags: r.flags,
    }))
    .sort((a, b) => cmp(a.section ?? "~", b.section ?? "~") || cmp(a.vendorName, b.vendorName) || cmp(a.date, b.date) || cmp(a.billNumber, b.billNumber));
}

export interface SectionSubtotal {
  section: string | null;
  count: number;
  paid: number;
  deducted: number;
}

export function sectionSubtotals(lines: StatementLine[]): SectionSubtotal[] {
  const m = new Map<string, SectionSubtotal>();
  for (const l of lines) {
    const k = l.section ?? "";
    const s = m.get(k) ?? { section: l.section, count: 0, paid: 0, deducted: 0 };
    s.count += 1;
    s.paid = r2(s.paid + l.paid);
    s.deducted = r2(s.deducted + l.deducted);
    m.set(k, s);
  }
  return [...m.values()].sort((a, b) => cmp(a.section ?? "~", b.section ?? "~"));
}

export function grandTotal(lines: StatementLine[]): { count: number; paid: number; deducted: number } {
  return { count: lines.length, paid: r2(lines.reduce((n, l) => n + l.paid, 0)), deducted: r2(lines.reduce((n, l) => n + l.deducted, 0)) };
}

export interface AttentionItem {
  row: DeductionRow;
  flags: DeductionFlag[];
  /** A lower-deduction certificate covers this vendor, section and bill date. */
  lowerCert: LowerCertLike | null;
}

/** Quarter rows that carry a flag, or whose vendor holds a lower-deduction certificate covering the bill date. */
export function attentionItems(rows: DeductionRow[], certs: LowerCertLike[]): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const row of rows) {
    const lowerCert = lowerCertCovering(certs, row.bill.vendorId, row.section, row.bill.date);
    if (row.flags.length > 0 || lowerCert) out.push({ row, flags: row.flags, lowerCert });
  }
  return out;
}
