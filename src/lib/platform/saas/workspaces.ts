import "server-only";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION, COMPANY_DOMAINS_COLLECTION, type Company, type CompanyDomain } from "@/lib/platform/tenancy/companies";
import { appUrlForCompany } from "@/lib/platform/tenancy/site-url";

/**
 * The origin of the products (app host) of the workspace a visitor means by `input` — a company slug (`acme`), its automatic subdomain or its own
 * verified domain — or null when no active company matches. Nothing about the company is revealed beyond that it exists.
 */
export async function findLoginOrigin(input: string, hostHint: string | null): Promise<string | null> {
  const db = await getPlatformDb();
  const companies = db.collection<Company>(COMPANIES_COLLECTION);
  let companyId: string | null = null;

  if (input.includes(".")) {
    const bare = input.startsWith("www.") ? input.slice(4) : input;
    const domain = await db.collection<CompanyDomain>(COMPANY_DOMAINS_COLLECTION).findOne({ _id: { $in: [input, bare] }, status: "verified" }, { projection: { companyId: 1 } });
    if (domain) companyId = domain.companyId;
    // `acme.<root>`: the first label is the slug.
    if (!companyId) {
      const slug = input.split(".")[0];
      const c = await companies.findOne({ slug, status: "active" }, { projection: { _id: 1 } });
      companyId = c?._id ?? null;
    }
  } else {
    const c = await companies.findOne({ slug: input, status: "active" }, { projection: { _id: 1 } });
    companyId = c?._id ?? null;
  }
  if (!companyId) return null;
  const active = await companies.findOne({ _id: companyId, status: "active" }, { projection: { _id: 1 } });
  return active ? appUrlForCompany(companyId, hostHint) : null;
}
