import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import FunnelChart from "@/components/products/dealflow-ai/offers/FunnelChart";
import TrendChart from "@/components/products/dealflow-ai/offers/TrendChart";
import { getCampaign } from "@/lib/offers/campaigns";
import { getCampaignFunnel, getCampaignBreakdown, getCampaignTrend, getPromoStats } from "@/lib/offers/analytics";
import { getAudienceLabel } from "@/lib/offers/constants";

export const dynamic = "force-dynamic";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <GlassCard interactive={false}>
      <CardContent className="py-4">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-foreground">{value}</p>
      </CardContent>
    </GlassCard>
  );
}

function BreakdownTable({ title, rows, labelFor }: { title: string; rows: { key: string; label: string; views: number; clicks: number; claims: number }[]; labelFor?: (key: string) => string }) {
  return (
    <GlassCard>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">{title}</th>
              <th className="py-2 pr-3 font-medium">Views</th>
              <th className="py-2 pr-3 font-medium">Clicks</th>
              <th className="py-2 font-medium">Claims</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3 text-foreground">{labelFor ? labelFor(r.key) : r.label}</td>
                <td className="py-2 pr-3 text-muted-foreground">{r.views}</td>
                <td className="py-2 pr-3 text-muted-foreground">{r.clicks}</td>
                <td className="py-2 font-semibold text-foreground">{r.claims || "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-4 text-center text-muted-foreground">
                  No data yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </GlassCard>
  );
}

export default async function CampaignAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const [funnel, trend, byAudience, byDevice, bySource, promo] = await Promise.all([
    getCampaignFunnel(id),
    getCampaignTrend(id, 14),
    getCampaignBreakdown(id, "audience"),
    getCampaignBreakdown(id, "device"),
    getCampaignBreakdown(id, "source"),
    getPromoStats(id),
  ]);

  const stages = [
    { label: "Campaign Views", value: funnel.campaignViews },
    { label: "Offer Views", value: funnel.offerViews },
    { label: "Claim Clicks", value: funnel.offerClicks },
    { label: "Form Starts", value: funnel.formStarts },
    { label: "Conversions", value: funnel.conversions },
  ];

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Festival Offers", href: "/sitecraft-ai/offers" },
          { label: campaign.name, href: `/sitecraft-ai/offers/${id}` },
          { label: "Analytics" },
        ]}
        title={<>{campaign.name} — Analytics</>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Campaign Views" value={funnel.campaignViews.toLocaleString("en-IN")} />
        <Stat label="Claim Clicks" value={funnel.offerClicks.toLocaleString("en-IN")} />
        <Stat label="Form Starts" value={funnel.formStarts.toLocaleString("en-IN")} />
        <Stat label="Conversions" value={funnel.conversions.toLocaleString("en-IN")} />
        <Stat label="Conversion Rate" value={`${(funnel.conversionRate * 100).toFixed(1)}%`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            <FunnelChart stages={stages} />
          </CardContent>
        </GlassCard>
        <GlassCard>
          <CardHeader>
            <CardTitle className="text-base">Last 14 days</CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart data={trend} />
          </CardContent>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <BreakdownTable title="Audience" rows={byAudience} labelFor={getAudienceLabel} />
        <BreakdownTable title="Device" rows={byDevice} />
        <BreakdownTable title="Source" rows={bySource} />
      </div>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Top Strip &amp; Popup</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div>
            <p className="text-xs text-muted-foreground">Strip Impressions</p>
            <p className="text-lg font-bold text-foreground">{promo.stripImpressions.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Strip Clicks</p>
            <p className="text-lg font-bold text-foreground">{promo.stripClicks.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Strip Closes</p>
            <p className="text-lg font-bold text-foreground">{promo.stripCloses.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Popup Impressions</p>
            <p className="text-lg font-bold text-foreground">{promo.popupImpressions.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Popup Clicks</p>
            <p className="text-lg font-bold text-foreground">{promo.popupClicks.toLocaleString("en-IN")}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Popup Closes</p>
            <p className="text-lg font-bold text-foreground">{promo.popupCloses.toLocaleString("en-IN")}</p>
          </div>
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Engagement</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <div><p className="text-xs text-muted-foreground">Details opened</p><p className="text-lg font-bold text-foreground">{funnel.detailOpens.toLocaleString("en-IN")}</p></div>
          <div><p className="text-xs text-muted-foreground">Personalised views</p><p className="text-lg font-bold text-foreground">{funnel.personalizedViews.toLocaleString("en-IN")}</p></div>
          <div><p className="text-xs text-muted-foreground">Shares</p><p className="text-lg font-bold text-foreground">{funnel.shares.toLocaleString("en-IN")}</p></div>
          <div><p className="text-xs text-muted-foreground">Countdowns expired</p><p className="text-lg font-bold text-foreground">{funnel.countdownExpiries.toLocaleString("en-IN")}</p></div>
          <div><p className="text-xs text-muted-foreground">WhatsApp clicks</p><p className="text-lg font-bold text-foreground">{funnel.whatsappClicks.toLocaleString("en-IN")}</p></div>
          <div><p className="text-xs text-muted-foreground">Call clicks</p><p className="text-lg font-bold text-foreground">{funnel.callClicks.toLocaleString("en-IN")}</p></div>
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        WhatsApp clicks: {funnel.whatsappClicks.toLocaleString("en-IN")} · Call clicks: {funnel.callClicks.toLocaleString("en-IN")}. Conversions
        are real claims from <code className="text-[11px]">offer_claims</code>, not a separate tracked event.
      </p>
    </div>
  );
}
