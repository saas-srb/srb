import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import OfferForm from "@/components/products/dealflow-ai/offers/OfferForm";
import { getCampaign } from "@/lib/offers/campaigns";

export const metadata = { title: "New offer · Festival Offers" };

export default async function NewOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Festival Offers", href: "/sitecraft-ai/offers" },
          { label: campaign.name, href: `/sitecraft-ai/offers/${id}` },
          { label: "New offer" },
        ]}
        title={<>New offer</>}
      />
<div className="relative mx-auto max-w-3xl space-y-4">
      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <OfferForm campaignId={id} />
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
