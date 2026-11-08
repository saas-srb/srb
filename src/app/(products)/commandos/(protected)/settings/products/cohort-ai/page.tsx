import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import TmsSettingsForm from "@/components/products/cohort-ai/TmsSettingsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";

export default async function CohortAiSettingsPage() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  if (!user.roles.includes("super_admin")) redirect("/commandos");

  const settings = await getTmsSettings();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "Cohort AI" },
        ]}
        title={<>Cohort AI Settings</>}
        description={<>Track suggestions, currency, certificate numbering and institute identity.</>}
      />
      <TmsSettingsForm settings={settings} />
    </div>
  );
}
