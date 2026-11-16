import "server-only";
import { cache } from "react";
import { getDb } from "@/lib/mongodb";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { publishConfigChange } from "@/lib/platform/config-events";
import { mergeIdentity, validateIdentity, type CompanyIdentity, type IdentityErrors, type IdentityField, type IdentitySource } from "@/lib/platform/company-identity/shared";

export * from "@/lib/platform/company-identity/shared";

/**
 * THE accessor for the company's identity. Products, PDFs, payslips, the website and emails all call `getCompanyIdentity()`; nothing else
 * reads a company's name, address or registrations. The document is `company_identity` / `identity` in the company's own database.
 *
 * Until the owner confirms the older stores can go, a field the company document does not have yet falls back to them, in this order:
 * the company registry (name, country, currency, time zone, logo), TalentOS "Company" (`hrms_company`), SpendIQ and Cohort AI identity blocks,
 * SiteCraft's legal name. `migrate-company-identity` copies those values into the document once (additively, reversibly).
 */
export const IDENTITY_COLLECTION = "company_identity";
export const IDENTITY_ID = "identity";
export const IDENTITY_SCOPE = "company-identity";

export interface StoredIdentity {
  _id: string;
  values: Partial<CompanyIdentity>;
  updatedAt: Date;
  updatedBy: string | null;
  /** Set by the migration that created or filled this document (see `migrate-company-identity`). */
  _identityMigration?: { id: string; at: Date; filled: IdentityField[]; filledValues?: Partial<Record<IdentityField, string | number>>; created: boolean };
}

async function col() {
  return (await getDb()).collection<StoredIdentity>(IDENTITY_COLLECTION);
}

export async function getStoredIdentity(): Promise<StoredIdentity | null> {
  return (await col()).findOne({ _id: IDENTITY_ID });
}

export interface LegacyIdentitySource { source: string; values: Partial<CompanyIdentity> }

const s = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const pick = (o: Partial<Record<IdentityField, string>>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v)) as Partial<CompanyIdentity>;

/** The older stores, as identity values, in the order they are trusted. Read-only. */
export async function readLegacyIdentity(): Promise<LegacyIdentitySource[]> {
  const db = await getDb();
  const companyId = await currentCompanyId();
  const out: LegacyIdentitySource[] = [];
  const registry = await (await getPlatformDb()).collection<{ _id: string; name?: string; timezone?: string; branding?: { logoUrl?: string | null }; profile?: { currency?: string; country?: string }; subscription?: { billingDetails?: { legalName?: string; gstin?: string | null; address?: string; state?: string; email?: string } | null } }>(COMPANIES_COLLECTION).findOne({ _id: companyId });
  const one = async (collection: string, id: string) => (await db.collection<Record<string, unknown>>(collection).findOne({ _id: id as never })) as Record<string, unknown> | null;

  const hr = await one("hrms_company", "org");
  if (hr) out.push({ source: "TalentOS company details", values: pick({ brandName: s(hr.name), legalName: s(hr.legalName), addressLine1: s(hr.addressLine1), addressLine2: s(hr.addressLine2), city: s(hr.city), state: s(hr.state), postalCode: s(hr.postalCode), country: s(hr.country), email: s(hr.email), phone: s(hr.phone), website: s(hr.website), pan: s(hr.pan), gstin: s(hr.gstin), cin: s(hr.cin) }) });
  if (registry) out.push({ source: "company registry", values: pick({ brandName: s(registry.name), country: s(registry.profile?.country), currency: s(registry.profile?.currency), timeZone: s(registry.timezone), logoUrl: s(registry.branding?.logoUrl) }) });
  const sp = (await one("prms_settings", "config"))?.company as Record<string, unknown> | undefined;
  if (sp) out.push({ source: "SpendIQ company block", values: pick({ brandName: s(sp.name), addressLine1: s(sp.addressLine), city: s(sp.city), gstin: s(sp.gstin), pan: s(sp.pan), email: s(sp.email), phone: s(sp.phone), website: s(sp.website) }) });
  const co = (await one("training_settings", "config"))?.institute as Record<string, unknown> | undefined;
  if (co) out.push({ source: "Cohort AI institute block", values: pick({ brandName: s(co.name), addressLine1: s(co.addressLine), city: s(co.city), email: s(co.email), phone: s(co.phone), website: s(co.website) }) });
  const sc = await one("cms_settings", "default");
  if (sc?.companyLegalName) out.push({ source: "SiteCraft legal name", values: pick({ legalName: s(sc.companyLegalName) }) });
  const bd = registry?.subscription?.billingDetails;
  if (bd) out.push({ source: "billing details", values: pick({ legalName: s(bd.legalName), gstin: s(bd.gstin), addressLine1: s(bd.address), state: s(bd.state), email: s(bd.email) }) });
  return out;
}

export interface IdentityView { identity: CompanyIdentity; sources: Record<IdentityField, IdentitySource>; updatedAt: Date | null; saved: boolean }

/** The identity with where each value comes from (for the Company setup page and the read-only summaries). One read per request. */
export const getCompanyIdentityView = cache(async (): Promise<IdentityView> => {
  const [own, legacy] = await Promise.all([getStoredIdentity(), readLegacyIdentity()]);
  const { identity, sources } = mergeIdentity(own?.values ?? null, legacy);
  return { identity, sources, updatedAt: own?.updatedAt ?? null, saved: Boolean(own) };
});

/** The company's identity. The only way a product reads it. */
export async function getCompanyIdentity(): Promise<CompanyIdentity> {
  return (await getCompanyIdentityView()).identity;
}

export type SaveIdentityResult = { ok: true } | { ok: false; errors: IdentityErrors };

/** Saves (part of) the identity: validated, stamped, and announced so every product refreshes. The older stores are not written. */
export async function saveCompanyIdentity(input: Partial<Record<IdentityField, unknown>>, actorId: string | null): Promise<SaveIdentityResult> {
  const checked = validateIdentity(input);
  if (!checked.ok) return checked;
  const set = Object.fromEntries(Object.entries(checked.value).map(([k, v]) => [`values.${k}`, v]));
  await (await col()).updateOne({ _id: IDENTITY_ID }, { $set: { ...set, updatedAt: new Date(), updatedBy: actorId } } as never, { upsert: true });
  await publishConfigChange(IDENTITY_SCOPE);
  return { ok: true };
}
