import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { notFound } from "next/navigation";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import AdjustWalletForm from "@/components/products/dealflow-ai/wallet/AdjustWalletForm";
import { externalUsers } from "@/lib/portal-auth";
import { getWallet } from "@/lib/wallet/wallets";
import { listWalletTransactions } from "@/lib/wallet/transactions";
import { txLabel, formatCredits } from "@/lib/wallet/constants";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUserWalletPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const users = await externalUsers();
  const user = await users.findOne({ _id: userId });
  if (!user) notFound();
  const [wallet, txs] = await Promise.all([getWallet(userId), listWalletTransactions({ userId, pageSize: 50 })]);
  const b = wallet?.balances;
  return (
    <div className="space-y-4">
<PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: user.displayName }]}
        title={<>{user.displayName}</>}
        description={<>{user.email} · {user.role.replace("_", " ")} · wallet {wallet?.status ?? "not created yet"}</>}
      />
<div className="relative mx-auto max-w-4xl space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[["Available", b?.available ?? 0], ["Locked", b?.locked ?? 0], ["Earned", b?.lifetimeEarned ?? 0], ["Used", b?.lifetimeRedeemed ?? 0]].map(([l, v]) => (
          <GlassCard key={String(l)} interactive={false}><CardContent className="py-4"><p className="text-xs text-muted-foreground">{l}</p><p className="text-xl font-black">{formatCredits(Number(v))}</p></CardContent></GlassCard>
        ))}
      </div>
      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="text-base">Manual adjustment</CardTitle></CardHeader>
        <CardContent><AdjustWalletForm userId={userId} frozen={wallet?.status === "frozen"} /></CardContent>
      </GlassCard>
      <GlassCard interactive={false}>
        <CardHeader><CardTitle className="text-base">Ledger</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Amount</th><th className="py-2 pr-3 font-medium">Before → After</th><th className="py-2 font-medium">Reason</th></tr></thead>
            <tbody>
              {txs.items.map((t) => (
                <tr key={t._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                  <td className="py-2 pr-3">{txLabel(t.type, t.metadata)}</td>
                  <td className="py-2 pr-3 font-semibold">{t.direction === "credit" ? "+" : "−"}{t.amount.toLocaleString("en-IN")}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{t.balanceBefore} → {t.balanceAfter}</td>
                  <td className="py-2 text-muted-foreground">{t.reason ?? "—"}</td>
                </tr>
              ))}
              {txs.items.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No transactions.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
    </div>
</div>
  );
}
