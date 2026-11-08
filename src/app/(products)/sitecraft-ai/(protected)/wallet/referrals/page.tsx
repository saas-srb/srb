import PanelTabs from "@/components/platform/panel/PanelTabs";
import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import ReasonAction from "@/components/products/dealflow-ai/wallet/ReasonAction";
import { getReferralsCollection } from "@/lib/wallet/referrals";
import { externalUsers } from "@/lib/portal-auth";
import { REFERRAL_STATUS_META, REFERRAL_STATUSES, REFERRAL_QUALIFYING_EVENT_LABELS, isValidQualifyingEvent } from "@/lib/wallet/constants";
import { approveReferralAction, rejectReferralAction, reverseReferralAction } from "../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Referrals · Wallet" };

export default async function AdminReferralsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const filter = REFERRAL_STATUSES.find((s) => s === status);
  const col = await getReferralsCollection();
  const referrals = await col.find(filter ? { status: filter } : {}).sort({ createdAt: -1 }).limit(200).toArray();
  const ids = [...new Set(referrals.flatMap((r) => [r.referrerUserId, r.refereeUserId]))];
  const users = ids.length ? await (await externalUsers()).find({ _id: { $in: ids } }).toArray() : [];
  const name = new Map(users.map((u) => [u._id, u]));
  const who = (id: string) => {
    const u = name.get(id);
    return u ? <Link className="text-primary hover:underline" href={`/sitecraft-ai/wallet/users/${id}`}>{u.displayName}</Link> : <span className="text-muted-foreground">Unknown</span>;
  };

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Referrals" }]}
        title={<>Referrals</>}
        actions={<><a href="/api/dealflow-ai/wallet/export?kind=referrals" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Export CSV</a></>}
      />
      <PanelListFilters>
<PanelTabs
        label="Referral status"
        active={filter ?? ""}
        tabs={[{ key: "", label: "All", href: "/sitecraft-ai/wallet/referrals" }, ...REFERRAL_STATUSES.map((s) => ({ key: s, label: REFERRAL_STATUS_META[s].label, href: `/sitecraft-ai/wallet/referrals?status=${s}` }))]}
      />
      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[960px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Date</th><th className="py-2 pr-3 font-medium">Referrer</th><th className="py-2 pr-3 font-medium">Referred</th><th className="py-2 pr-3 font-medium">Status</th><th className="py-2 pr-3 font-medium">Rewards</th><th className="py-2 font-medium">Actions</th></tr></thead>
            <tbody>
              {referrals.map((r) => {
                const meta = REFERRAL_STATUS_META[r.status];
                return (
                  <tr key={r._id} className="border-b border-border/40 align-top last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{r.createdAt.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3">{who(r.referrerUserId)}<div className="font-mono text-[10px] text-muted-foreground">{r.referralCode}</div></td>
                    <td className="py-2 pr-3">{who(r.refereeUserId)}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${meta.badgeClass}`}>{meta.label}</span>
                      {r.statusReason && <div className="mt-1 max-w-[220px] text-[11px] text-muted-foreground">{r.statusReason}</div>}
                      {r.status === "REGISTERED" && isValidQualifyingEvent(r.qualifyingEvent) && <div className="mt-1 text-[11px] text-muted-foreground">Waiting: {REFERRAL_QUALIFYING_EVENT_LABELS[r.qualifyingEvent]}</div>}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.rewardAmounts ? `${r.rewardAmounts.referrer} / ${r.rewardAmounts.referee}` : "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(r.status === "FRAUD_HOLD" || r.status === "REGISTERED") && <ReasonAction needsReason={false} label="Approve & reward" action={approveReferralAction.bind(null, r._id) as (x: string) => Promise<{ error?: string }>} />}
                        {(r.status === "FRAUD_HOLD" || r.status === "REGISTERED") && <ReasonAction label="Reject" destructive action={rejectReferralAction.bind(null, r._id)} />}
                        {r.status === "REWARDED" && <ReasonAction label="Reverse rewards" destructive action={reverseReferralAction.bind(null, r._id)} />}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {referrals.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No referrals yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
