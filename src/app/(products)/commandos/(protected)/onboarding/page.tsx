import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getOnboarding } from "@/lib/platform/onboarding/state";
import { getCompanyDetails } from "@/lib/products/talentos/company";
import { listDepartments } from "@/lib/products/talentos/departments";
import { listPendingInvitations } from "@/lib/platform/invitations";
import OnboardingWizard from "./OnboardingWizard";
import { listPanelChoices } from "@/lib/platform/panels/choices";
import { getCompanyBrand, getStoredBranding } from "@/lib/platform/branding";
import { listThemeOptions } from "@/lib/platform/branding/theme-options";
import { listCustomRoles } from "@/lib/products/commandos/custom-roles";

export const metadata: Metadata = { title: "Set up your workspace", robots: { index: false, follow: false } };

export default async function OnboardingPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const [{ company, state }, details, departments, invitations, stored, brand] = await Promise.all([getOnboarding(), getCompanyDetails(), listDepartments(), listPendingInvitations(), getStoredBranding(), getCompanyBrand()]);
  const { options: themes, activeKey, appliedKey } = await listThemeOptions();
  const panelChoices = await listPanelChoices();
  const customRoles = await listCustomRoles();

  return (
    <OnboardingWizard
      companyName={company.name}
      completedSteps={state.completedSteps}
      profile={{
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
      existingDepartments={departments.map((d) => ({ id: d._id, name: d.name }))}
      customRoles={customRoles.map((r) => ({ id: r.id, name: r.name }))}
      invitations={invitations.map((i) => ({ id: i._id, email: i.email, name: i.name, preset: i.preset }))}
      enabledModules={company.enabledModules ?? null}
      panelChoices={panelChoices}
      themes={themes}
      activeThemeKey={activeKey}
      appliedThemeKey={appliedKey}
      timezones={Intl.supportedValuesOf("timeZone")}
      branding={{ ...stored, namePrimary: stored.namePrimary ?? brand.namePrimary, nameAccent: stored.nameAccent ?? brand.nameAccent }}
    />
  );
}
