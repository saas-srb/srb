import { withTransport } from "@/lib/security/transport";
import { NextRequest, NextResponse } from "next/server";
import { requireLms } from "@/lib/lms-auth";
import { getCampaignAnalytics } from "@/lib/campaigns";
import { resolveCampaignFilters } from "@/lib/campaign-filters";
import { getPlatformMeta } from "@/lib/campaign-platforms";
import { toCsv } from "@/lib/csv";

async function handleGET(req: NextRequest) {
  const lmsUser = await requireLms("EXPORT_DATA");
  if (!lmsUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const f = resolveCampaignFilters({
    platform: sp.get("platform") ?? undefined,
    source: sp.get("source") ?? undefined,
    campaign: sp.get("campaign") ?? undefined,
    status: sp.get("status") ?? undefined,
    range: sp.get("range") ?? undefined,
    dateFrom: sp.get("dateFrom") ?? undefined,
    dateTo: sp.get("dateTo") ?? undefined,
    granularity: sp.get("granularity") ?? undefined,
  });

  const analytics = await getCampaignAnalytics({
    platform: f.platform,
    source: f.source,
    campaignKey: f.campaignKey,
    status: f.status,
    dateFrom: f.dateFrom,
    dateTo: f.dateTo,
    granularity: f.granularity,
  });

  const num = (v: number | null) => (v == null ? "" : String(v));
  const csv = toCsv(analytics.campaigns, [
    { header: "Campaign", value: (r) => r.name },
    { header: "Platform", value: (r) => getPlatformMeta(r.platform).label },
    { header: "Status", value: (r) => r.status },
    { header: `Spend (${analytics.currency})`, value: (r) => r.spend },
    { header: "Impressions", value: (r) => r.impressions },
    { header: "Clicks", value: (r) => r.clicks },
    { header: "CTR %", value: (r) => num(r.ctr) },
    { header: "CPC", value: (r) => num(r.cpc) },
    { header: "Leads (platform-reported)", value: (r) => r.leadsReported },
    { header: "Leads (attributed)", value: (r) => r.leadsAttributed },
    { header: "Cost / lead", value: (r) => num(r.cpl) },
    { header: "Qualified", value: (r) => r.qualified },
    { header: "Cost / qualified", value: (r) => num(r.cpql) },
    { header: "Completed", value: (r) => r.completed },
    { header: "CAC", value: (r) => num(r.cac) },
    { header: `Revenue (${analytics.currency})`, value: (r) => r.revenue },
    { header: "ROAS", value: (r) => num(r.roas) },
    { header: "ROI %", value: (r) => num(r.roiPercent) },
  ]);

  const filename = `campaigns-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export const GET = withTransport(handleGET);
