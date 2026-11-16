import { formatIdentityAddress, type CompanyIdentity } from "@/lib/platform/company-identity/shared";
import type { BillingDetails } from "@/lib/platform/billing/billing-details";

/**
 * The GST invoice-to details (legal name, GSTIN, address, state, email) offered from the ONE company identity, so a company does not type them twice.
 * Pure. It is only an offer: the billing record keeps its own values once saved (an explicit override), and nothing is written until the person saves.
 */
export function billingDetailsFromIdentity(i: Pick<CompanyIdentity, "legalName" | "brandName" | "gstin" | "addressLine1" | "addressLine2" | "city" | "state" | "postalCode" | "country" | "email">): BillingDetails {
  return {
    legalName: i.legalName || i.brandName || "",
    gstin: i.gstin ? i.gstin : null,
    address: formatIdentityAddress({ addressLine1: i.addressLine1, addressLine2: i.addressLine2, city: i.city, state: "", postalCode: i.postalCode, country: i.country }),
    state: i.state || "",
    email: i.email || "",
  };
}

/** Which fields of the saved billing record differ from the company identity (shown as "different from your company details"). */
export function billingDiffersFromIdentity(saved: BillingDetails | null, offer: BillingDetails): (keyof BillingDetails)[] {
  if (!saved) return [];
  return (Object.keys(offer) as (keyof BillingDetails)[]).filter((k) => String(saved[k] ?? "").trim().toLowerCase() !== String(offer[k] ?? "").trim().toLowerCase() && String(offer[k] ?? "").trim() !== "");
}
