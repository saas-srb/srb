import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { buttonVariants } from "@/components/ui/button";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listCoupons } from "@/lib/platform/billing/coupons";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { couponStatus } from "@/lib/platform/billing/catalog-types";
import CouponsGrid, { type CouponRow } from "./CouponsGrid";

export const metadata: Metadata = { title: "Coupons & discounts" };

export default async function PlatformCouponsPage() {
  await requirePlatformPermission("coupons.read");
  const [coupons, plans, settings] = await Promise.all([listCoupons(), listPlans(), getBillingSettings()]);
  const planName = new Map(plans.map((p) => [p._id, p.name]));
  const rows: CouponRow[] = coupons.map((c) => ({
    ...c,
    status: couponStatus(c),
    planNames: c.plans === "all" ? "All plans" : c.plans.map((p) => planName.get(p) ?? p).join(", "),
  }));

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title="Coupons & discounts"
        description="Discount codes companies can apply at checkout — percentage or fixed, per plan and billing cycle, with limits and validity."
        crumbs={[{ label: "Billing" }]}
        actions={
          <Link href="/console/coupons/new" className={buttonVariants()}>
            <Plus className="size-4" data-icon="inline-start" />
            New coupon
          </Link>
        }
      />
      <PanelListFilters>
<CouponsGrid rows={rows} currency={settings.billing.currency} />
</PanelListFilters>
    </div>
  );
}
