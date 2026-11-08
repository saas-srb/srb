import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listSubscriptions, countSubscribersByCampaign } from "@/lib/offers/subscriptions";
import { searchCampaigns } from "@/lib/offers/campaigns";
import { getAudienceLabel } from "@/lib/offers/constants";
import { formatDateTime } from "@/lib/utils";
import { getCompanyBrand } from "@/lib/platform/branding";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notify-Me Subscribers · Festival Offers" };

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const brand = await getCompanyBrand();
  const { campaign } = await searchParams;
  const [subs, counts, { items: campaigns }] = await Promise.all([
    listSubscriptions({ campaignId: campaign || undefined, limit: 500 }),
    countSubscribersByCampaign(),
    searchCampaigns({ pageSize: 100 }),
  ]);
  const nameOf = new Map(campaigns.map((c) => [c._id, c.name]));
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const emails = subs.map((s) => s.email).join(",");

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Festival Offers", href: "/sitecraft-ai/offers" }, { label: "Subscribers" }]}
        title={<>Notify-Me subscribers</>}
        description={<>People who asked to hear about a coming-soon / future campaign, or joined early access. When a campaign first goes live, subscribers with a portal account get an in-portal
            notification automatically; email and WhatsApp are not sent by the system — export the list or use the links below.</>}
        actions={<><div className="flex items-center gap-2">
          <a href={`/sitecraft-ai/offers/subscribers/export${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ""}`} className={buttonVariants({ variant: "outline", size: "sm" })}>Export CSV</a>
          {subs.length > 0 && <a href={`mailto:?bcc=${encodeURIComponent(emails)}&subject=${encodeURIComponent(`New ${brand.name} offers are live`)}`} className={buttonVariants({ size: "sm" })}>Email all ({subs.length})</a>}
        </div></>}
      />

      <PanelListFilters>
<div className="flex flex-wrap gap-2">
        <Link href="/sitecraft-ai/offers/subscribers" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${!campaign ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:border-primary"}`}>All ({total})</Link>
        <Link href="/sitecraft-ai/offers/subscribers?campaign=any" className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${campaign === "any" ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:border-primary"}`}>Any campaign ({counts.get(null) ?? 0})</Link>
        {campaigns.filter((c) => counts.get(c._id)).map((c) => (
          <Link key={c._id} href={`/sitecraft-ai/offers/subscribers?campaign=${c._id}`} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${campaign === c._id ? "border-primary bg-primary text-primary-foreground" : "border-border/60 hover:border-primary"}`}>{c.name} ({counts.get(c._id)})</Link>
        ))}
      </div>

      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Subscriber</th>
                <th className="py-2 pr-3 font-medium">Phone</th>
                <th className="py-2 pr-3 font-medium">Interested in</th>
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 font-medium">Source</th>
                <th className="py-2 pr-3 font-medium">Notified</th>
                <th className="py-2 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s._id} className="border-b border-border/40 align-top last:border-0">
                  <td className="py-2 pr-3">
                    <a href={`mailto:${s.email}`} className="font-medium text-foreground hover:text-primary hover:underline">{s.email}</a>
                    {s.name && <span className="block text-xs text-muted-foreground">{s.name}</span>}
                    {s.message && <span className="mt-1 block max-w-xs text-xs italic text-muted-foreground">“{s.message}”</span>}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">
                    {s.phone ? <a href={`https://wa.me/${s.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" className="hover:text-primary hover:underline">{s.phone}</a> : "—"}
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.interest ? getAudienceLabel(s.interest) : "—"}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.campaignId ? nameOf.get(s.campaignId) ?? s.campaignId : "Any upcoming"}</td>
                  <td className="py-2 pr-3 text-muted-foreground capitalize">{s.source.replace("_", " ")}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{s.notifiedCampaignIds.length > 0 ? `${s.notifiedCampaignIds.length} campaign${s.notifiedCampaignIds.length > 1 ? "s" : ""}` : "Not yet"}</td>
                  <td className="py-2 text-muted-foreground">{formatDateTime(s.createdAt)}</td>
                </tr>
              ))}
              {subs.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No subscribers yet. They appear here when visitors use “Notify me” on a coming-soon page.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
