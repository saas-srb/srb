import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import Link from "next/link";
import { CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { listRewardRules } from "@/lib/wallet/reward-rules";
import { REWARD_RULE_TYPE_LABELS, AUDIENCE_LABELS } from "@/lib/wallet/constants";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reward rules · Wallet" };

export default async function RewardRulesPage() {
  const rules = await listRewardRules();
  return (
    <div className="relative space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dealflow-ai" }, { label: "Wallet", href: "/sitecraft-ai/wallet" }, { label: "Reward rules" }]}
        title={<>Reward rules</>}
        actions={<><Link href="/sitecraft-ai/wallet/rules/new" className={buttonVariants({ size: "sm" })}>New rule</Link></>}
      />
      <PanelListFilters>
<GlassCard>
        <CardContent className="overflow-x-auto py-3">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Reward</th><th className="py-2 pr-3 font-medium">Audience</th>
                <th className="py-2 pr-3 font-medium">Credits</th><th className="py-2 pr-3 font-medium">Expiry</th><th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r._id} className="border-b border-border/40 last:border-0">
                  <td className="py-2 pr-3"><Link className="font-medium text-foreground hover:text-primary hover:underline" href={`/sitecraft-ai/wallet/rules/${r._id}`}>{REWARD_RULE_TYPE_LABELS[r.type]}</Link>{r.subKey && <span className="ml-1.5 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-secondary-foreground">{r.subKey}</span>}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{AUDIENCE_LABELS[r.appliesToRole]}</td>
                  <td className="py-2 pr-3 text-foreground">{r.amount.toLocaleString("en-IN")}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{r.expiresInDays ? `${r.expiresInDays} days` : "Never"}</td>
                  <td className="py-2 text-muted-foreground">{r.isActive ? "Active" : "Inactive"}</td>
                </tr>
              ))}
              {rules.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No rules yet — no rewards are issued until you create one.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
