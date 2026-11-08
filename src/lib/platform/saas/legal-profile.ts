import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { SAAS_BRAND } from "@/lib/platform/saas/brand";

/**
 * Who the operator of the product is, as the public legal pages state it (Terms, Privacy, Grievance Redressal …): legal entity, registered
 * office, registration number, the Grievance Officer and the courts that have jurisdiction. Set in Platform Console → Legal & compliance and
 * stored in `platform_settings` (`_id: "legal_profile"`). Nothing is invented: a field that is empty is left out of the pages, and the
 * Console lists what is still missing. The seller's legal name, address and GSTIN are the ones on SaaS invoices (Console → Tax & invoicing),
 * so the two never disagree.
 */

import { CONSTITUTIONS_LIST as CONSTITUTIONS, REGISTRATION_TYPES_LIST as REGISTRATION_TYPES } from "@/app/(platform)/console/legal/options";

export interface LegalProfile {
  /** From Console → Tax & invoicing (or the deployment's operator name until that is filled). */
  legalName: string;
  tradeName: string;
  gstin: string;
  constitution: string;
  registrationType: string;
  registrationNo: string;
  registeredOffice: string;
  grievanceName: string;
  grievanceDesignation: string;
  grievanceEmail: string;
  grievancePhone: string;
  jurisdictionCity: string;
  jurisdictionState: string;
  /** ISO date (YYYY-MM-DD) the published policies took effect. */
  effectiveDate: string;
  updatedAt: string | null;
  updatedBy: string | null;
}

type Stored = Partial<Omit<LegalProfile, "legalName" | "tradeName" | "gstin" | "updatedAt" | "updatedBy">> & { _id: string; updatedAt?: Date; updatedBy?: string | null };
export type LegalInput = Pick<LegalProfile, "constitution" | "registrationType" | "registrationNo" | "registeredOffice" | "grievanceName" | "grievanceDesignation" | "grievanceEmail" | "grievancePhone" | "jurisdictionCity" | "jurisdictionState" | "effectiveDate">;

const DOC_ID = "legal_profile";
const col = async () => (await getPlatformDb()).collection<Stored>("platform_settings");
const g = globalThis as unknown as { __legalProfile?: { at: number; value: LegalProfile } };
const forget = () => {
  g.__legalProfile = undefined;
};
const clean = (v: unknown, max = 300) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function getLegalProfile(): Promise<LegalProfile> {
  if (g.__legalProfile && Date.now() - g.__legalProfile.at < 30_000) return g.__legalProfile.value;
  const [doc, billing] = await Promise.all([
    (async () => {
      try {
        return await (await col()).findOne({ _id: DOC_ID });
      } catch {
        return null;
      }
    })(),
    getBillingSettings().catch(() => null),
  ]);
  const seller = billing?.seller;
  const value: LegalProfile = {
    legalName: clean(seller?.legalName) || SAAS_BRAND.operator,
    tradeName: clean(seller?.tradeName),
    gstin: clean(seller?.gstin, 20),
    constitution: doc?.constitution ?? "",
    registrationType: doc?.registrationType ?? "",
    registrationNo: doc?.registrationNo ?? "",
    registeredOffice: doc?.registeredOffice || clean(seller?.address, 600),
    grievanceName: doc?.grievanceName ?? "",
    grievanceDesignation: doc?.grievanceDesignation ?? "",
    grievanceEmail: doc?.grievanceEmail ?? "",
    grievancePhone: doc?.grievancePhone ?? "",
    jurisdictionCity: doc?.jurisdictionCity ?? "",
    jurisdictionState: doc?.jurisdictionState ?? "",
    effectiveDate: doc?.effectiveDate ?? (doc?.updatedAt ? doc.updatedAt.toISOString().slice(0, 10) : ""),
    updatedAt: doc?.updatedAt?.toISOString() ?? null,
    updatedBy: doc?.updatedBy ?? null,
  };
  g.__legalProfile = { at: Date.now(), value };
  return value;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+0-9][0-9 ()-]{6,18}$/;

export function validateLegalInput(input: LegalInput): Record<string, string> {
  const e: Record<string, string> = {};
  if (input.constitution && !(CONSTITUTIONS as readonly string[]).includes(input.constitution)) e.constitution = "Choose one of the listed types.";
  if (input.registrationType && !(REGISTRATION_TYPES as readonly string[]).includes(input.registrationType)) e.registrationType = "Choose one of the listed types.";
  if (input.registrationNo && !input.registrationType) e.registrationType = "Choose what kind of registration number this is.";
  if (input.registrationType === "CIN" && input.registrationNo && !/^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/i.test(input.registrationNo.replace(/\s/g, ""))) e.registrationNo = "A CIN has 21 characters, like U12345MH2020PTC123456.";
  if (input.registrationType === "LLPIN" && input.registrationNo && !/^[A-Z]{3}-\d{4}$/i.test(input.registrationNo.replace(/\s/g, ""))) e.registrationNo = "An LLPIN looks like AAB-1234.";
  if (input.grievanceEmail && !EMAIL.test(input.grievanceEmail)) e.grievanceEmail = "Enter a valid email address.";
  if (input.grievancePhone && !PHONE.test(input.grievancePhone)) e.grievancePhone = "Enter a valid phone number.";
  if (input.effectiveDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveDate) || Number.isNaN(Date.parse(input.effectiveDate)))) e.effectiveDate = "Use a date.";
  return e;
}

export type LegalSaveResult = { ok: true } | { ok: false; errors: Record<string, string> };

export async function saveLegalProfile(input: LegalInput, actor: { id: string; email: string }): Promise<LegalSaveResult> {
  const v: LegalInput = {
    constitution: clean(input?.constitution),
    registrationType: clean(input?.registrationType),
    registrationNo: clean(input?.registrationNo, 40).toUpperCase(),
    registeredOffice: clean(input?.registeredOffice, 600),
    grievanceName: clean(input?.grievanceName, 120),
    grievanceDesignation: clean(input?.grievanceDesignation, 120),
    grievanceEmail: clean(input?.grievanceEmail, 200).toLowerCase(),
    grievancePhone: clean(input?.grievancePhone, 30),
    jurisdictionCity: clean(input?.jurisdictionCity, 80),
    jurisdictionState: clean(input?.jurisdictionState, 80),
    effectiveDate: clean(input?.effectiveDate, 10),
  };
  const errors = validateLegalInput(v);
  if (Object.keys(errors).length) return { ok: false, errors };
  await (await col()).updateOne({ _id: DOC_ID }, { $set: { ...v, updatedAt: new Date(), updatedBy: actor.email } }, { upsert: true });
  forget();
  await recordPlatformAudit({ actorId: actor.id, action: "settings.legal.update", target: { type: "settings", id: DOC_ID }, details: { effectiveDate: v.effectiveDate } });
  return { ok: true };
}

/** What a published policy still lacks, for the Console checklist. `required` ones are named by law (Grievance Officer, registered office). */
export function legalGaps(p: LegalProfile): { field: string; label: string; required: boolean; why: string }[] {
  const gaps: { field: string; label: string; required: boolean; why: string }[] = [];
  const need = (ok: boolean, field: string, label: string, required: boolean, why: string) => {
    if (!ok) gaps.push({ field, label, required, why });
  };
  need(!!p.legalName, "legalName", "Legal name of the operator", true, "Names the contracting party in the Terms and the data fiduciary in the Privacy Policy. Set it in Console → Tax & invoicing.");
  need(!!p.registeredOffice, "registeredOffice", "Registered office address", true, "Required to identify the seller and the data fiduciary.");
  need(!!p.grievanceName && !!p.grievanceEmail, "grievanceName", "Grievance Officer (name and email)", true, "The IT (Intermediary Guidelines) Rules 2021 and the Consumer Protection (E-Commerce) Rules 2020 require the officer's name and contact to be published.");
  need(!!p.effectiveDate, "effectiveDate", "Date the policies took effect", true, "Every policy shows when it took effect.");
  need(!!p.gstin, "gstin", "GSTIN", false, "Shown on the Terms and in tax invoices. Set it in Console → Tax & invoicing.");
  need(!!p.constitution && !!p.registrationNo, "registrationNo", "Constitution and registration number (CIN, LLPIN …)", false, "Lets customers and regulators identify the entity.");
  need(!!p.jurisdictionCity, "jurisdictionCity", "City whose courts have jurisdiction", false, "Without it the Terms say the courts at the registered office have jurisdiction.");
  need(!!p.grievancePhone, "grievancePhone", "Grievance Officer phone", false, "A second way to reach the officer.");
  return gaps;
}
