import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import CampaignForm from "@/components/products/dealflow-ai/offers/CampaignForm";
import DeleteEntityButton from "@/components/products/dealflow-ai/offers/DeleteEntityButton";
import { getCampaign, serializeCampaign } from "@/lib/offers/campaigns";
import { listOffersForCampaign } from "@/lib/offers/offers";
import LiveCountdown from "@/components/offers/LiveCountdown";
import { getOfferAnalyticsForCampaign } from "@/lib/offers/analytics";
import { AUDIENCES, formatOfferBadge, getOfferStatusMeta, getAudienceLabel } from "@/lib/offers/constants";
import { claimProgress, nowMs } from "@/lib/offers/live";
import { getCategoryLabel } from "@/lib/categories";
import { deleteCampaignAction } from "../actions";
import { deleteOfferAction } from "./offers/actions";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const [offers, perf] = await Promise.all([listOffersForCampaign(id), getOfferAnalyticsForCampaign(id)]);
  const serialized = serializeCampaign(campaign);
  const now = nowMs();
  const liveOffers = offers.filter((o) => o.status === "active" && o.validFrom.getTime() <= now && o.validUntil.getTime() >= now);
  // How many LIVE offers each audience can currently see — a gap here means a segment sees nothing targeted at them.
  const coverage = AUDIENCES.filter((a) => a.value !== "ALL").map((a) => ({
    value: a.value,
    label: a.label,
    count: liveOffers.filter((o) => o.audience.includes(a.value) || o.audience.includes("ALL")).length,
    targeted: liveOffers.filter((o) => o.audience.includes(a.value)).length,
  }));

  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dealflow-ai" },
          { label: "Festival Offers", href: "/sitecraft-ai/offers" },
          { label: campaign.name },
        ]}
        title={<>{campaign.name}</>}
        actions={<><div className="flex items-center gap-2">
          <Link href={`/sitecraft-ai/offers/${id}/analytics`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Analytics
          </Link>
          <DeleteEntityButton
            label="campaign"
            confirmText="This also hides every offer under this campaign from the public page. This can't be undone."
            onDelete={deleteCampaignAction.bind(null, id)}
            redirectTo="/sitecraft-ai/offers"
          />
        </div></>}
      />
<div className="relative mx-auto max-w-5xl space-y-4">

      <GlassCard>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CampaignForm campaign={serialized} />
        </CardContent>
      </GlassCard>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Audience coverage (live offers)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {coverage.map((c) => (
              <div key={c.value} className={`rounded-xl border p-3 ${c.count === 0 ? "border-destructive/40 bg-destructive/5" : "border-border/50"}`}>
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="mt-1 text-xl font-black text-foreground">{c.count}</p>
                <p className="text-[11px] text-muted-foreground">{c.targeted} targeted · {c.count - c.targeted} shared with everyone</p>
              </div>
            ))}
          </div>
          {coverage.some((c) => c.count === 0) && (
            <p className="mt-3 text-xs text-destructive">A red tile means visitors of that type currently see no offer aimed at them. Edit an offer&apos;s audience or add one.</p>
          )}
        </CardContent>
      </GlassCard>

      <GlassCard>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Offers in this campaign</CardTitle>
          <Link href={`/sitecraft-ai/offers/${id}/offers/new`} className={buttonVariants({ size: "sm" })}>
            New offer
          </Link>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Offer</th>
                <th className="py-2 pr-3 font-medium">Audience</th>
                <th className="py-2 pr-3 font-medium">Discount</th>
                <th className="py-2 pr-3 font-medium">Performance</th>
                <th className="py-2 pr-3 font-medium">Claims</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => {
                const meta = getOfferStatusMeta(o.status);
                const p = perf.get(o._id);
                const conversions = p?.conversions ?? 0;
                const progress = claimProgress(conversions, o.claimLimit);
                const endsSoon = o.status === "active" && o.validUntil.getTime() > now && o.validUntil.getTime() - now <= 72 * 3600000;
                return (
                  <tr key={o._id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/sitecraft-ai/offers/${id}/offers/${o._id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {o.title}
                      </Link>
                      <span className="flex gap-1 text-xs text-muted-foreground">
                        {o.isDealOfTheDay && <span className="text-primary">Deal of the Day</span>}
                        {o.isFeatured && <span>Featured</span>}
                        {o.isFlashDeal && <span>Flash</span>}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <span className="block text-xs text-muted-foreground">{getCategoryLabel(o.category)}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {o.audience.map((a) => (
                          <span key={a} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{getAudienceLabel(a)}</span>
                        ))}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-foreground">{formatOfferBadge(o.pricing)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {(p?.views ?? 0).toLocaleString("en-IN")} views · {(p?.clicks ?? 0).toLocaleString("en-IN")} clicks · {(p?.detailOpens ?? 0).toLocaleString("en-IN")} details
                      <span className="block font-semibold text-foreground">{(p?.views ?? 0) > 0 ? ((conversions / (p?.views ?? 1)) * 100).toFixed(1) : "0.0"}% view→claim</span>
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      <span className="font-semibold text-foreground">{conversions.toLocaleString("en-IN")}{o.claimLimit ? ` / ${o.claimLimit}` : ""}</span>
                      {progress.percent !== null && (
                        <span className="mt-1 block h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <span className={`block h-full rounded-full ${progress.almostGone || progress.soldOut ? "bg-destructive" : "bg-primary"}`} style={{ width: `${progress.percent}%` }} />
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                        <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
                        {meta.label}
                      </span>
                      {endsSoon && (
                        <span className="mt-1 block text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                          Ends in <LiveCountdown endDate={o.validUntil.toISOString()} variant="inline" />
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right">
                      <DeleteEntityButton
                        label="offer"
                        confirmText="This removes the offer from the public page immediately. This can't be undone."
                        onDelete={deleteOfferAction.bind(null, id, o._id)}
                      />
                    </td>
                  </tr>
                );
              })}
              {offers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-muted-foreground">
                    No offers yet.{" "}
                    <Link href={`/sitecraft-ai/offers/${id}/offers/new`} className="text-primary hover:underline">
                      Add the first one
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
