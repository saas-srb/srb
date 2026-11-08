import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listUsageRules } from "@/lib/wallet/usage-rules";
import { USAGE_MODULE_LABELS, AUDIENCE_LABELS } from "@/lib/wallet/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage rules · Wallet" };

export default async function UsageRulesPage() {
  const rules = await listUsageRules();
  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Usage rules" }]}
        title={<>Credit usage rules</>}
        actions={<><Link href="/sitecraft-ai/wallet/usage-rules/new" className={buttonVariants({ size: "sm" })}>New rule</Link></>}
      />
      <PanelListFilters>
<p className="text-sm text-muted-foreground">Controls where and how much of a purchase credits may cover, per account type. Festival Offers is live; other modules take effect as each product is connected to the central wallet.</p>
      <GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-xs text-muted-foreground"><th className="py-2 pr-3 font-medium">Module</th><th className="py-2 pr-3 font-medium">Account type</th><th className="py-2 pr-3 font-medium">Max % of price</th><th className="py-2 pr-3 font-medium">Cap / min order</th><th className="py-2 font-medium">Status</th></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3"><Link className="font-medium text-foreground hover:text-primary hover:underline" href={`/sitecraft-ai/wallet/usage-rules/${r._id}`}>{USAGE_MODULE_LABELS[r.module]}</Link></td>
                  <td className="py-2 pr-3 text-muted-foreground">{AUDIENCE_LABELS[r.appliesToRole]}</td>
                  <td className="py-2 pr-3">{r.maxPercentOfPrice}%</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.maxCreditsPerTransaction ? `≤ ${r.maxCreditsPerTransaction}` : "no cap"} · {r.minOrderValue ? `min ${r.minOrderValue}` : "no min"}</td>
                  <td className="py-2 text-muted-foreground">{r.isEnabled ? "Allowed" : "Blocked"}</td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No rules — defaults apply (Festival Offers up to 100%, other modules closed).</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
