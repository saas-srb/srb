import { sectionProblem } from "@/lib/products/cashflow-ai/tds/core";

/**
 * Reading what a person typed on the TDS settings form, and checking the section picked on a vendor bill.
 * Pure (no database) so the same rules run in the server action and in the tests.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A number typed by a person: empty means "not entered" (null), never 0. Commas and spaces in the digits are allowed; signs, exponents and words are not. */
export function parseOptionalNumber(raw: unknown, what: string, max: number): Parsed<number | null> {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw === "number") {
    if (!Number.isFinite(raw) || raw < 0 || raw > max) return { ok: false, error: `${what} must be between 0 and ${max}.` };
    return { ok: true, value: raw };
  }
  if (typeof raw !== "string") return { ok: false, error: `${what} is not a number.` };
  const s = raw.trim().replace(/[\s,]/g, "");
  if (s === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,4})?$/.test(s)) return { ok: false, error: `${what} must be a plain number, for example 10 or 30000.` };
  const n = Number(s);
  if (!Number.isFinite(n) || n > max) return { ok: false, error: `${what} must be between 0 and ${max}.` };
  return { ok: true, value: n };
}

export interface SectionFormValue {
  code: string;
  label: string;
  rate: number | null;
  singleThreshold: number | null;
  annualThreshold: number | null;
  noPanRate: number | null;
  confirmed: boolean;
  active: boolean;
  /** The advanced editor always saves the company's own figures as an override of the platform's. */
  override: boolean;
  note: string | null;
}

export type SectionFormErrors = Record<string, string>;

export function parseSectionForm(input: Record<string, unknown>): { ok: true; value: SectionFormValue } | { ok: false; errors: SectionFormErrors } {
  const errors: SectionFormErrors = {};
  const num = (key: string, what: string, max: number) => {
    const r = parseOptionalNumber(input[key], what, max);
    if (!r.ok) {
      errors[key] = r.error;
      return null;
    }
    return r.value;
  };
  const rate = num("rate", "The rate", 100);
  const noPanRate = num("noPanRate", "The no-PAN rate", 100);
  const singleThreshold = num("singleThreshold", "The single-payment limit", 1e10);
  const annualThreshold = num("annualThreshold", "The yearly limit", 1e10);
  const value: SectionFormValue = {
    code: String(input.code ?? "").trim().toUpperCase(),
    label: String(input.label ?? "").trim(),
    rate,
    singleThreshold,
    annualThreshold,
    noPanRate,
    confirmed: input.confirmed === true,
    active: input.active !== false,
    override: input.override !== false,
    note: String(input.note ?? "").trim().slice(0, 500) || null,
  };
  if (Object.keys(errors).length === 0) {
    const bad = sectionProblem(value);
    if (bad) errors[/code/i.test(bad) ? "code" : /name/i.test(bad) ? "label" : "form"] = bad;
    else if (value.confirmed && value.rate === null) errors.rate = "Enter the rate before marking the section as confirmed by your CA.";
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value };
}

/**
 * The section chosen on a vendor bill. Empty = no section (TDS is optional). A section must be one on the list the bill form offers (the platform's rulebook for the year, less what the company switched off, plus its own);
 * a bill may keep the section it already has even if that has since been switched off, so old bills can still be edited.
 */
export function resolveBillSection(raw: unknown, sections: { code: string; active: boolean }[], current: string | null = null): Parsed<string | null> {
  const code = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  if (!code) return { ok: true, value: null };
  if (current && code === current.toUpperCase()) return { ok: true, value: code };
  const found = sections.find((s) => s.code.toUpperCase() === code);
  if (!found) return { ok: false, error: "This section is not one of the TDS sections offered for your company. Check TDS, Sections & rates." };
  if (!found.active) return { ok: false, error: "This section is switched off in your TDS settings." };
  return { ok: true, value: code };
}
