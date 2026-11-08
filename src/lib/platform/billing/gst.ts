/**
 * Indian GST for the platform's SaaS invoices. Client-safe, pure functions —
 * no data access, no configuration: the rate, SAC and whether prices include
 * tax come from the Platform Console (`getBillingSettings()`) and are passed in.
 * Money is integer paise throughout, and every split adds up exactly.
 *
 * This is the ONE GSTIN validator for the platform layer (`settings.ts` uses it).
 */

/** GST state / union-territory codes (the first two digits of a GSTIN), including legacy codes still valid on old GSTINs. */
export const GST_STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "28": "Andhra Pradesh (Old)",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "99": "Centre Jurisdiction",
};

const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

/** Name → code, including common older/alternative spellings. */
const STATE_BY_NAME: Record<string, string> = {
  ...Object.fromEntries(Object.entries(GST_STATE_CODES).filter(([code]) => code !== "28" && code !== "25").map(([code, name]) => [key(name), code])),
  nctofdelhi: "07",
  newdelhi: "07",
  orissa: "21",
  pondicherry: "34",
  uttaranchal: "05",
  andamanandnicobar: "35",
  dadraandnagarhaveli: "26",
  damananddiu: "26",
  jandk: "01",
};

/**
 * The GST state code for a state given as a name ("Uttar Pradesh", "orissa")
 * or a code ("09", "9"); null when it can't be identified.
 */
export function gstStateCode(state: string | null | undefined): string | null {
  const s = (state ?? "").trim();
  if (!s) return null;
  if (/^\d{1,2}$/.test(s)) {
    const code = s.padStart(2, "0");
    return GST_STATE_CODES[code] ? code : null;
  }
  return STATE_BY_NAME[key(s)] ?? null;
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Uppercase, spaces removed. */
export function normalizeGstin(gstin: string | null | undefined): string {
  return (gstin ?? "").replace(/\s+/g, "").toUpperCase();
}

function gstinCheckChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36];
}

/**
 * Why a GSTIN is invalid, or null when it's valid: 15 characters — 2-digit
 * state code, 10-character PAN, entity number, "Z", check character — with a
 * known state code and a correct check character.
 */
export function gstinError(gstin: string | null | undefined): string | null {
  const g = normalizeGstin(gstin);
  if (!g) return "GSTIN is empty.";
  if (g.length !== 15) return "A GSTIN has exactly 15 characters.";
  if (!GSTIN_PATTERN.test(g)) return "That doesn't look like a GSTIN (e.g. 09AAACY1234A1Z5).";
  if (!GST_STATE_CODES[g.slice(0, 2)]) return `Unknown GST state code "${g.slice(0, 2)}".`;
  if (gstinCheckChar(g.slice(0, 14)) !== g[14]) return "GSTIN check character doesn't match — please re-check it.";
  return null;
}

export function isValidGstin(gstin: string | null | undefined): boolean {
  return gstinError(gstin) === null;
}

/** State code from a valid GSTIN, else null. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  return isValidGstin(gstin) ? normalizeGstin(gstin).slice(0, 2) : null;
}

/** A party's GST state: its GSTIN's state when it has a valid one, else its stated state. */
export function resolveGstState(gstin: string | null | undefined, state: string | null | undefined): { code: string; name: string } | null {
  const code = stateCodeFromGstin(gstin) ?? gstStateCode(state);
  return code ? { code, name: GST_STATE_CODES[code] } : null;
}

export type SupplyType = "intra" | "inter";

/** Codes offered when choosing a state today (legacy 25/28 and the Centre code 99 are valid on GSTINs but not choosable). */
export const SELECTABLE_GST_STATES: Record<string, string> = Object.fromEntries(Object.entries(GST_STATE_CODES).filter(([code]) => !["25", "28", "99"].includes(code)));

/** Intra-state (CGST + SGST) only when both states are known and equal; otherwise IGST. */
export function supplyTypeFor(sellerStateCode: string | null | undefined, buyerStateCode: string | null | undefined): SupplyType {
  return sellerStateCode && buyerStateCode && sellerStateCode === buyerStateCode ? "intra" : "inter";
}

export interface TaxSplit {
  cgst: number;
  sgst: number;
  igst: number;
}

/** Splits a tax amount: intra → CGST/SGST halves (SGST takes an odd paisa), inter → all IGST. */
export function splitTax(tax: number, supplyType: SupplyType): TaxSplit {
  if (supplyType === "inter") return { cgst: 0, sgst: 0, igst: tax };
  const cgst = Math.floor(tax / 2);
  return { cgst, sgst: tax - cgst, igst: 0 };
}

function assertPaise(n: number, what: string): void {
  if (!Number.isInteger(n)) throw new Error(`${what} must be an integer number of paise (got ${n})`);
}

function assertRate(ratePercent: number): void {
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) throw new Error(`GST rate must be 0–100% (got ${ratePercent})`);
}

/** GST on a taxable value, rounded half-up to the paisa. */
export function taxOn(taxable: number, ratePercent: number): number {
  assertPaise(taxable, "Taxable value");
  assertRate(ratePercent);
  return Math.round((taxable * ratePercent) / 100);
}

/** Taxable value inside a tax-inclusive amount; the tax is the remainder, so the two always add back up exactly. */
export function taxableInside(gross: number, ratePercent: number): number {
  assertPaise(gross, "Amount");
  assertRate(ratePercent);
  return Math.round((gross * 100) / (100 + ratePercent));
}

/**
 * Spreads `target` over `weights` in proportion, largest remainder first, so
 * the parts are integers summing to exactly `target`. Weights may be negative
 * (discount lines); their sum must not be 0 unless target is 0.
 */
export function allocate(target: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) {
    if (target !== 0) throw new Error("Can't allocate a non-zero amount over weights summing to 0");
    return weights.map(() => 0);
  }
  const exact = weights.map((w) => (w * target) / sum);
  const parts = exact.map(Math.floor);
  let left = target - parts.reduce((a, b) => a + b, 0);
  const order = exact.map((e, i) => ({ i, frac: e - Math.floor(e) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) parts[order[k].i] += 1;
  return parts;
}

export interface GstComputation extends TaxSplit {
  supplyType: SupplyType;
  ratePercent: number;
  /** Taxable value of each input line, same order; sums to `taxable`. */
  lineTaxable: number[];
  taxable: number;
  tax: number;
  total: number;
}

export interface GstInput {
  /** Line amounts in paise (discount lines negative). Pre-tax, or tax-inclusive when `pricesIncludeTax`. */
  amounts: number[];
  ratePercent: number;
  pricesIncludeTax: boolean;
  sellerStateCode: string | null;
  buyerStateCode: string | null;
}

/**
 * GST for an invoice's lines.
 *  - Prices exclude tax: taxable = sum of lines; tax = taxable × rate, rounded once
 *    on the invoice (not per line), so it never drifts by line count.
 *  - Prices include tax: gross = sum of lines; taxable is back-calculated and
 *    spread over the lines by largest remainder.
 * The total never depends on intra/inter — only the split does — so what a
 * customer is charged is known before their state is.
 */
export function computeGst(input: GstInput): GstComputation {
  input.amounts.forEach((a) => assertPaise(a, "Line amount"));
  const sum = input.amounts.reduce((a, b) => a + b, 0);
  if (sum < 0) throw new Error("Invoice lines add up to less than zero");
  const supplyType = supplyTypeFor(input.sellerStateCode, input.buyerStateCode);
  let taxable: number;
  let lineTaxable: number[];
  let tax: number;
  if (input.pricesIncludeTax) {
    taxable = taxableInside(sum, input.ratePercent);
    tax = sum - taxable;
    lineTaxable = allocate(taxable, input.amounts);
  } else {
    taxable = sum;
    tax = taxOn(taxable, input.ratePercent);
    lineTaxable = [...input.amounts];
  }
  return { supplyType, ratePercent: input.ratePercent, lineTaxable, taxable, tax, total: taxable + tax, ...splitTax(tax, supplyType) };
}

/** What a customer is charged (tax-inclusive, paise) for a pre-discount-netted quote amount. */
export function chargeTotal(netAmount: number, ratePercent: number, pricesIncludeTax: boolean): number {
  return pricesIncludeTax ? netAmount : netAmount + taxOn(netAmount, ratePercent);
}

export interface TaxAmounts extends TaxSplit {
  taxable: number;
  total: number;
}

/**
 * The part of an invoice a credit note of `amount` (tax-inclusive) reverses,
 * given what is still un-credited (`remaining`). Crediting the whole remainder
 * reverses it exactly; a partial credit is split in the invoice's own
 * taxable : tax proportion. Never exceeds the remainder in any component.
 */
export function creditNoteAmounts(remaining: TaxAmounts, amount: number, supplyType: SupplyType): TaxAmounts {
  assertPaise(amount, "Credit amount");
  if (amount <= 0) throw new Error("Credit amount must be more than zero");
  if (amount > remaining.total) throw new Error("Credit amount is more than what's left to credit on this invoice");
  if (amount === remaining.total) return { ...remaining };
  // taxable = round(remaining.taxable × share) keeps the tax part ≤ what's left of the tax.
  const taxable = Math.min(remaining.taxable, Math.round((remaining.taxable * amount) / remaining.total));
  const tax = amount - taxable;
  if (supplyType === "inter") return { taxable, cgst: 0, sgst: 0, igst: tax, total: amount };
  // Halve, then keep each head within what's left of it (odd paise on earlier partial credits).
  let cgst = Math.min(Math.floor(tax / 2), remaining.cgst);
  let sgst = tax - cgst;
  if (sgst > remaining.sgst) {
    sgst = remaining.sgst;
    cgst = tax - sgst;
  }
  return { taxable, cgst, sgst, igst: 0, total: amount };
}

/** "18%" / "9%" labels from a percent. */
export function gstPercentLabel(ratePercent: number): string {
  return `${Math.round(ratePercent * 100) / 100}%`;
}
