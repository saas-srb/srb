/**
 * The tax rulebook: the law's numbers for the company's accounts — TDS sections, company income-tax rates, advance-tax instalments and the
 * dates of returns and payments — one document per financial year. The platform publishes it once for every company (see rules-store.ts), so a
 * company never types a rate or a date. Pure: types, the built-in starting tables, validation and the calendar a rulebook produces.
 *
 * IMPORTANT — the built-in tables below are a starting point written from the law as understood for FY 2025-26 and carried to FY 2026-27 as
 * "assumed unchanged". The Income-tax Act, 2025 replaces the 1961 Act from 1 April 2026 and the Finance Act of each year changes limits and
 * dates, so every built-in table is UNCONFIRMED until a platform administrator checks it against the current notification and confirms it in
 * the Console. Every screen that uses an unconfirmed table says so.
 */
import type { Instalment } from "@/lib/products/cashflow-ai/income-tax/core";

export interface TdsSectionRule {
  code: string;
  label: string;
  covers: string;
  /** Percent. */
  rate: number;
  /** Percent when the payee has no valid PAN. null = the platform has not published one (the app then flags the missing PAN, it does not guess). */
  noPanRate: number | null;
  /** Deduct only when ONE payment is above this (rupees). null = no such test. */
  singleThreshold: number | null;
  /** Deduct only once the year's total to the payee is above this (rupees). null = no such test. */
  annualThreshold: number | null;
}

export interface SurchargeSlab {
  /** The surcharge rate applies when taxable income is above this (rupees). */
  above: number;
  rate: number;
}

export interface TaxRegime {
  id: string;
  label: string;
  /** Plain words: who this suits / when it applies, for the person choosing. */
  who: string;
  baseRate: number;
  /** Surcharge by income slab, highest matching slab wins. Empty = none. */
  surchargeSlabs: SurchargeSlab[];
  cessRate: number;
  /** MAT as percent of book profit; null = this regime does not pay MAT. */
  matRate: number | null;
}

export type DueWhen =
  /** Every month, on `day` of the month that is `monthsAfter` after the month the work is for (GSTR-3B for July is due on the 20th of August: day 20, monthsAfter 1). */
  | { kind: "monthly"; day: number; monthsAfter: number }
  /** Every quarter, `monthsAfter` after the quarter's last month, on `day`. */
  | { kind: "quarterly"; day: number; monthsAfter: number }
  /** Once a year on month/day, in the financial year's first (fyOffset 0) or second (1) calendar year. */
  | { kind: "yearly"; month: number; day: number; fyOffset: 0 | 1 }
  /** Exact dates, for things whose dates are announced one by one. */
  | { kind: "dates"; dates: string[] };

export interface DueRule {
  id: string;
  name: string;
  form: string | null;
  category: "gst" | "tds" | "income_tax" | "payroll" | "roc" | "audit" | "other";
  when: DueWhen;
}

export interface TaxRulebook {
  fy: string;
  /** Where the figures come from, in a line a person can check (the Act / notification the administrator used). */
  source: string;
  tds: TdsSectionRule[];
  regimes: TaxRegime[];
  advanceTax: Instalment[];
  dueRules: DueRule[];
}

export interface RulebookEntry extends TaxRulebook {
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: string | null;
  origin: "built-in" | "published";
}

// ───────────────────────────── built-in starting tables ─────────────────────────────

const TDS_BUILTIN: TdsSectionRule[] = [
  { code: "194C", label: "Contractors", covers: "Payments to contractors and sub-contractors for carrying out work, including advertising and transport. The rate shown is the higher one (companies, firms); payments to an individual or HUF are taxed at a lower rate.", rate: 2, noPanRate: 20, singleThreshold: 30000, annualThreshold: 100000 },
  { code: "194H", label: "Commission or brokerage", covers: "Commission or brokerage paid to an agent.", rate: 2, noPanRate: 20, singleThreshold: null, annualThreshold: 20000 },
  { code: "194I(a)", label: "Rent: machinery, plant, equipment", covers: "Rent for machinery, plant or equipment.", rate: 2, noPanRate: 20, singleThreshold: null, annualThreshold: 600000 },
  { code: "194I(b)", label: "Rent: land, building, furniture", covers: "Rent for land, building, furniture or fittings.", rate: 10, noPanRate: 20, singleThreshold: null, annualThreshold: 600000 },
  { code: "194J(a)", label: "Technical services, call centre", covers: "Fees for technical services (not professional), and call-centre services.", rate: 2, noPanRate: 20, singleThreshold: null, annualThreshold: 50000 },
  { code: "194J(b)", label: "Professional fees, royalty, director's fees", covers: "Fees for professional services, royalty, and director's fees.", rate: 10, noPanRate: 20, singleThreshold: null, annualThreshold: 50000 },
  { code: "194A", label: "Interest (other than on securities)", covers: "Interest paid or credited, for example on loans taken.", rate: 10, noPanRate: 20, singleThreshold: null, annualThreshold: 10000 },
  { code: "194Q", label: "Purchase of goods", covers: "Purchase of goods from one seller above a yearly limit. Tax is on the amount above the limit.", rate: 0.1, noPanRate: 5, singleThreshold: null, annualThreshold: 5000000 },
  { code: "194R", label: "Benefit or perquisite", covers: "Benefits or perquisites given in the course of business.", rate: 10, noPanRate: 20, singleThreshold: null, annualThreshold: 20000 },
];

const REGIMES_BUILTIN: TaxRegime[] = [
  { id: "concessional-22", label: "Concessional rate (no other deductions or incentives)", who: "Most small and medium companies: a lower flat rate in return for giving up certain deductions. No MAT.", baseRate: 22, surchargeSlabs: [{ above: 0, rate: 10 }], cessRate: 4, matRate: null },
  { id: "normal-25", label: "Normal rate, smaller companies", who: "Companies that keep their deductions and whose turnover is within the limit the law sets for the lower rate.", baseRate: 25, surchargeSlabs: [{ above: 10000000, rate: 7 }, { above: 100000000, rate: 12 }], cessRate: 4, matRate: 15 },
  { id: "normal-30", label: "Normal rate", who: "Other companies that keep their deductions.", baseRate: 30, surchargeSlabs: [{ above: 10000000, rate: 7 }, { above: 100000000, rate: 12 }], cessRate: 4, matRate: 15 },
];

const ADVANCE_BUILTIN = (fy: string): Instalment[] => {
  const y = Number(fy.slice(0, 4));
  return [
    { dueDate: `${y}-06-15`, cumulativePercent: 15 },
    { dueDate: `${y}-09-15`, cumulativePercent: 45 },
    { dueDate: `${y}-12-15`, cumulativePercent: 75 },
    { dueDate: `${y + 1}-03-15`, cumulativePercent: 100 },
  ];
};

const DUE_BUILTIN = (fy: string): DueRule[] => [
  { id: "gstr1", name: "GST: outward supplies return", form: "GSTR-1", category: "gst", when: { kind: "monthly", day: 11, monthsAfter: 1 } },
  { id: "gstr3b", name: "GST: summary return and tax payment", form: "GSTR-3B", category: "gst", when: { kind: "monthly", day: 20, monthsAfter: 1 } },
  { id: "gstr9", name: "GST: annual return", form: "GSTR-9", category: "gst", when: { kind: "yearly", month: 12, day: 31, fyOffset: 1 } },
  { id: "tds-deposit", name: "TDS: deposit of tax deducted", form: "Challan 281", category: "tds", when: { kind: "monthly", day: 7, monthsAfter: 1 } },
  { id: "tds-return", name: "TDS: quarterly statement", form: "24Q / 26Q", category: "tds", when: { kind: "dates", dates: [`${fy.slice(0, 4)}-07-31`, `${fy.slice(0, 4)}-10-31`, `${Number(fy.slice(0, 4)) + 1}-01-31`, `${Number(fy.slice(0, 4)) + 1}-05-31`] } },
  { id: "pf", name: "Provident fund: contribution and return", form: "EPF ECR", category: "payroll", when: { kind: "monthly", day: 15, monthsAfter: 1 } },
  { id: "esi", name: "ESI: contribution and return", form: "ESI", category: "payroll", when: { kind: "monthly", day: 15, monthsAfter: 1 } },
  { id: "tax-audit", name: "Tax audit report", form: "3CA / 3CB / 3CD", category: "income_tax", when: { kind: "yearly", month: 9, day: 30, fyOffset: 1 } },
  { id: "itr6", name: "Income-tax return of the company", form: "ITR-6", category: "income_tax", when: { kind: "yearly", month: 10, day: 31, fyOffset: 1 } },
  { id: "agm", name: "Annual general meeting", form: null, category: "audit", when: { kind: "yearly", month: 9, day: 30, fyOffset: 1 } },
  { id: "dir3kyc", name: "Director KYC", form: "DIR-3 KYC", category: "roc", when: { kind: "yearly", month: 9, day: 30, fyOffset: 1 } },
  { id: "dpt3", name: "Return of deposits", form: "DPT-3", category: "roc", when: { kind: "yearly", month: 6, day: 30, fyOffset: 1 } },
];

/** The built-in rulebook for a financial year: a starting point, always unconfirmed. */
export function builtinRulebook(fy: string): TaxRulebook {
  return {
    fy,
    source: "Built-in starting table (FY 2025-26 law, assumed unchanged). Not checked against the current notification.",
    tds: TDS_BUILTIN,
    regimes: REGIMES_BUILTIN,
    advanceTax: ADVANCE_BUILTIN(fy),
    dueRules: DUE_BUILTIN(fy),
  };
}

// ───────────────────────────── validation ─────────────────────────────

const realDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const isFy = (fy: string) => /^\d{4}-\d{2}$/.test(fy) && (Number(fy.slice(0, 4)) + 1) % 100 === Number(fy.slice(5, 7));
const pct = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100;
const amt = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1e11;

export function validateRulebook(rb: TaxRulebook): string[] {
  const e: string[] = [];
  if (!isFy(rb.fy)) e.push("The financial year must look like 2026-27.");
  if (!rb.source || rb.source.trim().length < 5) e.push("Say where the figures come from (the Act or notification used).");
  const seen = new Set<string>();
  for (const s of rb.tds) {
    const c = s.code?.trim().toUpperCase();
    if (!c || !/^[A-Z0-9()]{2,12}$/.test(c)) e.push(`TDS section "${s.code}" needs a short code.`);
    else if (seen.has(c)) e.push(`TDS section ${c} appears twice.`);
    else seen.add(c);
    if (!s.label?.trim()) e.push(`TDS section ${s.code} needs a name.`);
    if (!pct(s.rate)) e.push(`TDS ${s.code}: the rate must be between 0 and 100.`);
    if (s.noPanRate !== null && !pct(s.noPanRate)) e.push(`TDS ${s.code}: the no-PAN rate must be between 0 and 100.`);
    if (s.singleThreshold !== null && !amt(s.singleThreshold)) e.push(`TDS ${s.code}: the single-payment limit is not an amount.`);
    if (s.annualThreshold !== null && !amt(s.annualThreshold)) e.push(`TDS ${s.code}: the yearly limit is not an amount.`);
  }
  const rid = new Set<string>();
  for (const r of rb.regimes) {
    if (!r.id || !/^[a-z0-9-]{2,40}$/.test(r.id)) e.push(`Tax basis "${r.label}" needs an id of lower-case letters, digits and dashes.`);
    else if (rid.has(r.id)) e.push(`Tax basis ${r.id} appears twice.`);
    else rid.add(r.id);
    if (!r.label?.trim()) e.push(`Tax basis ${r.id} needs a name.`);
    if (!pct(r.baseRate)) e.push(`Tax basis ${r.id}: the rate must be between 0 and 100.`);
    if (!pct(r.cessRate)) e.push(`Tax basis ${r.id}: the cess must be between 0 and 100.`);
    if (r.matRate !== null && !pct(r.matRate)) e.push(`Tax basis ${r.id}: the MAT rate must be between 0 and 100.`);
    let last = -1;
    for (const sl of r.surchargeSlabs) {
      if (!amt(sl.above) || !pct(sl.rate)) e.push(`Tax basis ${r.id}: a surcharge slab is not valid.`);
      else if (sl.above <= last) e.push(`Tax basis ${r.id}: surcharge slabs must go up in income.`);
      else last = sl.above;
    }
  }
  if (rb.regimes.length === 0) e.push("Publish at least one income-tax basis.");
  let lp = -1;
  let ld = "";
  for (const i of rb.advanceTax) {
    if (!realDate(i.dueDate)) e.push(`Advance tax: ${i.dueDate} is not a real date.`);
    else if (i.dueDate <= ld) e.push("Advance tax: due dates must be in order.");
    if (!(i.cumulativePercent > 0 && i.cumulativePercent <= 100)) e.push("Advance tax: each percentage must be above 0 and at most 100.");
    else if (i.cumulativePercent <= lp) e.push("Advance tax: the cumulative percentages must keep growing.");
    lp = i.cumulativePercent;
    ld = i.dueDate;
  }
  const did = new Set<string>();
  for (const d of rb.dueRules) {
    if (!d.id || !/^[a-z0-9-]{2,40}$/.test(d.id)) e.push(`Due-date rule "${d.name}" needs an id.`);
    else if (did.has(d.id)) e.push(`Due-date rule ${d.id} appears twice.`);
    else did.add(d.id);
    if (!d.name?.trim()) e.push(`Due-date rule ${d.id} needs a name.`);
    const w = d.when;
    if (w.kind === "monthly" || w.kind === "quarterly") {
      if (!(Number.isInteger(w.day) && w.day >= 1 && w.day <= 31)) e.push(`${d.id}: the day must be 1 to 31.`);
      if (!(Number.isInteger(w.monthsAfter) && w.monthsAfter >= 0 && w.monthsAfter <= 12)) e.push(`${d.id}: months after must be 0 to 12.`);
    } else if (w.kind === "yearly") {
      if (!(Number.isInteger(w.month) && w.month >= 1 && w.month <= 12) || !(Number.isInteger(w.day) && w.day >= 1 && w.day <= 31)) e.push(`${d.id}: the month or day is not valid.`);
    } else if (w.kind === "dates") {
      for (const x of w.dates) if (!realDate(x)) e.push(`${d.id}: ${x} is not a real date.`);
    } else e.push(`${d.id}: unknown kind of date rule.`);
  }
  return e;
}

// ───────────────────────────── the calendar a rulebook produces ─────────────────────────────

export interface CalendarItem {
  ruleId: string;
  name: string;
  form: string | null;
  category: DueRule["category"];
  /** What the item is for: "Sep 2026", "Q2", "FY 2026-27". */
  period: string;
  dueDate: string;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, lastDay(y, m))).padStart(2, "0")}`;
const shift = (y: number, m: number, by: number) => {
  const idx = y * 12 + (m - 1) + by;
  return { y: Math.floor(idx / 12), m: (idx % 12) + 1 };
};

/** Every dated item of a financial year (April to March) that the rulebook's rules give, sorted by date. A day past the end of a month falls on the month's last day. */
export function calendarFor(rb: TaxRulebook): CalendarItem[] {
  const y0 = Number(rb.fy.slice(0, 4));
  const out: CalendarItem[] = [];
  for (const r of rb.dueRules) {
    const base = { ruleId: r.id, name: r.name, form: r.form, category: r.category };
    const w = r.when;
    if (w.kind === "monthly") {
      for (let i = 0; i < 12; i++) {
        const worked = shift(y0, 4, i);
        const due = shift(worked.y, worked.m, w.monthsAfter);
        out.push({ ...base, period: `${MONTHS[worked.m - 1]} ${worked.y}`, dueDate: iso(due.y, due.m, w.day) });
      }
    } else if (w.kind === "quarterly") {
      for (let q = 0; q < 4; q++) {
        const lastMonth = shift(y0, 4, q * 3 + 2);
        const due = shift(lastMonth.y, lastMonth.m, w.monthsAfter);
        out.push({ ...base, period: `Q${q + 1}`, dueDate: iso(due.y, due.m, w.day) });
      }
    } else if (w.kind === "yearly") {
      out.push({ ...base, period: `FY ${rb.fy}`, dueDate: iso(y0 + w.fyOffset, w.month, w.day) });
    } else {
      w.dates.forEach((d, i) => out.push({ ...base, period: w.dates.length > 1 ? `Date ${i + 1}` : `FY ${rb.fy}`, dueDate: d }));
    }
  }
  return out.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name));
}

// ───────────────────────────── choosing a basis, surcharge ─────────────────────────────

/** The surcharge percent for a taxable income under a basis: the highest slab the income is above. */
export function surchargeRateFor(regime: TaxRegime, taxableIncome: number): number {
  let rate = 0;
  for (const s of [...regime.surchargeSlabs].sort((a, b) => a.above - b.above)) if (taxableIncome > s.above) rate = s.rate;
  return rate;
}
