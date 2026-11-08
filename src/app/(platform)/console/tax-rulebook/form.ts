/**
 * The edit form of the tax rulebook, kept as plain text fields (what the administrator typed) and turned into a TaxRulebook here, on the server.
 * Pure. Numbers are read strictly: digits with an optional decimal part, so "1e5", "-2", "1,000" and "abc" are refused instead of guessed at.
 */
import type { DueRule, DueWhen, TaxRegime, TaxRulebook, TdsSectionRule } from "@/lib/products/cashflow-ai/rulebook/rules";

export interface TdsForm { code: string; label: string; covers: string; rate: string; noPanRate: string; singleThreshold: string; annualThreshold: string }
export interface SlabForm { above: string; rate: string }
export interface RegimeForm { id: string; label: string; who: string; baseRate: string; cessRate: string; matRate: string; slabs: SlabForm[] }
export interface InstalmentForm { dueDate: string; cumulativePercent: string }
export interface DueForm {
  id: string; name: string; form: string; category: DueRule["category"];
  kind: DueWhen["kind"]; day: string; monthsAfter: string; month: string; fyOffset: "0" | "1"; dates: string[];
}
export interface RulebookForm { source: string; tds: TdsForm[]; regimes: RegimeForm[]; advanceTax: InstalmentForm[]; dueRules: DueForm[] }

export const CATEGORIES: DueRule["category"][] = ["gst", "tds", "income_tax", "payroll", "roc", "audit", "other"];
export const CATEGORY_LABEL: Record<DueRule["category"], string> = { gst: "GST", tds: "TDS", income_tax: "Income tax", payroll: "Payroll", roc: "Company law (ROC)", audit: "Audit and meetings", other: "Other" };

const NUMBER = /^\d+(\.\d{1,6})?$/;
const INTEGER = /^\d{1,3}$/;

/** Reads a typed number. Empty is `null` only where the field allows it; anything else that is not plain digits is an error. */
function num(raw: string, what: string, errors: string[], nullable: boolean): number | null {
  const s = (raw ?? "").trim();
  if (s === "") {
    if (!nullable) errors.push(`${what}: enter a number.`);
    return null;
  }
  if (!NUMBER.test(s)) {
    errors.push(`${what}: "${s}" is not a plain positive number (digits and an optional decimal point only).`);
    return null;
  }
  return Number(s);
}
function int(raw: string, what: string, errors: string[]): number {
  const s = (raw ?? "").trim();
  if (!INTEGER.test(s)) {
    errors.push(`${what}: "${s}" is not a whole number.`);
    return 0;
  }
  return Number(s);
}

export function formToRulebook(fy: string, f: RulebookForm): { ok: true; rulebook: TaxRulebook } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const tds: TdsSectionRule[] = f.tds.map((r, i) => {
    const w = `TDS row ${i + 1} (${r.code.trim() || "no code"})`;
    return {
      code: r.code.trim(), label: r.label.trim(), covers: r.covers.trim(),
      rate: num(r.rate, `${w}, rate`, errors, false) ?? 0,
      noPanRate: num(r.noPanRate, `${w}, no-PAN rate`, errors, true),
      singleThreshold: num(r.singleThreshold, `${w}, single-payment limit`, errors, true),
      annualThreshold: num(r.annualThreshold, `${w}, yearly limit`, errors, true),
    };
  });
  const regimes: TaxRegime[] = f.regimes.map((r, i) => {
    const w = `Tax basis ${i + 1} (${r.label.trim() || "no name"})`;
    return {
      id: r.id.trim(), label: r.label.trim(), who: r.who.trim(),
      baseRate: num(r.baseRate, `${w}, rate`, errors, false) ?? 0,
      cessRate: num(r.cessRate, `${w}, cess`, errors, false) ?? 0,
      matRate: num(r.matRate, `${w}, MAT`, errors, true),
      surchargeSlabs: r.slabs.map((s, j) => ({
        above: num(s.above, `${w}, surcharge slab ${j + 1} income`, errors, false) ?? 0,
        rate: num(s.rate, `${w}, surcharge slab ${j + 1} rate`, errors, false) ?? 0,
      })),
    };
  });
  const advanceTax = f.advanceTax.map((r, i) => ({
    dueDate: r.dueDate.trim(),
    cumulativePercent: num(r.cumulativePercent, `Advance tax instalment ${i + 1}, percentage`, errors, false) ?? 0,
  }));
  const dueRules: DueRule[] = f.dueRules.map((r, i) => {
    const w = `Due-date rule ${i + 1} (${r.id.trim() || "no id"})`;
    let when: DueWhen;
    if (r.kind === "monthly" || r.kind === "quarterly") when = { kind: r.kind, day: int(r.day, `${w}, day`, errors), monthsAfter: int(r.monthsAfter, `${w}, months after`, errors) };
    else if (r.kind === "yearly") when = { kind: "yearly", month: int(r.month, `${w}, month`, errors), day: int(r.day, `${w}, day`, errors), fyOffset: r.fyOffset === "1" ? 1 : 0 };
    else if (r.kind === "dates") when = { kind: "dates", dates: r.dates.map((d) => d.trim()).filter(Boolean) };
    else {
      errors.push(`${w}: unknown kind of rule.`);
      when = { kind: "dates", dates: [] };
    }
    return { id: r.id.trim(), name: r.name.trim(), form: r.form.trim() || null, category: CATEGORIES.includes(r.category) ? r.category : "other", when };
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, rulebook: { fy, source: f.source.trim(), tds, regimes, advanceTax, dueRules } };
}

const s = (n: number | null) => (n === null ? "" : String(n));

/** The form's starting values from a stored rulebook. */
export function rulebookToForm(rb: TaxRulebook): RulebookForm {
  return {
    source: rb.source,
    tds: rb.tds.map((r) => ({ code: r.code, label: r.label, covers: r.covers, rate: s(r.rate), noPanRate: s(r.noPanRate), singleThreshold: s(r.singleThreshold), annualThreshold: s(r.annualThreshold) })),
    regimes: rb.regimes.map((r) => ({ id: r.id, label: r.label, who: r.who, baseRate: s(r.baseRate), cessRate: s(r.cessRate), matRate: s(r.matRate), slabs: r.surchargeSlabs.map((x) => ({ above: s(x.above), rate: s(x.rate) })) })),
    advanceTax: rb.advanceTax.map((i) => ({ dueDate: i.dueDate, cumulativePercent: s(i.cumulativePercent) })),
    dueRules: rb.dueRules.map((r) => ({
      id: r.id, name: r.name, form: r.form ?? "", category: r.category, kind: r.when.kind,
      day: r.when.kind === "dates" ? "" : s(r.when.day), monthsAfter: r.when.kind === "monthly" || r.when.kind === "quarterly" ? s(r.when.monthsAfter) : "",
      month: r.when.kind === "yearly" ? s(r.when.month) : "", fyOffset: r.when.kind === "yearly" ? (String(r.when.fyOffset) as "0" | "1") : "1",
      dates: r.when.kind === "dates" ? [...r.when.dates] : [],
    })),
  };
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
const monthsWord = (n: number) => (n === 0 ? "in the same month" : n === 1 ? "in the next month" : `${n} months later`);

/** A due-date rule in plain words. */
export function describeWhen(w: DueWhen): string {
  if (w.kind === "monthly") return `The ${ordinal(w.day)} of the month, ${w.monthsAfter === 0 ? "in the month the work is for" : `${monthsWord(w.monthsAfter)} after the month the work is for`}`;
  if (w.kind === "quarterly") return `The ${ordinal(w.day)}, ${w.monthsAfter === 0 ? "in the last month of each quarter" : `${monthsWord(w.monthsAfter)} after each quarter ends`}`;
  if (w.kind === "yearly") return `Once a year on ${ordinal(w.day)} ${MONTH_NAMES[w.month - 1] ?? "?"}, in the ${w.fyOffset === 0 ? "first" : "second"} calendar year of the financial year`;
  return w.dates.length ? `On these dates: ${w.dates.join(", ")}` : "No dates set";
}
