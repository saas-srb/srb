import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import { headers } from "next/headers";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getReferralOverview } from "@/lib/products/clientos/wallet";
import { REFERRAL_STATUS_META, type ReferralStatus } from "@/lib/wallet/constants";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PortalPageHeader, PortalStat } from "@/components/products/clientos/widgets";
import { Users, BadgeCheck, Coins, Hourglass, Share2, UserPlus, Gift } from "lucide-react";
import ReferralCodeCard from "@/components/products/clientos/ReferralCodeCard";
import { EarnNav } from "@/components/products/clientos/rewards/parts";
import { formatDate } from "@/lib/utils";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { getCompanyBrand } from "@/lib/platform/branding";
import { companySiteUrl } from "@/lib/platform/tenancy/site-url";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Referrals · {brand} {product:portal}");

export default async function PortalReferralsPage() {
  const brand = await getCompanyBrand();
  const user = await guardPortalPage();
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const overview = await getReferralOverview(user.id, host ? `${proto}://${host}` : await companySiteUrl());

  return (
    <div className="space-y-5">
      <PortalPageHeader title="Refer & earn" subtitle={`Share your link. When someone new joins ${brand.name} through it, you both earn credits.`} />
      <PanelListFilters>
<EarnNav current="referrals" />
      <ReferralCodeCard code={overview.code} link={overview.link} />

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Share2, title: "1 · Share your link", body: "Send your code or link to friends and colleagues." },
          { icon: UserPlus, title: "2 · They join", body: "They sign up through it and get a welcome bonus." },
          { icon: Gift, title: "3 · You both earn", body: "Credits land in your wallet once the referral qualifies." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="flex items-start gap-3 rounded-2xl border border-border/50 p-4">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span>
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <PortalStat icon={Users} label="Total referred" value={overview.totalReferred.toLocaleString("en-IN")} />
        <PortalStat icon={BadgeCheck} label="Rewarded" value={overview.rewarded.toLocaleString("en-IN")} />
        <PortalStat icon={Coins} label="Credits earned" value={overview.creditsEarned.toLocaleString("en-IN")} />
        <PortalStat icon={Hourglass} label="Pending credits" value={overview.pendingCredits.toLocaleString("en-IN")} hint="Released when referrals qualify" />
      </div>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Your referrals</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Reward</th>
                <th className="py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {overview.rows.map((r) => {
                const meta = REFERRAL_STATUS_META[r.status as ReferralStatus];
                return (
                  <tr key={r.id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3 text-foreground">{r.name}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>{meta.label}</span>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.reward ? `+${r.reward.toLocaleString("en-IN")}` : "—"}</td>
                    <td className="py-2 text-muted-foreground">{formatDate(r.createdAt)}</td>
                  </tr>
                );
              })}
              {overview.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-muted-foreground">
                    <span className="mx-auto mb-2 flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Users className="size-5" /></span>
                    No referrals yet — share your link to get started.
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
