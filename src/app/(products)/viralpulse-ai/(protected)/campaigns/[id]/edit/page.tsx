import { notFound, redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import AdsWizard from "@/components/products/viralpulse-ai/ads/AdsWizard";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { isOpenAIConfigured } from "@/lib/openai";
import { getGuard } from "@/lib/products/viralpulse-ai/ads-platforms/guard";
import { guardSummary, loadAccountOptions, loadWizard } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import { SectionCard } from "@/components/products/viralpulse-ai/SmmsUi";
import CampaignForm from "@/components/products/viralpulse-ai/CampaignForm";
import { getCampaign } from "@/lib/products/viralpulse-ai/campaigns";
import { briefPickers, toDateInput } from "@/lib/products/viralpulse-ai/page-data";
import { isStepKey } from "@/lib/products/viralpulse-ai/ads-platforms/ui";

export const maxDuration = 300;

export default async function EditCampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  if (!can(viewer, "VIEW_CAMPAIGNS")) redirect("/viralpulse-ai");
  const { id } = await params;
  const sp = await searchParams;
  const c = await getCampaign(id);
  if (!c) notFound();
  // A campaign with no Facebook or Instagram platform is not launched from here: it keeps the plain brief editor.
  if (!c.platforms.some((p) => p === "facebook" || p === "instagram")) {
    if (!can(viewer, "EDIT_CAMPAIGNS")) redirect(`/viralpulse-ai/campaigns/${id}`);
    const pickers = await briefPickers();
    return (
      <div className="space-y-4">
        <PanelPageHeader breadcrumbs={[{ label: "Campaigns & Ads", href: "/viralpulse-ai/campaigns" }, { label: c.name, href: `/viralpulse-ai/campaigns/${id}` }, { label: "Edit brief" }]} title="Edit brief" description="This campaign runs on a platform that is launched by hand in its own ads manager. Changing the brief doesn't rewrite existing AI content." />
        <SectionCard title="Campaign brief">
          <CampaignForm campaignId={id} {...pickers} canGenerate={false} initial={{ name: c.name, objective: c.objective, platforms: c.platforms, targetAudience: c.targetAudience, industry: c.industry, location: c.location, budget: c.budget === null ? "" : String(c.budget), currency: c.currency, startDate: toDateInput(c.startDate), endDate: toDateInput(c.endDate), cta: c.cta, landingPage: c.landingPage, offerService: c.offerService, offerId: c.offerId ?? "", clientId: c.clientId ?? "", brandInfo: c.brandInfo, keywords: c.keywords.join(", "), tone: c.tone, language: c.language }} />
        </SectionCard>
      </div>
    );
  }
  const [initial, accounts, guard, ai] = await Promise.all([loadWizard(id), loadAccountOptions(), getGuard(), isOpenAIConfigured()]);
  if (!initial) notFound();
  const step = typeof sp.step === "string" && isStepKey(sp.step) ? sp.step : null;
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Campaigns & Ads", href: "/viralpulse-ai/campaigns" }, { label: initial.state.name || "Campaign", href: `/viralpulse-ai/campaigns/${id}` }, { label: "Edit" }]}
        title={initial.state.name || "Edit campaign"}
        description="Edit the draft, or manage the launch in the last step."
      />
      <AdsWizard
        initial={initial}
        accounts={accounts}
        guard={guardSummary(guard)}
        perms={{ canEdit: can(viewer, "EDIT_CAMPAIGNS") && can(viewer, "CREATE_ADS"), canCreate: can(viewer, "CREATE_ADS") && can(viewer, "EDIT_CAMPAIGNS"), canApprove: can(viewer, "APPROVE_AD_SPEND"), canPublish: can(viewer, "PUBLISH_CONTENT"), userId: viewer.userId, canGenerate: can(viewer, "GENERATE_AI_CONTENT") && ai, canUpload: can(viewer, "MANAGE_MEDIA") }}
        handoff={{ step, mediaIds: [], ugcProjectId: null }}
        handoffMedia={[]}
        limitsHref={can(viewer, "APPROVE_AD_SPEND") ? "/viralpulse-ai/campaigns/limits" : null}
      />
    </div>
  );
}
