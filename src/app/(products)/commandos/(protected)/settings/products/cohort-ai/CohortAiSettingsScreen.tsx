import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import TmsSettingsForm from "@/components/products/cohort-ai/TmsSettingsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getTmsSettings } from "@/lib/products/cohort-ai/settings";

export default async function CohortAiSettingsScreen() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.products"); // Director-only item: anyone else sees the locked page inside this shell

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
