/**
 * India income-tax — new regime, FY 2025-26 (AY 2026-27). Pure functions, no I/O.
 *
 * Slabs (annual taxable income after the ₹75,000 standard deduction):
 *   up to  4,00,000  — nil
 *   4,00,001 – 8,00,000  — 5%
 *   8,00,001 – 12,00,000 — 10%
 *   12,00,001 – 16,00,000 — 15%
 *   16,00,001 – 20,00,000 — 20%
 *   20,00,001 – 24,00,000 — 25%
 *   above 24,00,000 — 30%
 * Section 87A rebate: taxable income ≤ ₹12,00,000 ⇒ tax is nil.
 * Health & education cess: 4% on tax.
 * (Surcharge for very high incomes is not modelled — use a manual TDS override.)
 */

export const STANDARD_DEDUCTION = 75000;
const REBATE_87A_LIMIT = 1200000;
const CESS_RATE = 0.04;

const SLABS: { upTo: number; rate: number }[] = [
  { upTo: 400000, rate: 0 },
  { upTo: 800000, rate: 0.05 },
  { upTo: 1200000, rate: 0.1 },
  { upTo: 1600000, rate: 0.15 },
  { upTo: 2000000, rate: 0.2 },
  { upTo: 2400000, rate: 0.25 },
  { upTo: Infinity, rate: 0.3 },
];

/** Annual tax (incl. cess) on `taxableAnnual` — the figure AFTER the standard deduction. */
export function computeAnnualTax(taxableAnnual: number): number {
  const taxable = Math.max(0, Math.round(taxableAnnual));
  if (taxable <= REBATE_87A_LIMIT) return 0;

  let tax = 0;
  let lower = 0;
  for (const slab of SLABS) {
    if (taxable <= lower) break;
    const bandTop = Math.min(taxable, slab.upTo);
    tax += (bandTop - lower) * slab.rate;
    lower = slab.upTo;
  }
  return Math.round(tax * (1 + CESS_RATE));
}

/**
 * Monthly TDS to withhold. `projectedGrossAnnual` is this employee's expected
 * taxable gross for the whole FY (usually current monthly gross × 12, plus any
 * YTD actuals the caller folds in). `taxWithheldYtd` is what earlier payslips in
 * this FY already deducted; `monthsRemaining` includes the current month.
 */
export function monthlyTds(
  projectedGrossAnnual: number,
  taxWithheldYtd: number,
  monthsRemaining: number,
  manualOverride?: number | null
): number {
  if (manualOverride != null && manualOverride >= 0) return Math.round(manualOverride);
  if (monthsRemaining <= 0) return 0;
  const taxableAfterStd = Math.max(0, projectedGrossAnnual - STANDARD_DEDUCTION);
  const annualTax = computeAnnualTax(taxableAfterStd);
  const remaining = Math.max(0, annualTax - Math.max(0, taxWithheldYtd));
  return Math.round(remaining / monthsRemaining);
}
