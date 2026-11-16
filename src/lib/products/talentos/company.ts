import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/talentos/db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";
import { getCompanyIdentity } from "@/lib/platform/company-identity";

/**
 * Company / employer identity for payslips and other official documents. Single
 * document (`hrms_company` / `_id: "org"`). Editable in Settings → Company
 * (super_admin only). Same shape/behaviour as `payroll-config.ts`.
 */

export const COMPANY_COLLECTION = "hrms_company";
const COMPANY_ID = "org";

export interface CompanyDetails {
  _id: string;
  name: string;
  legalName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  email: string;
  phone: string;
  website: string;
  /** Statutory registrations — all optional; blank fields are hidden on the payslip. */
  pan: string;
  gstin: string;
  cin: string;
  pfEstablishmentCode: string;
  esiEstablishmentCode: string;
  lin: string;
  /** Tax deduction account number (TAN): needed on Form 16 and the quarterly TDS returns. */
  tan: string;
  /** Professional tax registration (PTEC / PTRC) number. */
  ptRegistration: string;
  signatoryName: string;
  signatoryDesignation: string;
  payslipNote: string;
  updatedAt: Date;
  updatedBy: string | null;
}

/** Statutory / letter defaults every company starts with — the company's own name and details are filled in by it. */
const BASE_DEFAULTS: Omit<CompanyDetails, "_id" | "updatedAt" | "updatedBy"> = {
  name: "",
  legalName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  email: "",
  phone: "",
  website: "",
  pan: "",
  gstin: "",
  cin: "",
  pfEstablishmentCode: "",
  esiEstablishmentCode: "",
  lin: "",
  tan: "",
  ptRegistration: "",
  signatoryName: "",
  signatoryDesignation: "Authorised Signatory",
  payslipNote: "This payslip is confidential. Contact HR for any discrepancy within 30 days.",
};

/**
 * Starting values for a company that hasn't saved its details yet: its own
 * registered name with blank contact/statutory fields.
 */
async function defaultsForCurrentCompany(): Promise<Omit<CompanyDetails, "_id" | "updatedAt" | "updatedBy">> {
  const company = await getCompany(await currentCompanyId());
  const name = company?.name ?? "";
  return { ...BASE_DEFAULTS, name, legalName: name };
}

export async function getCompanyDetails(): Promise<CompanyDetails> {
  const db = await getDb();
  const collection = db.collection<CompanyDetails>(COMPANY_COLLECTION);
  const DEFAULTS = await defaultsForCurrentCompany();
  const existing = await collection.findOne({ _id: COMPANY_ID });
  let base: CompanyDetails;
  if (existing) base = { ...DEFAULTS, ...existing };
  else {
    base = { _id: COMPANY_ID, ...DEFAULTS, updatedAt: new Date(), updatedBy: null };
    await collection.updateOne({ _id: COMPANY_ID }, { $setOnInsert: base }, { upsert: true });
  }
  return withIdentity(base);
}

/**
 * Who the company is (name, address, registrations, contact) is read from the ONE company identity (Company setup); this record keeps only
 * what TalentOS adds for payslips and statutory returns (PF/ESI/TAN codes, signatory, payslip note). A value the identity does not have yet
 * falls back to what this record holds.
 */
async function withIdentity(c: CompanyDetails): Promise<CompanyDetails> {
  const i = await getCompanyIdentity();
  const or = (a: string, b: string) => a || b;
  return {
    ...c,
    name: or(i.brandName, c.name), legalName: or(i.legalName, c.legalName), addressLine1: or(i.addressLine1, c.addressLine1), addressLine2: or(i.addressLine2, c.addressLine2),
    city: or(i.city, c.city), state: or(i.state, c.state), postalCode: or(i.postalCode, c.postalCode), country: or(i.country, c.country),
    email: or(i.email, c.email), phone: or(i.phone, c.phone), website: or(i.website, c.website), pan: or(i.pan, c.pan), gstin: or(i.gstin, c.gstin), cin: or(i.cin, c.cin),
  };
}

export type CompanyDetailsInput = Omit<CompanyDetails, "_id" | "updatedAt" | "updatedBy">;

export async function updateCompanyDetails(data: CompanyDetailsInput, actorId: string): Promise<CompanyDetails> {
  const db = await getDb();
  const collection = db.collection<CompanyDetails>(COMPANY_COLLECTION);
  const result = await collection.findOneAndUpdate(
    { _id: COMPANY_ID },
    { $set: { ...data, ...updateStamp(actorId) } },
    { upsert: true, returnDocument: "after" }
  );
  return withIdentity({ ...(await defaultsForCurrentCompany()), ...(result as CompanyDetails) });
}

/** What TalentOS itself keeps (statutory codes, signatory, payslip note). The company's identity is never written here: it lives in the one company identity. */
export const STATUTORY_FIELDS = ["pfEstablishmentCode", "esiEstablishmentCode", "lin", "tan", "ptRegistration", "signatoryName", "signatoryDesignation", "payslipNote"] as const;

export async function updateStatutoryDetails(data: Pick<CompanyDetails, (typeof STATUTORY_FIELDS)[number]>, actorId: string): Promise<CompanyDetails> {
  const collection = (await getDb()).collection<CompanyDetails>(COMPANY_COLLECTION);
  const set = Object.fromEntries(STATUTORY_FIELDS.map((k) => [k, data[k]]));
  const result = await collection.findOneAndUpdate({ _id: COMPANY_ID }, { $set: { ...set, ...updateStamp(actorId) }, $setOnInsert: { ...(await defaultsForCurrentCompany()) } } as never, { upsert: true, returnDocument: "after" });
  return withIdentity({ ...(await defaultsForCurrentCompany()), ...(result as CompanyDetails) });
}

/** One-line address string, e.g. for the payslip header. Blank parts dropped. */
export function formatCompanyAddress(c: CompanyDetails): string {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}
