import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { getPlatformOwnerCompanyId } from "@/lib/platform/tenancy/companies";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { DEFAULT_TRIAL_DAYS, GRACE_DAYS, GST_RATE } from "@/lib/platform/billing/types";
import { GST_STATE_CODES, SELECTABLE_GST_STATES, gstStateCode, gstinError, normalizeGstin, stateCodeFromGstin } from "@/lib/platform/billing/gst";

/**
 * Platform-wide billing configuration — the seller identity on SaaS invoices,
 * tax, invoice numbering/text and billing defaults. Stored in
 * `platform_settings` (`_id: "billing"`), edited only in the Platform Console.
 * Nothing here is hard-coded: the constants in `types.ts` are first-run
 * fallbacks, and the seller identity is prefilled from the platform owner's
 * HRMS company details until someone saves it here.
 */

const DOC_ID = "billing";

/** GST state codes → state name, for choosing the seller's registered state. */
export const GST_STATES: Record<string, string> = SELECTABLE_GST_STATES;

export interface PlatformBillingSettings {
  seller: {
    legalName: string;
    tradeName: string;
    gstin: string;
    /** GST state code, e.g. "33". */
    stateCode: string;
    address: string;
    email: string;
    phone: string;
    pan: string;
  };
  tax: {
    /** Percent, e.g. 18. */
    gstRatePercent: number;
    /** SAC for SaaS / IT services. */
    sacCode: string;
    /** Whether catalogue prices already include GST. */
    pricesIncludeTax: boolean;
  };
  invoice: {
    /** Invoice number prefix, e.g. "SAAS" → SAAS/26-27/00001. */
    prefix: string;
    footerNote: string;
    terms: string;
  };
  billing: {
    currency: string;
    defaultTrialDays: number;
    graceDays: number;
    /** Days before trial end when reminder emails go out. */
    trialReminderDays: number[];
  };
  updatedAt: Date | null;
  updatedBy: string | null;
}

const DEFAULTS: Omit<PlatformBillingSettings, "seller" | "updatedAt" | "updatedBy"> = {
  tax: { gstRatePercent: Math.round(GST_RATE * 100), sacCode: "998314", pricesIncludeTax: false },
  invoice: { prefix: "SAAS", footerNote: "This is a computer-generated tax invoice.", terms: "" },
  billing: { currency: "INR", defaultTrialDays: DEFAULT_TRIAL_DAYS, graceDays: GRACE_DAYS, trialReminderDays: [7, 3, 1] },
};

async function col() {
  return (await getPlatformDb()).collection<Partial<PlatformBillingSettings> & { _id: string }>("platform_settings");
}

/** Seller defaults from the platform owner's HRMS company details (until saved here). */
async function sellerFromOwner(): Promise<PlatformBillingSettings["seller"]> {
  const ownerId = await getPlatformOwnerCompanyId();
  const empty = { legalName: "", tradeName: "", gstin: "", stateCode: "", address: "", email: "", phone: "", pan: "" };
  if (!ownerId) return empty;
  const c = await runAsCompany(ownerId, () => getCompanyDetails()).catch(() => null);
  if (!c) return empty;
  const gstin = normalizeGstin(c.gstin);
  return {
    legalName: c.legalName || c.name,
    tradeName: c.name,
    gstin,
    stateCode: stateCodeFromGstin(gstin) ?? gstStateCode(c.state) ?? "",
    address: [c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country].filter((s) => s?.trim()).join(", "),
    email: c.email,
    phone: c.phone,
    pan: (c.pan ?? "").toUpperCase(),
  };
}

export async function getBillingSettings(): Promise<PlatformBillingSettings> {
  const doc = await (await col()).findOne({ _id: DOC_ID });
  return {
    seller: doc?.seller ?? (await sellerFromOwner()),
    tax: { ...DEFAULTS.tax, ...doc?.tax },
    invoice: { ...DEFAULTS.invoice, ...doc?.invoice },
    billing: { ...DEFAULTS.billing, ...doc?.billing },
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ?? null,
  };
}

export type SettingsResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function saveBillingSettings(input: Omit<PlatformBillingSettings, "updatedAt" | "updatedBy">, actorId: string): Promise<SettingsResult> {
  const errors: Record<string, string> = {};
  const s = input.seller;
  const gstin = normalizeGstin(s.gstin);
  if (!s.legalName.trim()) errors["seller.legalName"] = "Enter the legal name printed on invoices.";
  const gstinProblem = gstin ? gstinError(gstin) : null;
  if (gstinProblem) errors["seller.gstin"] = `That isn't a valid GSTIN. ${gstinProblem}`;
  const stateCode = (gstinProblem ? null : stateCodeFromGstin(gstin)) ?? s.stateCode;
  if (!GST_STATE_CODES[stateCode]) errors["seller.stateCode"] = "Choose the registered state.";
  if (s.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim())) errors["seller.email"] = "Enter a valid email.";
  const rate = Number(input.tax.gstRatePercent);
  if (!Number.isFinite(rate) || rate < 0 || rate > 40) errors["tax.gstRatePercent"] = "Enter a GST rate between 0 and 40%.";
  if (!/^\d{4,8}$/.test(input.tax.sacCode.trim())) errors["tax.sacCode"] = "Enter a numeric SAC code.";
  if (!/^[A-Z0-9-]{1,4}$/.test(input.invoice.prefix.trim().toUpperCase())) errors["invoice.prefix"] = "Use up to 4 letters, digits or hyphens — GST limits an invoice number to 16 characters.";
  const trial = Number(input.billing.defaultTrialDays);
  if (!Number.isInteger(trial) || trial < 0 || trial > 365) errors["billing.defaultTrialDays"] = "Enter 0–365 days.";
  const grace = Number(input.billing.graceDays);
  if (!Number.isInteger(grace) || grace < 0 || grace > 60) errors["billing.graceDays"] = "Enter 0–60 days.";
  const reminders = [...new Set(input.billing.trialReminderDays.map(Number).filter((d) => Number.isInteger(d) && d > 0 && d <= 60))].sort((a, b) => b - a);
  if (!/^[A-Z]{3}$/.test(input.billing.currency.trim().toUpperCase())) errors["billing.currency"] = "Use a 3-letter currency code.";
  if (Object.keys(errors).length) return { ok: false, errors };

  const doc: Omit<PlatformBillingSettings, never> = {
    seller: {
      legalName: s.legalName.trim(),
      tradeName: s.tradeName.trim(),
      gstin,
      stateCode,
      address: s.address.trim(),
      email: s.email.trim(),
      phone: s.phone.trim(),
      pan: s.pan.trim().toUpperCase(),
    },
    tax: { gstRatePercent: rate, sacCode: input.tax.sacCode.trim(), pricesIncludeTax: Boolean(input.tax.pricesIncludeTax) },
    invoice: { prefix: input.invoice.prefix.trim().toUpperCase(), footerNote: input.invoice.footerNote.trim(), terms: input.invoice.terms.trim() },
    billing: { currency: input.billing.currency.trim().toUpperCase(), defaultTrialDays: trial, graceDays: grace, trialReminderDays: reminders },
    updatedAt: new Date(),
    updatedBy: actorId,
  };
  await (await col()).updateOne({ _id: DOC_ID }, { $set: doc }, { upsert: true });
  return { ok: true };
}
