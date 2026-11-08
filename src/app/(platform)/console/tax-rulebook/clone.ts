/**
 * "Copy last year into this year": the previous financial year's table with every fixed date moved forward by the years between the two, same month
 * and day. 29 February moves to 28 February in a year that has none. Rules defined by day and month (monthly, quarterly, yearly) have no fixed
 * year, so they carry over unchanged. The copy is a draft: the caller saves it unconfirmed.
 */
import type { TaxRulebook } from "@/lib/products/cashflow-ai/rulebook/rules";

const isLeap = (y: number) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

/** Moves an ISO date by whole years, keeping month and day. Anything that is not an ISO date is returned as it is (validation will report it). */
export function shiftDateByYears(date: string, years: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const y = Number(m[1]) + years;
  const day = m[2] === "02" && m[3] === "29" && !isLeap(y) ? "28" : m[3];
  return `${String(y).padStart(4, "0")}-${m[2]}-${day}`;
}

export function cloneRulebookForYear(prev: TaxRulebook, toFy: string): TaxRulebook {
  const years = Number(toFy.slice(0, 4)) - Number(prev.fy.slice(0, 4));
  const copy = structuredClone(prev);
  return {
    ...copy,
    fy: toFy,
    source: `Copied from FY ${prev.fy}; dates moved forward ${years} year(s). Not yet checked against the notification for FY ${toFy}.`,
    advanceTax: copy.advanceTax.map((i) => ({ ...i, dueDate: shiftDateByYears(i.dueDate, years) })),
    dueRules: copy.dueRules.map((r) => (r.when.kind === "dates" ? { ...r, when: { kind: "dates" as const, dates: r.when.dates.map((d) => shiftDateByYears(d, years)) } } : r)),
  };
}
