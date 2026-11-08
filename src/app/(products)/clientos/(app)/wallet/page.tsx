import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import Link from "next/link";
import { guardPortalPage } from "@/lib/products/clientos/guard";
import { getWalletOverview, getWalletHistory } from "@/lib/products/clientos/wallet";
import { txLabel, formatCredits } from "@/lib/wallet/constants";
import { EarnNav } from "@/components/products/clientos/rewards/parts";
import { Hourglass, Lock, Clock3, TrendingUp, ShoppingBag, CalendarX } from "lucide-react";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { PortalPageHeader, PortalStat } from "@/components/products/clientos/widgets";
import { formatDateTime } from "@/lib/utils";
import { BrandName } from "@/components/platform/BrandProvider";
import { brandedMetadata } from "@/lib/platform/branding/metadata";
import { getCompanyBrand } from "@/lib/platform/branding";

export const dynamic = "force-dynamic";
export const generateMetadata = () => brandedMetadata("Wallet · {brand} {product:portal}");

export default async function PortalWalletPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const brand = await getCompanyBrand();
  const user = await guardPortalPage();
  const { page } = await searchParams;
  const pageNum = Math.max(Number(page) || 1, 1);
  const [overview, history] = await Promise.all([getWalletOverview(user.id), getWalletHistory(user.id, pageNum)]);
  const b = overview.balances;

  return (
    <div className="space-y-5">
      <PortalPageHeader title={`${brand.name} Wallet`} subtitle="Promotional credits you earn and can redeem on eligible offers." />

      <PanelListFilters>
<GlassCard interactive={false}>
        <CardContent className="py-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Available credits</p>
          <p className="mt-2 text-4xl font-black tracking-tight text-foreground">{formatCredits(b.available)}</p>
          {overview.status === "frozen" && <p className="mt-2 text-sm text-destructive">This wallet is frozen — contact support.</p>}
          <div className="mt-4 flex flex-wrap justify-center gap-2 text-sm">
            <Link href="/offers" className="rounded-full bg-primary px-5 py-2 font-semibold text-primary-foreground">Use Credits</Link>
            <Link href="/clientos/referrals" className="rounded-full border border-border px-5 py-2 font-medium hover:border-primary">Earn Credits</Link>
            <a href="/api/clientos/wallet/statement" className="rounded-full border border-border px-5 py-2 font-medium hover:border-primary">Download statement</a>
          </div>
        </CardContent>
      </GlassCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <PortalStat icon={Hourglass} label="Pending" value={b.pending.toLocaleString("en-IN")} />
        <PortalStat icon={Lock} label="Locked (in redemption)" value={b.locked.toLocaleString("en-IN")} />
        <PortalStat icon={Clock3} label="Expiring in 30 days" value={overview.expiringSoon.toLocaleString("en-IN")} />
        <PortalStat icon={TrendingUp} label="Lifetime earned" value={b.lifetimeEarned.toLocaleString("en-IN")} />
        <PortalStat icon={ShoppingBag} label="Lifetime used" value={b.lifetimeRedeemed.toLocaleString("en-IN")} />
        <PortalStat icon={CalendarX} label="Expired" value={b.lifetimeExpired.toLocaleString("en-IN")} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Earn more credits</p>
        <EarnNav current="wallet" />
      </div>

      <GlassCard interactive={false}>
        <CardHeader>
          <CardTitle className="text-base">Transactions</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Amount</th>
                <th className="py-2 font-medium">Balance after</th>
              </tr>
            </thead>
            <tbody>
              {history.items.map((t) => (
                <tr key={t._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                  <td className="py-2 pr-3 text-foreground">{txLabel(t.type, t.metadata)}</td>
                  <td className={`py-2 pr-3 font-semibold ${t.direction === "credit" ? "text-green-600 dark:text-green-400" : "text-foreground"}`}>
                    {t.direction === "credit" ? "+" : "−"}
                    {t.amount.toLocaleString("en-IN")}
                  </td>
                  <td className="py-2 text-muted-foreground">{t.balanceAfter.toLocaleString("en-IN")}</td>
                </tr>
              ))}
              {history.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-muted-foreground">No transactions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
          {history.totalPages > 1 && (
            <div className="mt-3 flex justify-between text-sm">
              {pageNum > 1 ? <Link className="text-primary" href={`/clientos/wallet?page=${pageNum - 1}`}>← Newer</Link> : <span />}
              {pageNum < history.totalPages && <Link className="text-primary" href={`/clientos/wallet?page=${pageNum + 1}`}>Older →</Link>}
            </div>
          )}
        </CardContent>
      </GlassCard>

      <p className="text-xs text-muted-foreground">
        <BrandName /> Credits are promotional/reward credits, not cash. They are subject to eligibility, expiry, redemption limits and campaign rules, are not
        transferable, and may be reversed in case of cancellation or misuse.
      </p>
</PanelListFilters>
    </div>
  );
}
