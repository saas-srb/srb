import { requireWorkspaceAccess } from "@/lib/products/commandos/access";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { redirect } from "next/navigation";
import PrmsSettingsForm from "@/components/products/spendiq/PrmsSettingsForm";
import { getCurrentHubUser } from "@/lib/hub-auth";
import { getPrmsSettings } from "@/lib/products/spendiq/settings";

export default async function SpendiqSettingsScreen() {
  const user = await getCurrentHubUser();
  if (!user) redirect("/commandos/login");
  await requireWorkspaceAccess("company.products"); // Director-only item: anyone else sees the locked page inside this shell

  const settings = await getPrmsSettings();

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Settings", href: "/commandos/settings" },
          { label: "Product settings", href: "/commandos/settings/products" },
          { label: "SpendIQ" },
        ]}
        title={<>SpendIQ Settings</>}
        description={<>Company identity for purchase orders and invoices, requisition approval thresholds and default currency.</>}
      />
      <PrmsSettingsForm settings={JSON.parse(JSON.stringify(settings))} />
    </div>
  );
}
