/** Value formatting for variables (India style). Pure, client-safe. */
import { rupeesInWords } from "@/lib/number-to-words";
import type { VariableFormat } from "@/lib/products/playbook-ai/doc/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 1234567.5 -> "12,34,567.50" (lakh/crore grouping). Whole numbers print without decimals. */
export function indianGrouping(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(n);
  const whole = Math.trunc(abs);
  const frac = Math.round((abs - whole) * 100);
  let digits = String(whole);
  if (digits.length > 3) {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    digits = `${rest},${last3}`;
  }
  const out = frac === 0 ? digits : `${digits}.${String(frac).padStart(2, "0")}`;
  return neg ? `-${out}` : out;
}

/** `YYYY-MM-DD` to "05 Nov 2026" without going through `Date`, so it never shifts a day with the time zone. */
export function formatIsoDateIndia(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const check = new Date(Date.UTC(y, mo - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return `${String(d).padStart(2, "0")} ${MONTHS[mo - 1]} ${y}`;
}

export type FormatResult = { ok: true; text: string } | { ok: false; reason: string };

const toNumber = (v: string | number | boolean): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/,/g, "").trim()) : NaN;
  return Number.isFinite(n) && (typeof v !== "string" || v.trim() !== "") ? n : null;
};

export function formatValue(value: string | number | boolean, format: VariableFormat = "text"): FormatResult {
  switch (format) {
    case "text":
      return { ok: true, text: String(value) };
    case "upper":
      return { ok: true, text: String(value).toUpperCase() };
    case "date": {
      const t = formatIsoDateIndia(String(value));
      return t ? { ok: true, text: t } : { ok: false, reason: "not a date (expected YYYY-MM-DD)" };
    }
    case "number": {
      const n = toNumber(value);
      return n === null ? { ok: false, reason: "not a number" } : { ok: true, text: indianGrouping(n) };
    }
    case "money": {
      const n = toNumber(value);
      return n === null ? { ok: false, reason: "not an amount" } : { ok: true, text: `₹ ${indianGrouping(n)}` };
    }
    case "words": {
      const n = toNumber(value);
      if (n === null || n < 0 || n > 999_999_999_999) return { ok: false, reason: "not an amount that can be written in words" };
      return { ok: true, text: rupeesInWords(n) };
    }
  }
}
