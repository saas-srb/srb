import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { hasPermission } from "@/lib/platform/console/permissions";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listPlans } from "@/lib/platform/billing/plans";
import { loadActualCosts, loadCostSettings } from "@/lib/platform/costs/store";
import { PRICE_LIST, PRICES_AS_OF } from "@/lib/platform/costs/catalog";
import { toCostPlan } from "@/lib/platform/costs/plans";
import { countCompaniesByPlan } from "@/lib/platform/billing/plans";
import type { PlanInputForCost } from "@/lib/platform/costs/model";
import CostCalculator from "./CostCalculator";

export const metadata: Metadata = { title: "Costs & pricing calculator" };
export const dynamic = "force-dynamic";

export default async function CostsPage() {
  const user = await requirePlatformPermission("plans.read");
  const [{ settings, saved, updatedAt }, plans] = await Promise.all([loadCostSettings(), listPlans()]);
  const counts = await countCompaniesByPlan();
  const inputs = (await Promise.all(plans.filter((p) => p.active).map((p) => toCostPlan(p._id, counts)))).filter((p): p is PlanInputForCost => !!p);
  const actual = await loadActualCosts(settings);
  const canManage = hasPermission(user.platform.permissions, "plans.manage");
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Costs & pricing calculator"
        description={`What the platform pays its providers (official prices read on ${PRICES_AS_OF}), what each plan costs to serve, and the lowest price that covers it with a small buffer. Prices exclude GST.`}
      />
      <CostCalculator initial={settings} plans={inputs} actual={actual} priceList={PRICE_LIST} asOf={PRICES_AS_OF} saved={saved} savedAt={updatedAt} canManage={canManage} />
    </div>
  );
}
