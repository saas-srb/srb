import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { getActiveCampaign, getCampaign, serializeCampaign } from "@/lib/offers/campaigns";
import { getPublicOffersWithStats } from "@/lib/offers/offers";
import { getCampaignEffectiveStatus } from "@/lib/offers/constants";

/**
 * Live public offers + real claim counts for the offers page (progress bars,
 * "N claimed", sold-out state) and for claiming from the global strip/popup on
 * any page. Also returns `serverTime` so countdowns use the server clock.
 */
async function handleGET(req: NextRequest) {
  try {
    const campaignId = req.nextUrl.searchParams.get("campaignId");
    const campaign = campaignId ? await getCampaign(campaignId) : await getActiveCampaign();
    const now = new Date();
    if (!campaign || getCampaignEffectiveStatus(campaign.status, campaign.startDate, campaign.endDate, now) !== "active") {
      return NextResponse.json({ active: false, serverTime: now.getTime(), offers: [] });
    }
    const offers = await getPublicOffersWithStats({ campaignId: campaign._id, now });
    return NextResponse.json({ active: true, serverTime: now.getTime(), campaign: serializeCampaign(campaign), offers }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Failed to load public offers", err);
    return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
}

export const GET = withTransport(handleGET);
