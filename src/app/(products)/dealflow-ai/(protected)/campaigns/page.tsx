import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import DashboardSection from "@/components/platform/panel/DashboardSection";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import GranularityToggle from "@/components/products/dealflow-ai/GranularityToggle";
import CampaignFilters from "@/components/products/dealflow-ai/campaigns/CampaignFilters";
import CampaignKpiRow from "@/components/products/dealflow-ai/campaigns/CampaignKpiRow";
import CampaignPerformanceTable from "@/components/products/dealflow-ai/campaigns/CampaignPerformanceTable";
import CampaignImportsHistory from "@/components/products/dealflow-ai/campaigns/CampaignImportsHistory";
import CampaignImportButton from "@/components/products/dealflow-ai/campaigns/CampaignImportButton";
import CampaignSpendLeadsChart from "@/components/products/dealflow-ai/campaigns/CampaignSpendLeadsChart";
import SpendByPlatformChart from "@/components/products/dealflow-ai/campaigns/SpendByPlatformChart";
import RoiByCampaignChart from "@/components/products/dealflow-ai/campaigns/RoiByCampaignChart";
import { getCampaignAnalytics, listCampaigns, listImports } from "@/lib/campaigns";
import { resolveCampaignFilters, type CampaignSearchParams } from "@/lib/campaign-filters";

export const metadata = { title: "Campaign Analytics" };

export default async function CampaignAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<CampaignSearchParams>;
}) {
  await requireLmsPage("VIEW_ANALYTICS");
  const sp = await searchParams;
  const f = resolveCampaignFilters(sp);

  const [analytics, campaignOptions, imports] = await Promise.all([
    getCampaignAnalytics({
      platform: f.platform,
      source: f.source,
      campaignKey: f.campaignKey,
      status: f.status,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
      granularity: f.granularity,
    }),
    listCampaigns({ platform: f.platform, status: f.status }),
    listImports(6),
  ]);

  const hasActiveFilters = Boolean(sp.platform || sp.source || sp.campaign || sp.status || sp.range || sp.dateFrom || sp.dateTo);

  const exportQuery = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) exportQuery.set(k, String(v));

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Campaign Analytics" }]}
        title={<>Campaign Analytics</>}
        description={<>Spend, attributed leads and ROI from your imported Meta, Google &amp; LinkedIn reports.</>}
        actions={<><div className="flex items-center gap-2">
          <Link
            href={`/api/dealflow-ai/campaigns/export?${exportQuery.toString()}`}
            className={buttonVariants({ variant: "outline", size: "sm", className: "transition-transform duration-200 hover:scale-105" })}
          >
            Export CSV
          </Link>
          <CampaignImportButton />
        </div></>}
      />

      <CampaignFilters
        values={{
          platform: sp.platform ?? "",
          source: sp.source ?? "",
          campaign: sp.campaign ?? "",
          status: sp.status ?? "",
          range: f.range,
          dateFrom: f.dateFrom.toISOString().slice(0, 10),
          dateTo: f.dateTo.toISOString().slice(0, 10),
        }}
        campaignOptions={campaignOptions.map((c) => ({ key: c.key, name: c.name }))}
        hasActiveFilters={hasActiveFilters}
      />

      {!analytics.hasData ? (
        <GlassCard>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              {imports.length === 0
                ? "No campaign data yet. Import a performance report to see spend, and a lead-list export to attribute your leads."
                : "No campaign activity matches these filters."}
            </p>
            {imports.length === 0 && <CampaignImportButton />}
          </CardContent>
        </GlassCard>
      ) : (
        <>
          <CampaignKpiRow totals={analytics.totals} currency={analytics.currency} />

          <GlassCard>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Spend vs. Attributed Leads</CardTitle>
              <GranularityToggle value={f.granularity} />
            </CardHeader>
            <CardContent><CampaignSpendLeadsChart data={analytics.timeSeries} currency={analytics.currency} /></CardContent>
          </GlassCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <GlassCard>
              <CardHeader><CardTitle>Spend by Platform</CardTitle></CardHeader>
              <CardContent><SpendByPlatformChart data={analytics.byPlatform} currency={analytics.currency} /></CardContent>
            </GlassCard>
            <GlassCard>
              <CardHeader><CardTitle>ROI by Campaign</CardTitle></CardHeader>
              <CardContent><RoiByCampaignChart data={analytics.campaigns.map((c) => ({ name: c.name, roiPercent: c.roiPercent }))} /></CardContent>
            </GlassCard>
          </div>

          <DashboardSection className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-foreground">Campaign Performance</h2>
              <Link href="/dealflow-ai/campaigns/leads" className="flex items-center gap-1 text-sm text-primary hover:underline">
                Attributed leads <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <CampaignPerformanceTable rows={analytics.campaigns} currency={analytics.currency} />
          </DashboardSection>
        </>
      )}

      <CampaignImportsHistory imports={imports} />
    </div>
  );
}
