import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getDb } from "@/lib/mongodb";
import { WALLETS_COLLECTION, type Wallet } from "@/lib/wallet/wallets";
import { externalUsers } from "@/lib/portal-auth";
import { AUDIENCE_LABELS, isValidRewardRuleAudience } from "@/lib/wallet/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wallet balances · Wallet" };

export default async function AllWalletsPage() {
  const db = await getDb();
  const wallets = await db.collection<Wallet>(WALLETS_COLLECTION).find({ deletedAt: null }).sort({ "balances.available": -1 }).limit(200).toArray();
  const users = wallets.length ? await (await externalUsers()).find({ _id: { $in: wallets.map((w) => w._id) } }).toArray() : [];
  const byId = new Map(users.map((u) => [u._id, u]));
  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Balances" }]}
        title={<>Wallet balances</>}
        actions={<><a href="/api/dealflow-ai/wallet/export?kind=wallets" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Export CSV</a></>}
      />
      <PanelListFilters>
<GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">User</th><th className="py-2 pr-3 font-medium">Type</th><th className="py-2 pr-3 font-medium">Available</th><th className="py-2 pr-3 font-medium">Locked</th><th className="py-2 pr-3 font-medium">Earned</th><th className="py-2 pr-3 font-medium">Used</th><th className="py-2 font-medium">Status</th></tr></thead>
            <tbody>
              {wallets.map((w) => {
                const u = byId.get(w._id);
                return (
                  <tr key={w._id} className="border-b border-border/40 last:border-0">
                    <td className="py-2 pr-3"><Link className="font-medium text-primary hover:underline" href={`/sitecraft-ai/wallet/users/${w._id}`}>{u?.displayName ?? w._id.slice(0, 8)}</Link><div className="text-[11px] text-muted-foreground">{u?.email}</div></td>
                    <td className="py-2 pr-3 text-muted-foreground">{isValidRewardRuleAudience(w.role) ? AUDIENCE_LABELS[w.role] : w.role}</td>
                    <td className="py-2 pr-3 font-semibold">{w.balances.available.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{w.balances.locked.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{w.balances.lifetimeEarned.toLocaleString("en-IN")}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{w.balances.lifetimeRedeemed.toLocaleString("en-IN")}</td>
                    <td className="py-2 text-muted-foreground">{w.status}</td>
                  </tr>
                );
              })}
              {wallets.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No wallets yet.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
