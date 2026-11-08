import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ReasonAction from "@/components/products/dealflow-ai/wallet/ReasonAction";
import { listCampaigns } from "@/lib/wallet/campaigns";
import { REFERRAL_QUALIFYING_EVENT_LABELS, AUDIENCE_LABELS } from "@/lib/wallet/constants";
import { toggleCampaignAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referral campaigns · Wallet" };

export default async function CampaignsPage() {
  const campaigns = await listCampaigns();
  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Referral campaigns" }]}
        title={<>Referral campaigns</>}
        actions={<><Link href="/sitecraft-ai/wallet/campaigns/new" className={buttonVariants({ size: "sm" })}>New campaign</Link></>}
      />
      <PanelListFilters>
<p className="text-sm text-muted-foreground">
        {campaigns.length === 0 ? "No campaigns yet — referrals currently run with defaults (reward on account creation, 50 referrals per person). Create a campaign to control this; once one exists, referrals only work while one is active." : "Referrals are only attributed while at least one campaign is active for the referrer's account type."}
      </p>
      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Campaign</th><th className="py-2 pr-3 font-medium">Who can refer</th><th className="py-2 pr-3 font-medium">Reward released when</th><th className="py-2 pr-3 font-medium">Window</th><th className="py-2 font-medium">Status</th></tr></thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3"><Link className="font-medium text-foreground hover:text-primary hover:underline" href={`/sitecraft-ai/wallet/campaigns/${c._id}`}>{c.name}</Link></td>
                  <td className="py-2 pr-3 text-muted-foreground">{AUDIENCE_LABELS[c.referrerAudience]}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{REFERRAL_QUALIFYING_EVENT_LABELS[c.qualifyingEvent]}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{c.startsAt ? c.startsAt.toLocaleDateString("en-IN") : "Now"} → {c.endsAt ? c.endsAt.toLocaleDateString("en-IN") : "No end"}</td>
                  <td className="flex items-center gap-2 py-2">
                    <span className={c.isActive ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}>{c.isActive ? "Active" : "Off"}</span>
                    <ReasonAction needsReason={false} label={c.isActive ? "Disable" : "Enable"} action={toggleCampaignAction.bind(null, c._id, !c.isActive) as (r: string) => Promise<{ error?: string }>} />
                  </td>
                </tr>
              ))}
              {campaigns.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No campaigns.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
