import type { Metadata } from "next";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import CouponForm from "../CouponForm";

export const metadata: Metadata = { title: "New coupon" };

export default async function NewCouponPage() {
  await requirePlatformPermission("coupons.read");
  const [plans, settings] = await Promise.all([listPlans(), getBillingSettings()]);
  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader title="New coupon" crumbs={[{ label: "Billing" }, { label: "Coupons & discounts", href: "/console/coupons" }]} />
      <CouponForm coupon={null} plans={plans.map((p) => ({ id: p._id, name: p.name }))} currency={settings.billing.currency} />
    </div>
  );
}
