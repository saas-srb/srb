import { requireLmsPage } from "@/lib/lms-auth";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CampaignFilters from "@/components/products/dealflow-ai/campaigns/CampaignFilters";
import CampaignLeadsTable from "@/components/products/dealflow-ai/campaigns/CampaignLeadsTable";
import { searchAttributedLeads } from "@/lib/leads";
import { isValidLeadStatus } from "@/lib/lead-status";
import { resolveCampaignFilters, type CampaignSearchParams } from "@/lib/campaign-filters";
import { listCampaigns } from "@/lib/campaigns";
import type { SerializedLead } from "@/components/products/dealflow-ai/types";

export const metadata = { title: "Attributed Leads" };

export default async function AttributedLeadsPage({
  searchParams,
}: {
  searchParams: Promise<CampaignSearchParams & { page?: string; search?: string; leadStatus?: string }>;
}) {
  await requireLmsPage("VIEW_ANALYTICS");
  const sp = await searchParams;
  const f = resolveCampaignFilters(sp);
  const page = Math.max(Number(sp.page) || 1, 1);
  const leadStatus = sp.leadStatus && isValidLeadStatus(sp.leadStatus) ? sp.leadStatus : undefined;

  const [{ items, total, totalPages }, campaignOptions] = await Promise.all([
    searchAttributedLeads({
      page,
      pageSize: 25,
      search: sp.search,
      status: leadStatus,
      source: f.source,
      campaignKey: f.campaignKey,
      dateFrom: f.dateFrom,
      dateTo: f.dateTo,
    }),
    listCampaigns({ platform: f.platform, status: f.status }),
  ]);

  const serialized: SerializedLead[] = items.map((lead) => ({
    ...lead,
    _id: String(lead._id),
    createdAt: new Date(lead.createdAt).toISOString(),
    updatedAt: new Date(lead.updatedAt).toISOString(),
    attribution: lead.attribution ? { method: lead.attribution.method, at: new Date(lead.attribution.at).toISOString() } : undefined,
  }));

  const hasActiveFilters = Boolean(sp.platform || sp.source || sp.campaign || sp.status || sp.range || sp.dateFrom || sp.dateTo || sp.search || sp.leadStatus);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Campaign Analytics", href: "/dealflow-ai/campaigns" }, { label: "Attributed Leads" }]}
        title={<>Attributed Leads</>}
        description={<>{total} lead{total === 1 ? "" : "s"} tied to a campaign or paid source.</>}
        actions={<><Link href="/dealflow-ai/campaigns" className="flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="size-3.5" /> Back to analytics
        </Link></>}
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

      <CampaignLeadsTable
        items={serialized}
        total={total}
        page={page}
        totalPages={totalPages}
        initialSearch={sp.search ?? ""}
        initialLeadStatus={leadStatus ?? ""}
      />
    </div>
  );
}
