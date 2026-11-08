/**
 * TDS (tax deducted at source) working, the pure part — no DB.
 *
 * The law's numbers (which sections apply, their rates and thresholds, the rate when a PAN is missing, due dates) are NOT built in.
 * The company enters them from what its CA tells it, per section, and marks each as confirmed. This file only does the arithmetic and the
 * checks on top of what the company entered, and says "ask your CA" wherever the answer is not in those numbers.
 *
 * Money is rupees; every rate is applied in paise so a deduction adds up exactly.
 */

const paise = (rupees: number) => Math.round((rupees + Number.EPSILON) * 100);
const rupees = (p: number) => p / 100;
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// ───────────────────────────── sections (names only) ─────────────────────────────

/** Section names the company can pick from. Names and what they cover, in words: no rates, no thresholds. */
export const SECTION_CATALOG: { code: string; name: string; covers: string }[] = [
  { code: "194A", name: "Interest (other than on securities)", covers: "Interest paid or credited, for example on loans taken." },
  { code: "194C", name: "Contractors", covers: "Payments to contractors and sub-contractors for carrying out work, including advertising and transport." },
  { code: "194H", name: "Commission or brokerage", covers: "Commission or brokerage paid to an agent." },
  { code: "194I", name: "Rent", covers: "Rent for land, buildings, machinery, plant or equipment." },
  { code: "194J", name: "Professional or technical fees", covers: "Fees for professional or technical services, royalty, director's fees." },
  { code: "194Q", name: "Purchase of goods", covers: "Purchase of goods above a yearly limit from one seller." },
  { code: "194R", name: "Benefit or perquisite", covers: "Benefits or perquisites given in the course of business." },
  { code: "192", name: "Salary", covers: "Salaries. Worked out in payroll, not here." },
  { code: "OTHER", name: "Another section", covers: "A section not listed: your CA gives the section, rate and threshold." },
];

export interface SectionConfig {
  /** The section code, e.g. "194J", or a code the company types for its own use. */
  code: string;
  label: string;
  /** Percent of the amount paid (excluding GST) that is deducted. null = not entered yet. */
  rate: number | null;
  /** Deduct only when ONE payment is above this. null = no single-payment test. */
  singleThreshold: number | null;
  /** Deduct only once the total to this payee in the financial year is above this. null = no yearly test. */
  annualThreshold: number | null;
  /** Percent to deduct when the payee has no valid PAN, as the CA states it. null = not entered: a missing PAN is flagged, not guessed. */
  noPanRate: number | null;
  /** The CA has confirmed this section's numbers for the year. Unconfirmed numbers are shown as such everywhere. */
  confirmed: boolean;
  active: boolean;
  /** Where the numbers came from: the platform's rulebook, the company's own override, or a section the rulebook does not have (company-defined). Absent = not stated. */
  basis?: "rulebook" | "override" | "own";
}

export function sectionProblem(c: Partial<SectionConfig>): string | null {
  if (!c.code || !/^[A-Za-z0-9()]{2,12}$/.test(c.code.trim())) return "Give the section a short code, e.g. 194J or 194I(a).";
  if (!c.label || !c.label.trim()) return "Give the section a name.";
  const pct = (v: number | null | undefined, what: string) => (v !== null && v !== undefined && (!Number.isFinite(v) || v < 0 || v > 100) ? `${what} must be between 0 and 100.` : null);
  const amt = (v: number | null | undefined, what: string) => (v !== null && v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1e10) ? `${what} must be an amount from 0 up.` : null);
  return pct(c.rate, "Rate") ?? pct(c.noPanRate, "The no-PAN rate") ?? amt(c.singleThreshold, "The single-payment limit") ?? amt(c.annualThreshold, "The yearly limit") ?? null;
}

// ───────────────────────────── PAN ─────────────────────────────

/** Shape of a PAN: five letters, four digits, a letter. The fourth letter says what kind of holder it is. */
export function panError(raw: string | null | undefined): string | null {
  const p = (raw ?? "").trim().toUpperCase();
  if (!p) return "PAN is empty.";
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(p)) return "A PAN has 5 letters, 4 digits and 1 letter, e.g. ABCPE1234F.";
  if (!"ABCFGHLJPTK".includes(p[3])) return "The 4th letter of a PAN must be one of A, B, C, F, G, H, L, J, P, T, K.";
  return null;
}
export const normalizePan = (raw: string | null | undefined) => (raw ?? "").trim().toUpperCase();
export const validPan = (raw: string | null | undefined) => (panError(raw) === null ? normalizePan(raw) : null);

// ───────────────────────────── financial year and quarters ─────────────────────────────

/** FY label "2026-27" for a YYYY-MM-DD (the Indian year runs 1 April to 31 March). */
export function financialYearOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export const isFinancialYear = (fy: string) => /^\d{4}-\d{2}$/.test(fy) && (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5, 7));
export function fyRange(fy: string): { from: string; to: string } {
  if (!isFinancialYear(fy)) throw new Error("Financial year must look like 2026-27.");
  const y = Number(fy.slice(0, 4));
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
}
export type Quarter = 1 | 2 | 3 | 4;
/** Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar. */
export function quarterOf(date: string): Quarter {
  const m = Number(date.slice(5, 7));
  return m >= 4 && m <= 6 ? 1 : m >= 7 && m <= 9 ? 2 : m >= 10 ? 3 : 4;
}
export function quarterRange(fy: string, q: Quarter): { from: string; to: string } {
  const y = Number(fy.slice(0, 4));
  const spans: Record<Quarter, [string, string]> = { 1: [`${y}-04-01`, `${y}-06-30`], 2: [`${y}-07-01`, `${y}-09-30`], 3: [`${y}-10-01`, `${y}-12-31`], 4: [`${y + 1}-01-01`, `${y + 1}-03-31`] };
  return { from: spans[q][0], to: spans[q][1] };
}
export const isQuarter = (q: number): q is Quarter => q === 1 || q === 2 || q === 3 || q === 4;

// ───────────────────────────── deductions ─────────────────────────────

export interface BillForTds {
  billId: string;
  billNumber: string;
  vendorId: string;
  vendorName: string;
  vendorPan: string | null;
  /** YYYY-MM-DD the bill was entered / dated: the date the payee is credited. */
  date: string;
  /** Amount before GST: TDS is worked on this. */
  base: number;
  /** TDS as entered on the bill. */
  tdsRate: number;
  tdsAmount: number;
  section: string | null;
  status: string;
  /** Currency of the bill; anything other than rupees is listed but not worked on, since limits and rates are in rupees. */
  currency?: string;
}

export type DeductionFlag =
  | "no_section"
  | "section_not_set_up"
  | "rate_not_entered"
  | "numbers_unconfirmed"
  | "pan_missing"
  | "pan_invalid"
  | "short_deduction"
  | "excess_deduction"
  | "not_deducted_but_expected"
  | "deducted_below_limit"
  | "foreign_currency";

export const DEDUCTION_FLAG_TEXT: Record<DeductionFlag, { title: string; detail: string }> = {
  no_section: { title: "No section chosen", detail: "TDS was deducted but the bill does not say under which section. Choose the section on the bill." },
  section_not_set_up: { title: "Section not set up", detail: "This section is not on your list of TDS sections, or you have switched it off, so the deduction cannot be checked. Check TDS, Sections & rates." },
  rate_not_entered: { title: "Rate not entered for this section", detail: "The section has no rate. If you set your own figures for it, enter the rate in TDS settings, Advanced." },
  numbers_unconfirmed: { title: "Section numbers not confirmed", detail: "The rate and limits for this section have not been checked yet (by the platform, or by your CA for figures you set yourself), so treat the check below as indicative." },
  pan_missing: { title: "Vendor PAN missing", detail: "The vendor has no PAN on file. A higher rate can apply when a PAN is not given; your CA will tell you which. Get the PAN and add it to the vendor." },
  pan_invalid: { title: "Vendor PAN looks wrong", detail: "The PAN saved for this vendor is not in the right format. Correct it on the vendor." },
  short_deduction: { title: "Deducted less than expected", detail: "Less tax was deducted than the section's rate gives. A short deduction can lead to interest and a demand; ask your CA." },
  excess_deduction: { title: "Deducted more than expected", detail: "More tax was deducted than the section's rate gives. The vendor may ask for the excess back; check the rate." },
  not_deducted_but_expected: { title: "Nothing deducted, but the limit is crossed", detail: "The section's limit is crossed with this bill, yet no TDS was deducted. Check with your CA before paying." },
  foreign_currency: { title: "Bill is not in rupees", detail: "TDS limits and rates are in rupees, so this bill is listed but not checked or added to the totals. Ask your CA how to treat it." },
  deducted_below_limit: { title: "Deducted below the limit", detail: "TDS was deducted although the payments to this vendor are still below the section's limit. This may be intended; check with your CA." },
};

export interface DeductionRow {
  bill: BillForTds;
  section: string | null;
  fy: string;
  quarter: Quarter;
  vendorPan: string | null;
  /** What the settings say should be deducted on this bill (rupees); null when it cannot be worked out. */
  expected: number | null;
  /** Rate applied for the expectation (percent). */
  expectedRate: number | null;
  deducted: number;
  flags: DeductionFlag[];
}

/**
 * What the settings say should be deducted on one payment. `yearBefore` is what was paid to this payee under this section earlier in the
 * financial year (`paid`) and how much of that was already taxed (`taxedBase`). If neither limit is set, every payment is taxed. A payment
 * above the single-payment limit is taxed. Otherwise, once the year's total passes the yearly limit, tax is due on everything paid so far
 * this year that has not been taxed yet. This is the usual reading; whether it fits a section is for the CA to confirm.
 */
export function expectedTds(cfg: SectionConfig, hasValidPan: boolean, base: number, yearBefore: { paid: number; taxedBase: number }): { amount: number; rate: number; taxableBase: number } | null {
  const rate = !hasValidPan && cfg.noPanRate !== null ? cfg.noPanRate : cfg.rate;
  if (rate === null) return null;
  const baseP = paise(base);
  const beforeP = paise(yearBefore.paid);
  const noTest = cfg.singleThreshold === null && cfg.annualThreshold === null;
  const passesSingle = cfg.singleThreshold !== null && base > cfg.singleThreshold;
  const passesAnnual = cfg.annualThreshold !== null && rupees(beforeP + baseP) > cfg.annualThreshold;
  if (!(noTest || passesSingle || passesAnnual)) return { amount: 0, rate, taxableBase: 0 };
  const taxableP = passesSingle || noTest ? baseP : Math.max(0, beforeP + baseP - paise(yearBefore.taxedBase));
  return { amount: rupees(Math.round((taxableP * rate) / 100)), rate, taxableBase: rupees(taxableP) };
}

/**
 * One row per bill that has TDS on it, or should have. `settings` is keyed by section code (upper-case). Bills are taken in date order
 * so the yearly total to a vendor builds up the way it did in time.
 */
export function deductionRows(bills: BillForTds[], settings: Map<string, SectionConfig>): DeductionRow[] {
  const live = bills.filter((b) => b.status !== "cancelled").sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.billNumber < b.billNumber ? -1 : 1));
  const year = new Map<string, { paid: number; taxedBase: number }>();
  const rows: DeductionRow[] = [];
  for (const bill of live) {
    const section = bill.section?.trim().toUpperCase() || null;
    const fy = financialYearOf(bill.date);
    const cfg = section ? settings.get(section) ?? null : null;
    const pan = validPan(bill.vendorPan);
    const flags: DeductionFlag[] = [];
    const key = `${bill.vendorId}|${section ?? ""}|${fy}`;
    const before = year.get(key) ?? { paid: 0, taxedBase: 0 };
    if (bill.currency && bill.currency !== "INR") {
      // limits and rates are in rupees: show it, do not work on it and keep it out of the running totals
      rows.push({ bill, section, fy, quarter: quarterOf(bill.date), vendorPan: pan, expected: null, expectedRate: null, deducted: 0, flags: ["foreign_currency"] });
      continue;
    }
    let taxedNow = bill.tdsAmount > 0 ? bill.base : 0;

    let expected: number | null = null;
    let expectedRate: number | null = null;
    if (!section) {
      if (bill.tdsAmount > 0) flags.push("no_section");
    } else if (!cfg || !cfg.active) {
      flags.push("section_not_set_up");
    } else {
      if (cfg.rate === null) flags.push("rate_not_entered");
      if (!cfg.confirmed) flags.push("numbers_unconfirmed");
      const e = expectedTds(cfg, pan !== null, bill.base, before);
      if (e) {
        // what was taxed by this bill includes any earlier payments it caught up on
        if (bill.tdsAmount > 0 && e.taxableBase > 0) taxedNow = e.taxableBase;
        expected = e.amount;
        expectedRate = e.rate;
        const diff = paise(bill.tdsAmount) - paise(e.amount);
        if (diff < -1) flags.push(e.amount > 0 && bill.tdsAmount === 0 ? "not_deducted_but_expected" : "short_deduction");
        else if (diff > 1) flags.push(e.amount === 0 ? "deducted_below_limit" : "excess_deduction");
      }
    }
    if (section && !pan) flags.push(bill.vendorPan?.trim() ? "pan_invalid" : "pan_missing");

    if (section) year.set(key, { paid: r2(before.paid + bill.base), taxedBase: r2(before.taxedBase + taxedNow) });
    if (bill.tdsAmount > 0 || flags.length > 0 || (expected ?? 0) > 0) {
      rows.push({ bill, section, fy, quarter: quarterOf(bill.date), vendorPan: pan, expected, expectedRate, deducted: r2(bill.tdsAmount), flags });
    }
  }
  return rows;
}

export interface TdsTotals {
  paidOrCredited: number;
  deducted: number;
  expected: number;
}
export function totalsOf(allRows: DeductionRow[]): TdsTotals {
  const rows = allRows.filter((r) => !r.flags.includes("foreign_currency"));
  return {
    paidOrCredited: r2(rows.reduce((n, r) => n + r.bill.base, 0)),
    deducted: r2(rows.reduce((n, r) => n + r.deducted, 0)),
    expected: r2(rows.reduce((n, r) => n + (r.expected ?? 0), 0)),
  };
}

/** Deducted by month (YYYY-MM of the bill date): what has to be deposited for each month. */
export function deductedByMonth(rows: DeductionRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.bill.date.slice(0, 7), r2((m.get(r.bill.date.slice(0, 7)) ?? 0) + r.deducted));
  return m;
}

// ───────────────────────────── deposits (challans) ─────────────────────────────

export interface ChallanLike {
  /** The month the tax belongs to (YYYY-MM), as the challan says. */
  forMonth: string;
  amount: number;
  status: string;
}

export interface MonthPosition {
  month: string;
  deducted: number;
  deposited: number;
  /** Deducted less deposited: positive = still to deposit, negative = deposited more than deducted. */
  difference: number;
}

export function depositPosition(deducted: Map<string, number>, challans: ChallanLike[]): MonthPosition[] {
  const dep = new Map<string, number>();
  for (const c of challans) if (c.status !== "cancelled") dep.set(c.forMonth, r2((dep.get(c.forMonth) ?? 0) + c.amount));
  const months = [...new Set([...deducted.keys(), ...dep.keys()])].sort();
  return months.map((month) => {
    const d = deducted.get(month) ?? 0;
    const p = dep.get(month) ?? 0;
    return { month, deducted: d, deposited: p, difference: r2(d - p) };
  });
}

export function challanProblem(c: { forMonth: string; amount: number; paidOn: string; bsrCode: string; serial: string }): string | null {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.forMonth)) return "Choose the month the tax belongs to.";
  if (!(c.amount > 0) || !Number.isFinite(c.amount) || c.amount > 1e10) return "Enter the amount deposited.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.paidOn) || new Date(`${c.paidOn}T00:00:00Z`).toISOString().slice(0, 10) !== c.paidOn) return "Enter the date it was deposited.";
  if (!/^\d{7}$/.test(c.bsrCode.trim())) return "The bank's BSR code has 7 digits (it is on the challan).";
  if (!/^\d{1,5}$/.test(c.serial.trim())) return "The challan serial number has up to 5 digits (it is on the challan).";
  return null;
}
