import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import OfferForm from "@/components/products/dealflow-ai/offers/OfferForm";
import DeleteEntityButton from "@/components/products/dealflow-ai/offers/DeleteEntityButton";
import { getCampaign } from "@/lib/offers/campaigns";
import { getOffer, serializeOffer } from "@/lib/offers/offers";
import { deleteOfferAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditOfferPage({ params }: { params: Promise<{ id: string; offerId: string }> }) {
  const { id, offerId } = await params;
  const [campaign, offer] = await Promise.all([getCampaign(id), getOffer(offerId)]);
  if (!campaign || !offer || offer.campaignId !== id) notFound();

  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Festival Offers", href: "/sitecraft-ai/offers" },
          { label: campaign.name, href: `/sitecraft-ai/offers/${id}` },
          { label: offer.title },
        ]}
        title={<>{offer.title}</>}
        actions={<><DeleteEntityButton
          label="offer"
          confirmText="This removes the offer from the public page immediately. This can't be undone."
          onDelete={deleteOfferAction.bind(null, id, offerId)}
          redirectTo={`/sitecraft-ai/offers/${id}`}
        /></>}
      />
<div className="relative mx-auto max-w-3xl space-y-4">
      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <OfferForm campaignId={id} offer={serializeOffer(offer)} />
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
