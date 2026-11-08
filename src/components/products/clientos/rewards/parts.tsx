import PanelTabs from "@/components/platform/panel/PanelTabs";
import Link from "next/link";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import { formatDate } from "@/lib/utils";
import type { HistoryRow } from "@/lib/products/clientos/rewards";
import type { LucideIcon } from "lucide-react";

/** The 3-step "how it works" strip used by the Refer & earn page — reused so every earn section reads the same way. */
export function HowItWorks({ steps }: { steps: { icon: LucideIcon; title: string; body: string }[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {steps.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-start gap-3 rounded-2xl border border-border/50 p-4">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RewardHistory({ title, rows, empty }: { title: string; rows: HistoryRow[]; empty: string }) {
  return (
    <GlassCard interactive={false}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Date</th>
              <th className="py-2 pr-3 font-medium">Reward</th>
              <th className="py-2 pr-3 font-medium">Credits</th>
              <th className="py-2 font-medium">Balance after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-0">
                <td className="py-2 pr-3 text-muted-foreground">{formatDate(r.date)}</td>
                <td className="py-2 pr-3 text-foreground">{r.label}</td>
                <td className="py-2 pr-3 font-semibold text-green-600 dark:text-green-400">+{r.amount.toLocaleString("en-IN")}</td>
                <td className="py-2 text-muted-foreground">{r.balanceAfter.toLocaleString("en-IN")}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-8 text-center text-muted-foreground">{empty}</td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </GlassCard>
  );
}

/** Cross-links between the earn sections + the public guide. */
export function EarnNav({ current }: { current: "referrals" | "daily" | "journey" | "tasks" | "wallet" }) {
  const items = [
    { id: "referrals", href: "/clientos/referrals", label: "Refer & earn" },
    { id: "daily", href: "/clientos/rewards/daily", label: "Daily rewards" },
    { id: "journey", href: "/clientos/rewards/journey", label: "Journey rewards" },
    { id: "tasks", href: "/clientos/rewards/tasks", label: "Bonus tasks" },
  ] as const;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PanelTabs label="Earn sections" active={current} tabs={items.map((i) => ({ key: i.id, label: i.label, href: i.href }))} />
      <Link href="/rewards" className="ml-auto text-xs font-semibold text-primary hover:underline">Full rewards guide →</Link>
    </div>
  );
}
