import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlatformPageHeader from "@/components/platform/panel/PlatformPageHeader";
import ActiveToggleButton from "@/components/platform/panel/ActiveToggleButton";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { requirePlatformPermission } from "@/lib/platform/console/access";
import { getCoupon, listCouponRedemptions } from "@/lib/platform/billing/coupons";
import { listPlans } from "@/lib/platform/billing/plans";
import { getBillingSettings } from "@/lib/platform/billing/settings";
import { couponStatus, describeCouponDiscount } from "@/lib/platform/billing/catalog-types";
import { formatMoney } from "@/lib/platform/billing/types";
import CouponForm from "../CouponForm";
import { CouponStatusBadge } from "../CouponsGrid";
import { setCouponActiveAction } from "../actions";

export const metadata: Metadata = { title: "Coupon" };

export default async function CouponDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlatformPermission("coupons.read");
  const coupon = await getCoupon((await params).id);
  if (!coupon) notFound();
  const [plans, settings, redemptions] = await Promise.all([listPlans(), getBillingSettings(), listCouponRedemptions(coupon._id)]);
  const currency = settings.billing.currency;
  const live = redemptions.filter((r) => r.status === "redeemed");

  return (
    <div className="space-y-6 p-1">
      <PlatformPageHeader
        title={coupon.code}
        description={`${describeCouponDiscount(coupon, currency)} · ${coupon.redeemedCount} of ${coupon.maxRedemptions ?? "unlimited"} redemptions used`}
        crumbs={[{ label: "Billing" }, { label: "Coupons & discounts", href: "/console/coupons" }]}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <CouponStatusBadge status={couponStatus(coupon)} />
            <ActiveToggleButton id={coupon._id} active={coupon.active} noun="coupon" action={setCouponActiveAction} />
          </div>
        }
      />

      <CouponForm key={coupon.updatedAt.toISOString()} coupon={coupon} plans={plans.map((p) => ({ id: p._id, name: p.name }))} currency={currency} />

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base" id="redemptions">
            Redemptions
          </CardTitle>
          <CardDescription>
            {live.length} live{redemptions.length > live.length ? `, ${redemptions.length - live.length} released (failed or abandoned payments)` : ""}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {redemptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody has redeemed this coupon yet.</p>
          ) : (
            <ul className="divide-y divide-border text-sm" aria-labelledby="redemptions">
              {redemptions.map((r) => (
                <li key={r._id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <Link href={`/console/companies/${r.companyId}`} className="font-medium hover:underline">
                      {r.companyName ?? r.companyId}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.planId} · {r.interval} · {formatMoney(r.discount, currency)} off · {formatDateTime(r.redeemedAt)}
                      {r.durationCycles !== null ? ` · ${r.cyclesBilled}/${r.durationCycles} cycles billed` : ` · ${r.cyclesBilled} cycles billed`}
                    </p>
                  </div>
                  {r.status === "redeemed" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">Redeemed</Badge>
                  ) : (
                    <Badge variant="secondary" title={r.releaseReason ?? undefined}>
                      Released
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </GlassCard>
    </div>
  );
}
