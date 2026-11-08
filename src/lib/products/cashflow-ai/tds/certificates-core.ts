/**
 * Form 16A tracking and lower / nil deduction certificates, the pure part — no DB.
 * The certificate itself is generated on the TRACES portal; here we only note that it was issued. A lower-deduction certificate is
 * information: it never changes the expected-TDS arithmetic in core.ts, it only adds a note for a person to look at.
 */
import { r2, type DeductionRow, type Quarter } from "@/lib/products/cashflow-ai/tds/core";

export function isRealDate(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  // a date like 2026-02-30 rolls over to March, 2026-13-01 is invalid: both must fail
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// ───────────────────────────── Form 16A tracking ─────────────────────────────

export interface CertificateInput {
  issuedOn: string;
  certificateNumber: string;
  note?: string | null;
}

export function certificateProblem(c: CertificateInput, today: string): string | null {
  if (!isRealDate(c.issuedOn)) return "Enter the date the certificate was issued.";
  if (c.issuedOn > today) return "The issue date cannot be in the future.";
  const n = (c.certificateNumber ?? "").trim();
  if (!n) return "Enter the certificate number shown on the certificate.";
  if (n.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9 /_-]*$/.test(n)) return "The certificate number can use letters, digits, spaces, / and - only (up to 40 characters).";
  if ((c.note ?? "").length > 500) return "Keep the note under 500 characters.";
  return null;
}

export interface CertificateLike {
  vendorId: string;
  section: string;
  issuedOn: string;
  certificateNumber: string;
  note: string | null;
}

export interface CertificateTask {
  vendorId: string;
  vendorName: string;
  pan: string | null;
  section: string;
  billCount: number;
  paid: number;
  deducted: number;
  certificate: CertificateLike | null;
}

/** One task per vendor and section in which tax was deducted in the quarter (`rows` already limited to that quarter), issued or not. */
export function certificateTasks(rows: DeductionRow[], certs: CertificateLike[]): CertificateTask[] {
  const by = new Map<string, CertificateTask>();
  for (const r of rows) {
    if (!(r.deducted > 0) || !r.section) continue;
    const key = `${r.bill.vendorId}|${r.section}`;
    const t = by.get(key) ?? { vendorId: r.bill.vendorId, vendorName: r.bill.vendorName, pan: r.vendorPan, section: r.section, billCount: 0, paid: 0, deducted: 0, certificate: null };
    t.billCount += 1;
    t.paid = r2(t.paid + r.bill.base);
    t.deducted = r2(t.deducted + r.deducted);
    by.set(key, t);
  }
  const have = new Map(certs.map((c) => [`${c.vendorId}|${c.section.toUpperCase()}`, c]));
  return [...by.values()]
    .map((t) => ({ ...t, certificate: have.get(`${t.vendorId}|${t.section}`) ?? null }))
    .sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.section.localeCompare(b.section));
}

// ───────────────────────────── lower / nil deduction certificates ─────────────────────────────

export interface LowerCertInput {
  vendorId: string;
  section: string;
  certificateNumber: string;
  /** true = nil deduction (no tax); otherwise `rate` is the percentage allowed. */
  nil: boolean;
  rate: number | null;
  validFrom: string;
  validTo: string;
  maxAmount: number | null;
  note?: string | null;
}

export function lowerCertProblem(c: LowerCertInput): string | null {
  if (!c.vendorId) return "Choose the vendor.";
  if (!/^[A-Za-z0-9]{2,10}$/.test((c.section ?? "").trim())) return "Choose the section the certificate is for.";
  const n = (c.certificateNumber ?? "").trim();
  if (!n) return "Enter the certificate number.";
  if (n.length > 40 || !/^[A-Za-z0-9][A-Za-z0-9 /_-]*$/.test(n)) return "The certificate number can use letters, digits, spaces, / and - only (up to 40 characters).";
  if (!c.nil && (c.rate === null || !Number.isFinite(c.rate) || c.rate < 0 || c.rate > 100)) return "Enter the lower rate as a percentage from 0 to 100, or choose nil deduction.";
  if (!isRealDate(c.validFrom)) return "Enter the date the certificate is valid from.";
  if (!isRealDate(c.validTo)) return "Enter the date the certificate is valid to.";
  if (c.validFrom > c.validTo) return "The valid-from date cannot be after the valid-to date.";
  if (c.maxAmount !== null && (!Number.isFinite(c.maxAmount) || c.maxAmount <= 0 || c.maxAmount > 1e11)) return "The maximum amount must be more than zero, or left empty.";
  if ((c.note ?? "").length > 500) return "Keep the note under 500 characters.";
  return null;
}

export interface LowerCertLike {
  vendorId: string;
  section: string;
  certificateNumber: string;
  nil: boolean;
  rate: number | null;
  validFrom: string;
  validTo: string;
  maxAmount: number | null;
}

/** The certificate (if any) that covers this vendor, section and date. Dates are inclusive. */
export function lowerCertCovering<T extends LowerCertLike>(certs: T[], vendorId: string, section: string | null, date: string): T | null {
  if (!section) return null;
  const s = section.trim().toUpperCase();
  return certs.find((c) => c.vendorId === vendorId && c.section.trim().toUpperCase() === s && c.validFrom <= date && date <= c.validTo) ?? null;
}

export const LOWER_CERT_NOTE = "Vendor has a lower-deduction certificate valid on this date: the expected rate may be lower.";

const dmy = (iso: string) => iso.split("-").reverse().join("-");
export function lowerCertDetail(c: LowerCertLike): string {
  const what = c.nil ? "nil deduction" : `${c.rate}%`;
  const cap = c.maxAmount !== null ? `, up to ${c.maxAmount.toLocaleString("en-IN")}` : "";
  return `Certificate ${c.certificateNumber}: ${what}${cap}, valid ${dmy(c.validFrom)} to ${dmy(c.validTo)}.`;
}

export type { Quarter };
