import { gstinError } from "@/lib/platform/billing/billing-details";
import { CURRENCIES } from "@/lib/platform/onboarding/catalog";

/**
 * The company's identity: stored ONCE per company (collection `company_identity`, document `identity`) and managed only at
 * Organization Setup, Company setup. Every product and every document reads it through `getCompanyIdentity()` (see `index.ts`).
 * Pure and client-safe: the type, the field list, validation and the merge rule (tested without a database).
 */
export interface CompanyIdentity {
  legalName: string;
  brandName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  gstin: string;
  cin: string;
  pan: string;
  website: string;
  phone: string;
  email: string;
  /** The company logo (uploaded in Branding; one store, shown here so every product reads it from one place). */
  logoUrl: string;
  currency: string;
  timeZone: string;
  /** First month of the financial year, 1 to 12 (April = 4 in India). */
  fiscalYearStartMonth: number;
  /** Interface and document language, a short code such as `en`. */
  language: string;
}

export const IDENTITY_FIELDS = [
  "legalName", "brandName", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "gstin", "cin", "pan",
  "website", "phone", "email", "logoUrl", "currency", "timeZone", "fiscalYearStartMonth", "language",
] as const satisfies readonly (keyof CompanyIdentity)[];
export type IdentityField = (typeof IDENTITY_FIELDS)[number];

export const EMPTY_IDENTITY: CompanyIdentity = {
  legalName: "", brandName: "", addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "", gstin: "", cin: "", pan: "",
  website: "", phone: "", email: "", logoUrl: "", currency: "INR", timeZone: "Asia/Kolkata", fiscalYearStartMonth: 4, language: "en",
};

/** Where a value on the page comes from: the company document itself, or an older store kept as a fallback until the owner confirms. */
export type IdentitySource = "company" | "default" | (string & {});

export const LANGUAGES: { value: string; label: string }[] = [
  { value: "en", label: "English" }, { value: "hi", label: "Hindi" }, { value: "mr", label: "Marathi" }, { value: "gu", label: "Gujarati" },
  { value: "ta", label: "Tamil" }, { value: "te", label: "Telugu" }, { value: "bn", label: "Bengali" }, { value: "kn", label: "Kannada" },
];

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const CIN = /^[LU][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s]+\.[^\s]+$/i;
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "");

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type IdentityErrors = Partial<Record<IdentityField, string>>;

/**
 * Validates whatever fields are present (a form may save only a few). A blank optional field means "clear it". Never trusts the browser:
 * the server runs this again.
 */
export function validateIdentity(input: Partial<Record<IdentityField, unknown>>): { ok: true; value: Partial<CompanyIdentity> } | { ok: false; errors: IdentityErrors } {
  const errors: IdentityErrors = {};
  const out: Partial<CompanyIdentity> = {};
  const has = (k: IdentityField) => Object.prototype.hasOwnProperty.call(input, k);
  const put = (k: Exclude<IdentityField, "fiscalYearStartMonth">, max: number) => { if (has(k)) (out as Record<string, string>)[k] = text(input[k], max); };
  for (const k of ["legalName", "brandName"] as const) put(k, 160);
  for (const k of ["addressLine1", "addressLine2"] as const) put(k, 200);
  for (const k of ["city", "state", "country"] as const) put(k, 80);
  put("postalCode", 12); put("phone", 30); put("website", 200); put("email", 160); put("logoUrl", 300);
  if (has("gstin")) { out.gstin = text(input.gstin, 20).toUpperCase().replace(/\s+/g, ""); if (out.gstin && gstinError(out.gstin)) errors.gstin = gstinError(out.gstin)!; }
  if (has("pan")) { out.pan = text(input.pan, 10).toUpperCase(); if (out.pan && !PAN.test(out.pan)) errors.pan = "A PAN has 10 characters, like ABCDE1234F."; }
  if (has("cin")) { out.cin = text(input.cin, 21).toUpperCase(); if (out.cin && !CIN.test(out.cin)) errors.cin = "A CIN has 21 characters, like U12345MH2020PTC123456."; }
  if (out.email && !EMAIL.test(out.email)) errors.email = "Enter a valid email.";
  if (out.website && !URL_RE.test(out.website)) errors.website = "Enter a full URL, e.g. https://example.com";
  if (out.brandName !== undefined && out.brandName.length < 2) errors.brandName = "Enter your company name.";
  if (has("currency")) { out.currency = text(input.currency, 3).toUpperCase(); if (!(CURRENCIES as readonly string[]).includes(out.currency)) errors.currency = "Choose a currency."; }
  if (has("timeZone")) { out.timeZone = text(input.timeZone, 60); if (!validTimeZone(out.timeZone)) errors.timeZone = "Choose a time zone."; }
  if (has("fiscalYearStartMonth")) { const m = Number(input.fiscalYearStartMonth); if (Number.isInteger(m) && m >= 1 && m <= 12) out.fiscalYearStartMonth = m; else errors.fiscalYearStartMonth = "Choose the month your financial year starts."; }
  if (has("language")) { out.language = text(input.language, 8).toLowerCase(); if (!LANGUAGES.some((l) => l.value === out.language)) errors.language = "Choose a language."; }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value: out };
}

const blank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

/**
 * The effective identity: each field from the company document when it has a value, else from the first fallback source that has one
 * (the older stores, in the order given), else the default. Also says where each value came from.
 */
export function mergeIdentity(own: Partial<CompanyIdentity> | null, fallbacks: { source: string; values: Partial<CompanyIdentity> }[]): { identity: CompanyIdentity; sources: Record<IdentityField, IdentitySource> } {
  const identity = { ...EMPTY_IDENTITY } as CompanyIdentity;
  const sources = {} as Record<IdentityField, IdentitySource>;
  for (const k of IDENTITY_FIELDS) {
    const mine = own?.[k];
    if (!blank(mine)) { (identity as unknown as Record<string, unknown>)[k] = mine; sources[k] = "company"; continue; }
    const hit = fallbacks.find((f) => !blank(f.values[k]));
    if (hit) { (identity as unknown as Record<string, unknown>)[k] = hit.values[k]; sources[k] = hit.source; } else sources[k] = "default";
  }
  return { identity, sources };
}

/** One-line address, blank parts dropped. */
export function formatIdentityAddress(i: Pick<CompanyIdentity, "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country">): string {
  return [i.addressLine1, i.addressLine2, i.city, i.state, i.postalCode, i.country].map((s) => s.trim()).filter(Boolean).join(", ");
}

/** Labels for forms and read-only summaries. */
export const IDENTITY_LABELS: Record<IdentityField, string> = {
  legalName: "Legal name", brandName: "Brand name", addressLine1: "Address line 1", addressLine2: "Address line 2", city: "City", state: "State", postalCode: "PIN code",
  country: "Country", gstin: "GSTIN", cin: "CIN", pan: "PAN", website: "Website", phone: "Phone", email: "Email", logoUrl: "Logo", currency: "Currency",
  timeZone: "Time zone", fiscalYearStartMonth: "Financial year starts in", language: "Language",
};
