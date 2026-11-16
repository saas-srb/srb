import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOnboarding } from "@/lib/platform/onboarding/state";
import { getCompanyIdentity } from "@/lib/platform/company-identity";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import ProfileSettings from "./ProfileSettings";

export const metadata: Metadata = { title: "Organization profile", robots: { index: false, follow: false } };

/**
 * The company's profile, editable after setup. Same data and save function as
 * step 1 of the setup wizard (`onboarding/state.ts` → `saveProfile`).
 */
export default async function OrganizationProfilePage() {
  await requireWorkspaceAccess("company.setup");
  const [{ company }, details] = await Promise.all([getOnboarding(), getCompanyIdentity()]);

  return (
    <div className="min-h-screen bg-muted/70 px-4 py-10 dark:bg-background">
      <div className="space-y-4">
<PanelPageHeader
          breadcrumbs={[{ label: "Company settings", href: "/commandos/settings" }, { label: "Organization profile" }]}
          title={<>Organization profile</>}
        />
<div className="space-y-4">
        <ProfileSettings
          initial={{
            name: details.brandName || company.name,
            legalName: details.legalName,
            industry: company.profile?.industry ?? "",
            size: company.profile?.size ?? "",
            country: details.country || company.profile?.country || "",
            currency: details.currency || company.profile?.currency || "INR",
            timezone: details.timeZone || company.profile?.timezone || company.timezone || "",
            website: details.website,
            email: details.email,
            phone: details.phone,
            addressLine1: details.addressLine1, addressLine2: details.addressLine2, city: details.city, state: details.state, postalCode: details.postalCode,
            gstin: details.gstin, pan: details.pan, cin: details.cin, fiscalYearStartMonth: details.fiscalYearStartMonth, language: details.language,
          }}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      </div>
</div>
    </div>
  );
}
