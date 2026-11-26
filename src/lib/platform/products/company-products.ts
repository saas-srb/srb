import "server-only";
import { runAsCompany } from "@/lib/platform/tenancy/context";
import { recordPlatformAudit } from "@/lib/platform/audit";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { attachAtProvider, companyAppSubdomain } from "@/lib/platform/tenancy/provisioning";
import { forgetCompanySiteUrls } from "@/lib/platform/tenancy/site-url";
import { COMPANIES_COLLECTION, forgetCompanyRouting, getCompany, type Company } from "@/lib/platform/tenancy/companies";
import { ALL_PRODUCTS_VALUE, hasSeparateAppHost, ownedModules, parseSelection, resolveWebsite, sitesEnabled, type CompanyWebsite } from "@/lib/platform/products/selection";
import { forgetCompanyAvailability } from "@/lib/platform/products/availability";

export type SetProductsResult = { ok: true } | { ok: false; error: string };

const URL_RE = /^https?:\/\/[^\s/]+\.[^\s]+$/i;

/**
 * The one way a company's products and website choice are written. Only access changes: no product data is ever
 * deleted, so a product bought again comes back as it was left.
 */
export async function setCompanyProducts(
  companyId: string,
  input: { products: string | readonly string[]; website?: CompanyWebsite | null },
  actor: { id: string; reason?: string },
): Promise<SetProductsResult> {
  const selection = parseSelection(input.products);
  if (!selection) return { ok: false, error: "Choose a product, or All products." };
  const externalUrl = input.website?.externalUrl?.trim();
  if (externalUrl && !URL_RE.test(externalUrl)) return { ok: false, error: "Enter the full website address, e.g. https://example.com" };

  const company = await getCompany(companyId);
  if (!company) return { ok: false, error: "Company not found." };
  if (company.isPlatformOwner) return { ok: false, error: "The platform's own company always has every product." };

  const wanted = input.website === undefined ? company.website : input.website;
  const website = resolveWebsite(selection, wanted?.mode === "external" ? { mode: "external", ...(wanted.externalUrl ? { externalUrl: wanted.externalUrl.trim() } : {}) } : wanted);
  const db = await getPlatformDb();
  await db.collection<Company>(COMPANIES_COLLECTION).updateOne({ _id: companyId }, { $set: { products: selection, website, updatedAt: new Date() } });
  forgetCompanyAvailability(companyId);
  // The website choice decides the company's addresses (one, or website + app): routing and links follow at once.
  forgetCompanyRouting();
  forgetCompanySiteUrls();
  if (!hasSeparateAppHost(company) && hasSeparateAppHost({ products: selection, website })) {
    await attachAtProvider(companyAppSubdomain(company.slug)).catch((err) => console.error("[products] attaching the app address failed", err));
  }
  // A website switched on gets the starter pages it is missing (existing pages are never touched).
  const had = sitesEnabled(company.products, company.website, ownedModules(company.products));
  if (!had && sitesEnabled(selection, website, ownedModules(selection))) {
    await runAsCompany(companyId, async () => (await import("@/lib/platform/website/starter")).publishStarterWebsite()).catch((err) => console.error("[products] starter website failed", err));
  }
  await recordPlatformAudit({
    actorId: actor.id,
    action: "company.products.set",
    target: { type: "company", id: companyId },
    companyId,
    details: {
      products: selection.mode === "all" ? ALL_PRODUCTS_VALUE : selection.keys,
      website: website.mode,
      before: company.products ? (company.products.mode === "all" ? ALL_PRODUCTS_VALUE : company.products.keys) : ALL_PRODUCTS_VALUE,
      ...(actor.reason ? { reason: actor.reason } : {}),
    },
  });
  return { ok: true };
}
