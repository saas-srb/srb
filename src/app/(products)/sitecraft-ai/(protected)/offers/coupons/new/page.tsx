import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import CouponForm from "@/components/products/dealflow-ai/offers/CouponForm";
import { listCampaignOptions } from "@/lib/offers/campaigns";

export const dynamic = "force-dynamic";
export const metadata = { title: "New coupon · Festival Offers" };

export default async function NewCouponPage() {
  const campaignOptions = await listCampaignOptions();

  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Festival Offers", href: "/sitecraft-ai/offers" },
          { label: "Coupons", href: "/sitecraft-ai/offers/coupons" },
          { label: "New coupon" },
        ]}
        title={<>New coupon</>}
      />
<div className="relative mx-auto max-w-2xl space-y-4">
      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CouponForm campaignOptions={campaignOptions} />
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
