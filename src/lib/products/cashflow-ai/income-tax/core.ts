/**
 * Income-tax computation for the company, the pure part — no DB.
 *
 * Nothing about the law is built in: the tax rate, surcharge, cess and MAT rate, which expenses are disallowed, how much depreciation the
 * income-tax rules allow, which losses can be set off — all of it is entered by the company with its CA, per financial year, and marked
 * confirmed. This file starts from the profit in the books, applies the additions and deductions the company entered, sets off the
 * losses it chose, applies the rates it entered, and subtracts the tax already paid. It says "not entered" wherever a number is missing.
 * The CA's software produces the return; this is the working behind it.
 *
 * Money is rupees, worked in paise.
 */
const paise = (rupees: number) => Math.round((rupees + Number.EPSILON) * 100);
const rupees = (p: number) => p / 100;
/** A calendar date written YYYY-MM-DD that really exists (2026-06-31 does not). */
export const realDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type AdjustmentKind = "add" | "less";
/** Whether an adjustment applies to the normal computation, to book profit for MAT, or both. */
export type AdjustmentScope = "normal" | "mat" | "both";

/** Heads the company can pick from. Names only: what is allowed or disallowed, and how much, is the CA's call. */
export const ADJUSTMENT_HEADS: { kind: AdjustmentKind; label: string; help: string }[] = [
  { kind: "add", label: "Depreciation as charged in the books", help: "Added back, because the income-tax rules allow their own depreciation instead (below)." },
  { kind: "add", label: "Expenses not allowed", help: "Expenses the Income-tax Act does not allow as a deduction, as your CA lists them." },
  { kind: "add", label: "Penalties and fines", help: "Penalties, fines and interest on late tax and similar." },
  { kind: "add", label: "Provisions and reserves", help: "Provisions made in the books that are not allowed until paid or ascertained." },
  { kind: "add", label: "Tax not deducted or not deposited on time", help: "Expenses where TDS was not deducted or deposited as required, as your CA works out." },
  { kind: "add", label: "Personal or non-business expenses", help: "Spending that is not for the business." },
  { kind: "add", label: "Other addition", help: "Anything else your CA asks you to add." },
  { kind: "less", label: "Depreciation as per income-tax rules", help: "Depreciation allowed under the income-tax rules (worked separately from the books)." },
  { kind: "less", label: "Income that is exempt", help: "Income included in the books that is not taxable." },
  { kind: "less", label: "Expenses allowed now that were disallowed earlier", help: "Amounts added back in earlier years and allowed this year." },
  { kind: "less", label: "Deductions under Chapter VI-A", help: "Deductions your CA claims under that chapter." },
  { kind: "less", label: "Other deduction", help: "Anything else your CA asks you to deduct." },
];

export interface Adjustment {
  id: string;
  kind: AdjustmentKind;
  head: string;
  amount: number;
  scope: AdjustmentScope;
  /** Where the figure comes from: the CA's workings, a section, a book reference. */
  basis: string | null;
}

export interface TaxRates {
  /** The company's own name for the basis it pays under, as the CA states it (free text). */
  regimeLabel: string | null;
  /** Percent. null = not entered. */
  baseRate: number | null;
  surchargeRate: number | null;
  cessRate: number | null;
  /** Percent of book profit for MAT; only used when matApplicable. */
  matRate: number | null;
  /** The CA says MAT has to be worked for this year. */
  matApplicable: boolean;
  /** The CA has confirmed these rates for the year. */
  confirmed: boolean;
  /** The platform rulebook basis these rates came from; null for rates the company typed. */
  regimeId?: string | null;
  /**
   * Surcharge by income slab (rulebook bases). When present it replaces the flat `surchargeRate`: the surcharge is the highest slab whose
   * `above` is strictly below the income it is worked on, so it follows the income instead of being one typed number.
   */
  surchargeSlabs?: { above: number; rate: number }[];
}

export function ratesProblem(r: Partial<TaxRates>): string | null {
  const pct = (v: number | null | undefined, what: string) => (v !== null && v !== undefined && (!Number.isFinite(v) || v < 0 || v > 100) ? `${what} must be between 0 and 100.` : null);
  return pct(r.baseRate, "The tax rate") ?? pct(r.surchargeRate, "The surcharge") ?? pct(r.cessRate, "The cess") ?? pct(r.matRate, "The MAT rate") ?? null;
}

export function adjustmentProblem(a: { kind?: string; head?: string; amount?: number; scope?: string }): string | null {
  if (a.kind !== "add" && a.kind !== "less") return "Choose whether this is added or deducted.";
  if (!a.head || !a.head.trim()) return "Say what this adjustment is for.";
  if (a.amount === undefined || !Number.isFinite(a.amount) || a.amount <= 0 || a.amount > 1e11) return "Enter the amount (more than zero).";
  if (a.scope !== "normal" && a.scope !== "mat" && a.scope !== "both") return "Choose where it applies: normal tax, MAT or both.";
  return null;
}

// ───────────────────────────── losses ─────────────────────────────

export type LossKind = "business" | "unabsorbed_depreciation" | "other";
export const LOSS_KIND_LABEL: Record<LossKind, string> = { business: "Business loss", unabsorbed_depreciation: "Unabsorbed depreciation", other: "Other loss" };

export interface LossLine {
  id: string;
  /** Financial year in which the loss arose, e.g. 2023-24. */
  fy: string;
  kind: LossKind;
  /** What is still available to set off, as the CA states it. */
  available: number;
  /** The last year it can be carried to, if the CA gives one. Informational: the time limit is the CA's to apply. */
  validUntilFy: string | null;
}

export interface SetOff {
  lossId: string;
  amount: number;
}

// ───────────────────────────── computation ─────────────────────────────

export interface ComputationInput {
  /** Profit before tax from the books for the year (negative = loss). */
  bookProfit: number;
  adjustments: Adjustment[];
  losses: LossLine[];
  setOffs: SetOff[];
  rates: TaxRates;
  credits: { advanceTax: number; tdsCredit: number; selfAssessment: number };
}

export type ComputationNote =
  | "rates_not_entered"
  | "rates_unconfirmed"
  | "mat_rate_not_entered"
  | "loss_for_the_year"
  | "set_off_more_than_available"
  | "set_off_more_than_income"
  | "unknown_loss"
  | "duplicate_set_off";

export const COMPUTATION_NOTE_TEXT: Record<ComputationNote, string> = {
  rates_not_entered: "No tax basis has been chosen for this year, so the tax cannot be worked out. Choose the basis your company pays tax under in section 1.",
  rates_unconfirmed: "The platform has not yet checked this year's figures (or the rates you entered are not marked as confirmed): treat the tax below as indicative.",
  mat_rate_not_entered: "MAT is marked as applicable but its rate has not been entered, so MAT could not be worked out.",
  loss_for_the_year: "The year shows a loss after adjustments. No tax is due on it, and the loss may be carried forward: your CA decides.",
  set_off_more_than_available: "A loss set-off is more than what is available for that loss and was reduced to the available amount.",
  set_off_more_than_income: "The losses chosen are more than the income they are set against, so they were reduced.",
  unknown_loss: "A set-off refers to a loss that is not in the register and was ignored.",
  duplicate_set_off: "The same loss was set off twice; only the first was used.",
};

export interface TaxHeads {
  tax: number;
  surcharge: number;
  cess: number;
  total: number;
}

export interface ComputationResult {
  bookProfit: number;
  additions: number;
  deductions: number;
  /** Book profit plus additions less deductions, before losses. */
  incomeBeforeLosses: number;
  lossesSetOff: number;
  setOffUsed: SetOff[];
  /** Income the tax is worked on (never below zero). */
  taxableIncome: number;
  /** null while the rate is not entered */
  normal: TaxHeads | null;
  /** Book profit for MAT and the tax on it; null unless MAT applies and its rate is entered. */
  mat: (TaxHeads & { bookProfit: number }) | null;
  /** The tax payable for the year: the higher of the two when MAT applies. null while a needed rate is missing. */
  taxForYear: TaxHeads | null;
  /** When MAT is higher than normal tax, the difference: informational (a credit the CA may track). */
  matExcess: number;
  paid: { advanceTax: number; tdsCredit: number; selfAssessment: number; total: number };
  /** Tax for the year less everything paid or credited. Positive = to pay, negative = refund due. null while the tax is unknown. */
  balance: number | null;
  /** Loss of the year after adjustments, if any (positive number). */
  lossOfTheYear: number;
  notes: ComputationNote[];
}

const sumP = (xs: number[]) => xs.reduce((n, x) => n + paise(x), 0);

/** Surcharge percent for an income (in paise): the slab rule when slabs are given, otherwise the flat typed rate. Strictly above, as the law words it. */
function surchargePct(r: TaxRates, incomePaise: number): number {
  if (!r.surchargeSlabs) return r.surchargeRate ?? 0;
  let rate = 0;
  for (const s of [...r.surchargeSlabs].sort((a, b) => a.above - b.above)) if (incomePaise > paise(s.above)) rate = s.rate;
  return rate;
}

function taxOn(basePaise: number, r: TaxRates): TaxHeads | null {
  if (r.baseRate === null) return null;
  const tax = Math.round((basePaise * r.baseRate) / 100);
  const surcharge = Math.round((tax * surchargePct(r, basePaise)) / 100);
  const cess = Math.round(((tax + surcharge) * (r.cessRate ?? 0)) / 100);
  return { tax: rupees(tax), surcharge: rupees(surcharge), cess: rupees(cess), total: rupees(tax + surcharge + cess) };
}

export function computeTax(input: ComputationInput): ComputationResult {
  const notes: ComputationNote[] = [];
  const r = input.rates;
  const inNormal = (a: Adjustment) => a.scope === "normal" || a.scope === "both";
  const inMat = (a: Adjustment) => a.scope === "mat" || a.scope === "both";
  const addP = sumP(input.adjustments.filter((a) => a.kind === "add" && inNormal(a)).map((a) => a.amount));
  const lessP = sumP(input.adjustments.filter((a) => a.kind === "less" && inNormal(a)).map((a) => a.amount));
  const bookP = paise(input.bookProfit);
  const incomeBeforeP = bookP + addP - lessP;

  // Losses: each at most what is available, each loss once, all together at most the positive income
  const byId = new Map(input.losses.map((l) => [l.id, l]));
  const seen = new Set<string>();
  const used: SetOff[] = [];
  let remainingIncomeP = Math.max(0, incomeBeforeP);
  for (const s of input.setOffs) {
    const loss = byId.get(s.lossId);
    if (!loss) { if (!notes.includes("unknown_loss")) notes.push("unknown_loss"); continue; }
    if (seen.has(s.lossId)) { if (!notes.includes("duplicate_set_off")) notes.push("duplicate_set_off"); continue; }
    seen.add(s.lossId);
    let want = Math.max(0, paise(s.amount));
    if (want > paise(loss.available)) { want = paise(loss.available); if (!notes.includes("set_off_more_than_available")) notes.push("set_off_more_than_available"); }
    if (want > remainingIncomeP) { want = remainingIncomeP; if (!notes.includes("set_off_more_than_income")) notes.push("set_off_more_than_income"); }
    if (want <= 0) continue;
    remainingIncomeP -= want;
    used.push({ lossId: s.lossId, amount: rupees(want) });
  }
  const setOffP = used.reduce((n, s) => n + paise(s.amount), 0);
  const taxableP = Math.max(0, incomeBeforeP) - setOffP;

  const normal = taxOn(taxableP, r);
  if (r.baseRate === null) notes.push("rates_not_entered");
  else if (!r.confirmed) notes.push("rates_unconfirmed");

  let mat: ComputationResult["mat"] = null;
  if (r.matApplicable) {
    if (r.matRate === null) notes.push("mat_rate_not_entered");
    else {
      const matBaseP = bookP + sumP(input.adjustments.filter((a) => a.kind === "add" && inMat(a)).map((a) => a.amount)) - sumP(input.adjustments.filter((a) => a.kind === "less" && inMat(a)).map((a) => a.amount));
      const matBase = Math.max(0, matBaseP);
      const tax = Math.round((matBase * r.matRate) / 100);
      const surcharge = Math.round((tax * surchargePct(r, matBase)) / 100);
      const cess = Math.round(((tax + surcharge) * (r.cessRate ?? 0)) / 100);
      mat = { bookProfit: rupees(matBase), tax: rupees(tax), surcharge: rupees(surcharge), cess: rupees(cess), total: rupees(tax + surcharge + cess) };
    }
  }

  let taxForYear: TaxHeads | null = normal;
  let matExcess = 0;
  if (r.matApplicable && (r.matRate === null || normal === null)) taxForYear = null;
  else if (mat && normal) {
    if (paise(mat.total) > paise(normal.total)) {
      taxForYear = { tax: mat.tax, surcharge: mat.surcharge, cess: mat.cess, total: mat.total };
      matExcess = rupees(paise(mat.total) - paise(normal.total));
    }
  }

  const paidP = paise(input.credits.advanceTax) + paise(input.credits.tdsCredit) + paise(input.credits.selfAssessment);
  if (incomeBeforeP < 0) notes.push("loss_for_the_year");
  return {
    bookProfit: rupees(bookP),
    additions: rupees(addP),
    deductions: rupees(lessP),
    incomeBeforeLosses: rupees(incomeBeforeP),
    lossesSetOff: rupees(setOffP),
    setOffUsed: used,
    taxableIncome: rupees(taxableP),
    normal,
    mat,
    taxForYear,
    matExcess,
    paid: { advanceTax: r2(input.credits.advanceTax), tdsCredit: r2(input.credits.tdsCredit), selfAssessment: r2(input.credits.selfAssessment), total: rupees(paidP) },
    balance: taxForYear ? rupees(paise(taxForYear.total) - paidP) : null,
    lossOfTheYear: incomeBeforeP < 0 ? rupees(-incomeBeforeP) : 0,
    notes,
  };
}

// ───────────────────────────── advance tax ─────────────────────────────

/** A line of the instalment schedule exactly as the CA gives it: a due date and the share of the year's tax that should be paid by then. */
export interface Instalment {
  dueDate: string;
  /** Cumulative percent of the year's tax due by this date, e.g. 15, 45, 75, 100 — typed by the company, not assumed. */
  cumulativePercent: number;
}

export function scheduleProblem(s: Instalment[]): string | null {
  if (s.length > 12) return "At most 12 instalments.";
  let last = -1;
  let lastDate = "";
  for (const i of s) {
    if (!realDate(i.dueDate)) return "Every instalment needs a real due date.";
    if (!Number.isFinite(i.cumulativePercent) || i.cumulativePercent <= 0 || i.cumulativePercent > 100) return "Each percentage must be above 0 and at most 100.";
    if (i.cumulativePercent <= last) return "The percentages must keep growing from one instalment to the next (they are cumulative).";
    if (i.dueDate <= lastDate) return "The due dates must be in order, one after another.";
    last = i.cumulativePercent;
    lastDate = i.dueDate;
  }
  return null;
}

export interface InstalmentStatus {
  dueDate: string;
  cumulativePercent: number;
  /** Cumulative tax that should have been paid by the due date, from the estimate. */
  shouldHavePaid: number;
  /** Advance tax actually paid on or before the due date. */
  paidByThen: number;
  shortfall: number;
  state: "paid_up" | "short" | "upcoming" | "due_soon";
}

/**
 * Compares paid advance tax with the schedule. `estimate` is the year's tax less the tax credit already expected (TDS), as the company
 * wishes to plan against; nothing here computes interest — that is the CA's.
 */
export function instalmentStatus(schedule: Instalment[], estimate: number, payments: { paidOn: string; amount: number }[], today: string): InstalmentStatus[] {
  return schedule.map((i) => {
    const shouldP = Math.round((paise(estimate) * i.cumulativePercent) / 100);
    const paidP = payments.filter((p) => p.paidOn <= i.dueDate).reduce((n, p) => n + paise(p.amount), 0);
    const shortP = Math.max(0, shouldP - paidP);
    const daysLeft = Math.round((Date.parse(`${i.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
    const state: InstalmentStatus["state"] = shortP <= 0 ? "paid_up" : i.dueDate < today ? "short" : daysLeft <= 15 ? "due_soon" : "upcoming";
    return { dueDate: i.dueDate, cumulativePercent: i.cumulativePercent, shouldHavePaid: rupees(shouldP), paidByThen: rupees(paidP), shortfall: rupees(shortP), state };
  });
}

// ───────────────────────────── payments ─────────────────────────────

export type TaxPaymentKind = "advance" | "self_assessment" | "regular_assessment";
export const TAX_PAYMENT_LABEL: Record<TaxPaymentKind, string> = { advance: "Advance tax", self_assessment: "Self-assessment tax", regular_assessment: "Tax on regular assessment" };

export function taxPaymentProblem(p: { kind?: string; fy?: string; amount?: number; paidOn?: string; bsrCode?: string; serial?: string }): string | null {
  if (p.kind !== "advance" && p.kind !== "self_assessment" && p.kind !== "regular_assessment") return "Choose the kind of tax paid.";
  if (!p.fy || !/^\d{4}-\d{2}$/.test(p.fy)) return "Choose the financial year the tax is for.";
  if (!p.amount || !Number.isFinite(p.amount) || p.amount <= 0 || p.amount > 1e11) return "Enter the amount paid.";
  if (!p.paidOn || !realDate(p.paidOn)) return "Enter the date it was paid.";
  if (!/^\d{7}$/.test((p.bsrCode ?? "").trim())) return "The bank's BSR code has 7 digits (it is on the challan).";
  if (!/^\d{1,5}$/.test((p.serial ?? "").trim())) return "The challan serial number has up to 5 digits (it is on the challan).";
  return null;
}
