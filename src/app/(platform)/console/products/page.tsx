import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { can, requirePlatformPermission } from "@/lib/platform/console/access";
import { getPlatformDb } from "@/lib/platform/tenancy/platform-db";
import { COMPANIES_COLLECTION } from "@/lib/platform/tenancy/companies";
import { listPanels } from "@/lib/platform/panels/store";
import PanelsManager from "./PanelsManager";

export const metadata: Metadata = { title: "Products" };
export const dynamic = "force-dynamic";

export default async function PlatformPanelsPage() {
  const user = await requirePlatformPermission("panels.read");
  const [panels, perCompany] = await Promise.all([
    listPanels(),
    (await getPlatformDb())
      .collection<{ disabledPanels?: string[] }>(COMPANIES_COLLECTION)
      .aggregate<{ _id: string; n: number }>([{ $unwind: "$disabledPanels" }, { $group: { _id: "$disabledPanels", n: { $sum: 1 } } }])
      .toArray(),
  ]);
  const disabledFor = Object.fromEntries(perCompany.map((r) => [r._id, r.n]));
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Products"
        description="The Product Registry: one name, description and on/off switch for every product, used by the Workspace, onboarding, plans, product headers and search. Deactivating a product hides it and blocks access."
        crumbs={[{ label: "Tenants" }]}
      />
      <PanelListFilters>
<PanelsManager panels={panels} disabledFor={disabledFor} canManage={can(user, "panels.manage")} />
</PanelListFilters>
    </div>
  );
}
