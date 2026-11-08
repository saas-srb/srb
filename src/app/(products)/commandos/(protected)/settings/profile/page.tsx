import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getOnboarding } from "@/lib/platform/onboarding/state";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import ProfileSettings from "./ProfileSettings";

export const metadata: Metadata = { title: "Organization profile", robots: { index: false, follow: false } };

/**
 * The company's profile, editable after setup. Same data and save function as
 * step 1 of the setup wizard (`onboarding/state.ts` → `saveProfile`).
 */
export default async function OrganizationProfilePage() {
  await requireWorkspaceAccess("company.profile");
  const [{ company }, details] = await Promise.all([getOnboarding(), getCompanyDetails()]);

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
            name: details.name || company.name,
            legalName: details.legalName,
            industry: company.profile?.industry ?? "",
            size: company.profile?.size ?? "",
            country: company.profile?.country ?? details.country ?? "",
            currency: company.profile?.currency ?? "INR",
            timezone: company.profile?.timezone ?? company.timezone ?? "",
            website: details.website,
            email: details.email,
            phone: details.phone,
          }}
          timezones={Intl.supportedValuesOf("timeZone")}
        />
      </div>
</div>
    </div>
  );
}
