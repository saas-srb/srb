import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listWalletTransactions } from "@/lib/wallet/transactions";
import { txLabel } from "@/lib/wallet/constants";
import { formatDateTime } from "@/lib/utils";
import ReasonAction from "@/components/products/dealflow-ai/wallet/ReasonAction";
import { reverseTransactionAction, refundRedemptionAction } from "../actions";

const REVERSIBLE = ["signup_bonus", "referral_bonus_referrer", "referral_bonus_referee", "activity_reward", "manual_adjustment"];

export const dynamic = "force-dynamic";
export const metadata = { title: "Ledger · Wallet" };

export default async function WalletLedgerPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const { page } = await searchParams;
  const pageNum = Math.max(Number(page) || 1, 1);
  const res = await listWalletTransactions({ page: pageNum, pageSize: 50 });
  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Ledger" }]}
        title={<>Wallet ledger</>}
        actions={<><a href="/api/dealflow-ai/wallet/export?kind=ledger" className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary">Export CSV</a></>}
      />
      <PanelListFilters>
<p className="text-sm text-muted-foreground">Immutable, append-only record of every promotional-credit movement. Promotional credits — not accounting balances.</p>
      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">When</th><th className="py-2 pr-3 font-medium">User</th><th className="py-2 pr-3 font-medium">Type</th>
                <th className="py-2 pr-3 font-medium">Amount</th><th className="py-2 pr-3 font-medium">Before → After</th><th className="py-2 pr-3 font-medium">Reason</th><th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {res.items.map((t) => (
                <tr key={t._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                  <td className="py-2 pr-3"><Link className="font-mono text-xs text-primary hover:underline" href={`/sitecraft-ai/wallet/users/${t.userId}`}>{t.userId.slice(0, 8)}…</Link></td>
                  <td className="py-2 pr-3 text-foreground">{txLabel(t.type, t.metadata)}</td>
                  <td className="py-2 pr-3 font-semibold">{t.direction === "credit" ? "+" : "−"}{t.amount.toLocaleString("en-IN")} <span className="text-[10px] font-normal text-muted-foreground">{t.bucket}</span></td>
                  <td className="py-2 pr-3 text-muted-foreground">{t.balanceBefore.toLocaleString("en-IN")} → {t.balanceAfter.toLocaleString("en-IN")}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{t.reason ?? "—"}{t.status !== "active" && <span className="ml-1 text-[10px] uppercase">({t.status})</span>}</td>
                  <td className="py-2">
                    {t.status === "active" && t.direction === "credit" && REVERSIBLE.includes(t.type) && <ReasonAction label="Reverse" destructive action={reverseTransactionAction.bind(null, t._id)} />}
                    {t.status === "active" && t.type === "redemption_confirmed" && <ReasonAction label="Refund" destructive action={refundRedemptionAction.bind(null, t._id)} />}
                  </td>
                </tr>
              ))}
              {res.items.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-muted-foreground">No transactions yet.</td></tr>}
            </tbody>
          </table>
          {res.totalPages > 1 && (
            <div className="mt-3 flex justify-between text-sm">
              {pageNum > 1 ? <Link className="text-primary" href={`/sitecraft-ai/wallet/ledger?page=${pageNum - 1}`}>← Newer</Link> : <span />}
              {pageNum < res.totalPages && <Link className="text-primary" href={`/sitecraft-ai/wallet/ledger?page=${pageNum + 1}`}>Older →</Link>}
            </div>
          )}
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
