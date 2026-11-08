import type { BillingInterval, CompanySubscription } from "@/lib/platform/billing/types";

/**
 * Client-safe helpers for the subscription checkout: tax totals (rate from the
 * billing settings, never a constant), the price summary shape, and the
 * company's billing (GST invoice) details — used by both the billing page
 * and the server-side service, so the browser and the server always agree.
 */

export type BillingDetails = NonNullable<CompanySubscription["billingDetails"]>;

/** Indian states / union territories with their GST state codes (first two digits of a GSTIN). */
export const GST_STATES: readonly { code: string; name: string }[] = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
];

export function gstStateCode(stateName: string): string | null {
  return GST_STATES.find((s) => s.name === stateName)?.code ?? null;
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Format + check digit of a 15-character GSTIN. Returns an error message, or null when valid. */
export function gstinError(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (!GSTIN_PATTERN.test(g)) return "Enter a valid 15-character GSTIN, e.g. 27AAPFU0939F1ZV.";
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = GSTIN_CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  if (GSTIN_CHARS[(36 - (sum % 36)) % 36] !== g[14]) return "This GSTIN's check digit doesn't match — please re-check it.";
  if (!GST_STATES.some((s) => s.code === g.slice(0, 2))) return "This GSTIN starts with an unknown state code.";
  return null;
}

export type BillingDetailsErrors = Partial<Record<keyof BillingDetails, string>>;

/** Validates and normalises billing details. Never trusts the browser: the server runs this again. */
export function validateBillingDetails(input: Partial<Record<keyof BillingDetails, unknown>>): { ok: true; value: BillingDetails } | { ok: false; errors: BillingDetailsErrors } {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const legalName = str(input.legalName).replace(/\s+/g, " ");
  const gstinRaw = str(input.gstin).toUpperCase().replace(/\s+/g, "");
  const address = str(input.address);
  const state = str(input.state);
  const email = str(input.email).toLowerCase();
  const errors: BillingDetailsErrors = {};

  if (legalName.length < 2) errors.legalName = "Enter your company's legal name.";
  else if (legalName.length > 200) errors.legalName = "Keep the legal name under 200 characters.";
  if (address.length < 5) errors.address = "Enter your billing address.";
  else if (address.length > 500) errors.address = "Keep the address under 500 characters.";
  if (!GST_STATES.some((s) => s.name === state)) errors.state = "Choose your state.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = "Enter a valid email address for invoices.";
  if (gstinRaw) {
    const err = gstinError(gstinRaw);
    if (err) errors.gstin = err;
    else if (!errors.state && gstStateCode(state) !== gstinRaw.slice(0, 2)) errors.gstin = `This GSTIN is registered in a different state than ${state}.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { legalName, gstin: gstinRaw || null, address, state, email } };
}

/** Tax on a pre-tax (or, when prices include tax, tax-inclusive) amount — settings-driven, never a constant. */
export function taxTotals(taxable: number, gstRatePercent: number, pricesIncludeTax: boolean): { net: number; gst: number; total: number } {
  const rate = Math.max(0, gstRatePercent);
  if (pricesIncludeTax) {
    const net = Math.round((taxable * 100) / (100 + rate));
    return { net, gst: taxable - net, total: taxable };
  }
  const gst = Math.round((taxable * rate) / 100);
  return { net: taxable, gst, total: taxable + gst };
}

/** A priced checkout, serializable for the billing page (built from `quoteCheckout`). */
export interface PriceSummary {
  planId: string;
  planName: string;
  interval: BillingInterval;
  currency: string;
  lines: { kind: "plan" | "addon" | "discount"; label: string; amount: number }[];
  subtotal: number;
  discount: number;
  net: number;
  gst: number;
  gstRatePercent: number;
  pricesIncludeTax: boolean;
  total: number;
  couponCode: string | null;
  couponApplied: boolean;
  couponError: string | null;
}

/** What the plan picker shows for one plan (serializable). Prices are catalogue list prices, pre-tax. */
export interface PlanOption {
  id: string;
  name: string;
  description: string;
  currency: string;
  /** Null when the plan doesn't offer that billing cycle. */
  priceMonthly: number | null;
  priceYearly: number | null;
  /** What the plan includes, for the order summary (users, storage, AI …). */
  perks?: { label: string; value: string }[];
}
