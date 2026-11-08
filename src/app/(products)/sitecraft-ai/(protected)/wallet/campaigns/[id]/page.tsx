import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import CampaignForm from "@/components/products/dealflow-ai/wallet/CampaignForm";
import DeleteEntityButton from "@/components/products/dealflow-ai/offers/DeleteEntityButton";
import { getCampaign, serializeCampaign } from "@/lib/wallet/campaigns";
import { deleteCampaignAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();
  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Referral campaigns", href: "/sitecraft-ai/wallet/campaigns" }, { label: campaign.name }]}
        title={<>{campaign.name}</>}
        actions={<><DeleteEntityButton label="campaign" confirmText="Referrals already recorded are kept. New signups will no longer be attributed under this campaign." onDelete={deleteCampaignAction.bind(null, id)} redirectTo="/sitecraft-ai/wallet/campaigns" /></>}
      />
<div className="relative mx-auto max-w-2xl space-y-4">
      <GlassCard><CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader><CardContent><CampaignForm campaign={serializeCampaign(campaign)} /></CardContent></GlassCard>
    </div>
</div>
  );
}
