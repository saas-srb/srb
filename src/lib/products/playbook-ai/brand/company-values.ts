import "server-only";
import { getCompanyDetails, formatCompanyAddress } from "@/lib/products/talentos/company";
import type { VarValues } from "@/lib/products/playbook-ai/doc/variables";

/**
 * The `company.*` values the letterhead lines read, taken live from the company profile (Settings > Company in TalentOS). The same keys and
 * meanings as the document variables (`variables-registry.ts`), so a header line and a document variable always show the same value.
 */
export async function loadCompanyValues(): Promise<VarValues> {
  const c = await getCompanyDetails();
  const v: VarValues = {};
  const put = (k: string, x: string | null | undefined) => { if (x && x.trim()) v[`company.${k}`] = x.trim(); };
  put("name", c.name);
  put("legal_name", c.legalName || c.name);
  put("address", formatCompanyAddress(c));
  put("address_line1", c.addressLine1);
  put("address_line2", c.addressLine2);
  put("city", c.city);
  put("state", c.state);
  put("postal_code", c.postalCode);
  put("country", c.country);
  put("email", c.email);
  put("phone", c.phone);
  put("website", c.website);
  put("pan", c.pan);
  put("gstin", c.gstin);
  put("cin", c.cin);
  put("tan", c.tan);
  return v;
}
