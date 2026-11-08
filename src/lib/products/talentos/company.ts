import "server-only";
import { getDb } from "@/lib/mongodb";
import { updateStamp } from "@/lib/products/talentos/db";
import { currentCompanyId } from "@/lib/platform/tenancy/context";
import { getCompany } from "@/lib/platform/tenancy/companies";

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
  if (existing) return { ...DEFAULTS, ...existing };
  const doc: CompanyDetails = { _id: COMPANY_ID, ...DEFAULTS, updatedAt: new Date(), updatedBy: null };
  await collection.updateOne({ _id: COMPANY_ID }, { $setOnInsert: doc }, { upsert: true });
  return doc;
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
  return { ...(await defaultsForCurrentCompany()), ...(result as CompanyDetails) };
}

/** One-line address string, e.g. for the payslip header. Blank parts dropped. */
export function formatCompanyAddress(c: CompanyDetails): string {
  return [c.addressLine1, c.addressLine2, c.city, c.state, c.postalCode, c.country]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
}
