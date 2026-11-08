import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { buttonVariants } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { countAddonHolders, listAddons } from "@/lib/platform/billing/addons";
import { listPlans } from "@/lib/platform/billing/plans";
import AddonsGrid, { type AddonRow } from "./AddonsGrid";

export const metadata: Metadata = { title: "Add-ons" };

export default async function PlatformAddonsPage() {
  await requirePlatformPermission("addons.read");
  const [addons, plans, holders] = await Promise.all([listAddons(), listPlans(), countAddonHolders()]);
  const planName = new Map(plans.map((p) => [p._id, p.name]));
  const rows: AddonRow[] = addons.map((a) => ({
    ...a,
    holders: holders.get(a._id) ?? 0,
    planNames: a.plans === "all" ? "All plans" : a.plans.map((p) => planName.get(p) ?? p).join(", "),
  }));

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Add-ons"
        description="Extras companies can buy on top of their plan — more seats, AI tokens or storage, or a product their plan doesn't include."
        crumbs={[{ label: "Billing" }]}
        actions={
          <Link href="/console/addons/new" className={buttonVariants()}>
            <Plus className="size-4" data-icon="inline-start" />
            New add-on
          </Link>
        }
      />
      <PanelListFilters>
<AddonsGrid rows={rows} />
</PanelListFilters>
    </div>
  );
}
