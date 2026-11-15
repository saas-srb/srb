import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import PmsSettingsForm from "@/components/products/sprintos/PmsSettingsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getPmsSettings } from "@/lib/products/sprintos/settings";

export default async function SprintosSettingsScreen() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.products"); // Director-only item: anyone else sees the locked page inside this shell

  const settings = await getPmsSettings();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "SprintOS" },
        ]}
        title={<>SprintOS Settings</>}
        description={<>Configure project categories, technology suggestions and defaults.</>}
      />
      <PmsSettingsForm
        categories={settings.categories}
        technologySuggestions={settings.technologySuggestions}
        defaultCurrency={settings.defaultCurrency}
      />
    </div>
  );
}
