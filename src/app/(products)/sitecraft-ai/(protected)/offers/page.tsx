import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import LiveCountdown from "@/components/offers/LiveCountdown";
import { searchCampaigns } from "@/lib/offers/campaigns";
import { getCampaignSummaries, getOfferAlerts } from "@/lib/offers/analytics";
import { getCampaignStatusMeta, getCampaignEffectiveStatus } from "@/lib/offers/constants";
import { formatDateTime } from "@/lib/utils";
import { AlertTriangle, Timer, Flame } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Festival Offers · Lead Management" };

export default async function OffersCampaignsPage() {
  const { items } = await searchCampaigns({ pageSize: 100 });
  const [summaries, alerts] = await Promise.all([getCampaignSummaries(items.map((c) => c._id)), getOfferAlerts()]);

  const withStatus = items.map((c) => ({ c, effective: getCampaignEffectiveStatus(c.status, c.startDate, c.endDate) }));
  const live = withStatus.filter((x) => x.effective === "active");
  const totals = Array.from(summaries.values()).reduce(
    (a, s) => ({ offers: a.offers + s.offers, claims: a.claims + s.claims, claims7d: a.claims7d + s.claims7d, views: a.views + s.views }),
    { offers: 0, claims: 0, claims7d: 0, views: 0 }
  );
  const conversion = totals.views > 0 ? (totals.claims / totals.views) * 100 : 0;

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Festival Offers" }]}
        title={<>Festival Offers</>}
        description={<>Campaigns power the public <code className="text-xs">/offers</code> page. Only one campaign is ever live at a
            time — resolved automatically by priority and date, no deploy needed.</>}
        actions={<><div className="flex items-center gap-2">
          <Link href="/sitecraft-ai/offers/coupons" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Coupons
          </Link>
          <Link href="/sitecraft-ai/offers/claims" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Claims
          </Link>
          <Link href="/sitecraft-ai/offers/new" className={buttonVariants({ size: "sm" })}>
            New campaign
          </Link>
        </div></>}
      />

      <PanelListFilters>
<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <GlassCard interactive={false}>
          <CardContent className="py-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Flame className="size-3.5 text-primary" /> Live now</p>
            {live.length > 0 ? (
              <>
                <p className="mt-1 truncate text-lg font-black tracking-tight text-foreground">{live[0].c.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Ends in <LiveCountdown endDate={new Date(live[0].c.endDate).toISOString()} variant="inline" className="font-semibold text-foreground" /></p>
              </>
            ) : (
              <p className="mt-1 text-lg font-black tracking-tight text-muted-foreground">No live campaign</p>
            )}
          </CardContent>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardContent className="py-4">
            <p className="text-xs font-medium text-muted-foreground">Claims (last 7 days)</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-foreground">{totals.claims7d.toLocaleString("en-IN")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{totals.claims.toLocaleString("en-IN")} all-time</p>
          </CardContent>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardContent className="py-4">
            <p className="text-xs font-medium text-muted-foreground">Visit → claim rate</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-foreground">{conversion.toFixed(1)}%</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{totals.views.toLocaleString("en-IN")} campaign views</p>
          </CardContent>
        </GlassCard>
        <GlassCard interactive={false}>
          <CardContent className="py-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><AlertTriangle className="size-3.5 text-amber-500" /> Needs attention</p>
            <p className="mt-1 text-2xl font-black tracking-tight text-foreground">{alerts.length}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{totals.offers} offers across {items.length} campaigns</p>
          </CardContent>
        </GlassCard>
      </div>

      {alerts.length > 0 && (
        <GlassCard interactive={false}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Timer className="size-4 text-amber-500" /> Expiry &amp; capacity alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.slice(0, 8).map((a) => (
              <div key={`${a.kind}-${a.offerId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/50 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <Link href={`/sitecraft-ai/offers/${a.campaignId}/offers/${a.offerId}`} className="font-medium text-foreground hover:text-primary hover:underline">{a.title}</Link>
                  <p className="text-xs text-muted-foreground">{a.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  {a.kind === "ending_soon" && a.endsAt && <LiveCountdown endDate={a.endsAt} variant="pill" />}
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      a.kind === "sold_out" ? "bg-destructive/15 text-destructive" : a.kind === "ending_soon" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-orange-500/15 text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    {a.kind === "sold_out" ? "Sold out" : a.kind === "ending_soon" ? "Ending soon" : "Almost full"}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </GlassCard>
      )}

      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Window</th>
                <th className="py-2 pr-3 font-medium">Offers</th>
                <th className="py-2 pr-3 font-medium">Views</th>
                <th className="py-2 pr-3 font-medium">Claims</th>
                <th className="py-2 pr-3 font-medium">Conv.</th>
                <th className="py-2 font-medium">Priority</th>
              </tr>
            </thead>
            <tbody>
              {withStatus.map(({ c, effective }) => {
                const meta = getCampaignStatusMeta(effective);
                const sum = summaries.get(c._id);
                const rate = sum && sum.views > 0 ? ((sum.claims / sum.views) * 100).toFixed(1) + "%" : "—";
                return (
                  <tr key={c._id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/sitecraft-ai/offers/${c._id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                        {c.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{c.slug}</span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground capitalize">{c.campaignType.replace("-", " ")}</td>
                    <td className="py-2 pr-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                        <span className={`size-1.5 rounded-full ${meta.dotClass}`} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {formatDateTime(c.startDate)} → {formatDateTime(c.endDate)}
                      {effective === "active" && (
                        <span className="block text-xs font-semibold text-foreground">
                          Ends in <LiveCountdown endDate={new Date(c.endDate).toISOString()} variant="inline" />
                        </span>
                      )}
                      {effective === "scheduled" && (
                        <span className="block text-xs font-semibold text-blue-600 dark:text-blue-400">
                          Starts in <LiveCountdown endDate={new Date(c.startDate).toISOString()} variant="inline" />
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{sum?.offers ?? 0}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{(sum?.views ?? 0).toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-foreground">{(sum?.claims ?? 0).toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{rate}</td>
                    <td className="py-2 text-muted-foreground">{c.priority}</td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    No campaigns yet.{" "}
                    <Link href="/sitecraft-ai/offers/new" className="text-primary hover:underline">
                      Create the first one
                    </Link>
                    .
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
