import { lockedUnless } from "@/lib/products/viralpulse-ai/gate";
import { redirect } from "next/navigation";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import AdsWizard from "@/components/products/viralpulse-ai/ads/AdsWizard";
import { getViewer, can } from "@/lib/products/viralpulse-ai/viewer";
import { isOpenAIConfigured } from "@/lib/openai";
import { getMediaMany, toMediaCard } from "@/lib/products/viralpulse-ai/media";
import { getGuard } from "@/lib/products/viralpulse-ai/ads-platforms/guard";
import { guardSummary, loadAccountOptions, loadWizard } from "@/lib/products/viralpulse-ai/ads-platforms/wizard-data";
import { parseHandoff } from "@/lib/products/viralpulse-ai/ads-platforms/ui";

export const maxDuration = 300;

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await getViewer();
  if (!viewer) redirect("/viralpulse-ai/login");
  const locked = lockedUnless(viewer, "campaigns.create", "Create campaigns");
  if (locked) return locked;
  if (!can(viewer, "campaigns.create") || !can(viewer, "ads.create")) redirect("/viralpulse-ai/campaigns");
  const handoff = parseHandoff(await searchParams);
  const [accounts, guard, initial, media, ai] = await Promise.all([loadAccountOptions(), getGuard(), loadWizard(null), getMediaMany(handoff.mediaIds), isOpenAIConfigured()]);
  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Campaigns & Ads", href: "/viralpulse-ai/campaigns" }, { label: "New campaign" }]}
        title="New campaign"
        description="Build a paid campaign step by step. Every field is a real setting of the ad platform; the draft saves as you go, and nothing spends until it is approved."
      />
      <AdsWizard
        initial={initial!}
        accounts={accounts}
        guard={guardSummary(guard)}
        perms={{ canEdit: true, canCreate: true, canApprove: can(viewer, "ads.approve"), canPublish: can(viewer, "posts.publish"), userId: viewer.userId, canGenerate: can(viewer, "posts.generate") && ai, canUpload: can(viewer, "media.manage") }}
        handoff={handoff}
        handoffMedia={media.map(toMediaCard)}
        limitsHref={can(viewer, "ads.approve") ? "/viralpulse-ai/campaigns/limits" : null}
      />
    </div>
  );
}
