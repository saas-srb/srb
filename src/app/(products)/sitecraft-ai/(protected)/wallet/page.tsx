import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { UserSearch } from "lucide-react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getWalletAnalytics } from "@/lib/wallet/analytics";
import ReasonAction from "@/components/products/dealflow-ai/wallet/ReasonAction";
import { runExpirySweepAction } from "./actions";
import { externalUsers } from "@/lib/portal-auth";
import { formatCredits, REFERRAL_STATUSES, REFERRAL_STATUS_META, WALLET_TX_TYPE_LABELS, isValidWalletTxType } from "@/lib/wallet/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet & Credits" };

export default async function WalletOverviewPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const [a, users] = await Promise.all([getWalletAnalytics(), externalUsers()]);
  const term = q?.trim();
  const found = term
    ? await users.find({ email: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }).limit(10).toArray()
    : [];
  const stats: [string, string][] = [
    ["Wallets", String(a.wallets.count)],
    ["Outstanding (available)", formatCredits(a.wallets.available)],
    ["Lifetime issued", formatCredits(a.wallets.earned)],
    ["Lifetime redeemed", formatCredits(a.wallets.redeemed)],
    ["Expired", formatCredits(a.wallets.expired)],
    ["Reversed", formatCredits(a.wallets.reversed)],
  ];
  const maxDay = Math.max(1, ...a.referralsByDay.map((d) => d.count));
  const held = a.referralFunnel.FRAUD_HOLD;

  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet" }]}
        title={<>Wallet &amp; Credits</>}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Promotional credits only — not cash, not an accounting balance.</p>
        <ReasonAction needsReason={false} label="Run expiry sweep" action={runExpirySweepAction as (r: string) => Promise<{ error?: string }>} />
      </div>
      {held > 0 && (
        <Link href="/sitecraft-ai/wallet/referrals?status=FRAUD_HOLD" className="block rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {held} referral{held === 1 ? " is" : "s are"} on fraud hold and waiting for review →
        </Link>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map(([l, v]) => (
          <GlassCard key={l} interactive={false}><CardContent className="py-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-black text-foreground">{v}</p></CardContent></GlassCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="text-base">Referral funnel · {a.conversionPct}% rewarded</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {REFERRAL_STATUSES.map((s) => {
              const n = a.referralFunnel[s];
              const pct = a.referralFunnel.total ? (n / a.referralFunnel.total) * 100 : 0;
              return (
                <div key={s} className="text-sm">
                  <div className="flex justify-between"><Link href={`/sitecraft-ai/wallet/referrals?status=${s}`} className="hover:underline">{REFERRAL_STATUS_META[s].label}</Link><span className="text-muted-foreground">{n}</span></div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary"><div className={`h-full ${REFERRAL_STATUS_META[s].dotClass}`} style={{ width: `${pct}%` }} /></div>
                </div>
              );
            })}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="text-base">Referrals, last 14 days</CardTitle></CardHeader>
          <CardContent>
            <div className="flex h-28 items-end gap-1">
              {a.referralsByDay.map((d) => (
                <div key={d.day} title={`${d.day}: ${d.count}`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(4, (d.count / maxDay) * 100)}%`, opacity: d.count ? 1 : 0.25 }} />
              ))}
            </div>
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="text-base">Credits issued by source</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {a.creditsByType.map((t) => (
              <div key={t.type} className="flex justify-between"><span>{isValidWalletTxType(t.type) ? WALLET_TX_TYPE_LABELS[t.type] : t.type} <span className="text-xs text-muted-foreground">×{t.count}</span></span><span className="font-medium">{formatCredits(t.credits)}</span></div>
            ))}
            {a.creditsByType.length === 0 && <p className="text-muted-foreground">Nothing issued yet.</p>}
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader><CardTitle className="text-base">Top referrers</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {a.topReferrers.map((t) => (
              <div key={t.userId} className="flex justify-between"><Link className="text-primary hover:underline" href={`/sitecraft-ai/wallet/users/${t.userId}`}>{t.name}</Link><span className="text-muted-foreground">{t.rewarded} rewarded · {formatCredits(t.credits)}</span></div>
            ))}
            {a.topReferrers.length === 0 && <p className="text-muted-foreground">No rewarded referrals yet.</p>}
          </CardContent>
        </GlassCard>
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <UserSearch className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Find a Wallet User</h3>
            <p className="text-xs text-muted-foreground">Look up a wallet holder by their account email</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <form className="flex gap-2" action="/sitecraft-ai/wallet">
            <input
              name="q"
              defaultValue={q ?? ""}
              placeholder="Find a user by email…"
              className="h-9 w-full max-w-sm rounded-xl border border-border/50 bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
            />
            <button className="rounded-xl border border-border/50 px-3 text-xs font-medium text-foreground hover:bg-primary/5 transition-colors">Search</button>
          </form>
          {found.map((u) => (
            <Link key={u._id} href={`/sitecraft-ai/wallet/users/${u._id}`} className="block text-sm text-primary hover:underline">{u.displayName} — {u.email}</Link>
          ))}
          {term && found.length === 0 && <p className="text-sm text-muted-foreground">No users match.</p>}
        </div>
      </div>
    </div>
  );
}
