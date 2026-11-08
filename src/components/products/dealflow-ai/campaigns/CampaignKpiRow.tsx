import { Wallet, Users, Tag, CheckCircle2, Trophy, TrendingUp, Percent } from "lucide-react";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import { formatCurrency, formatPercent } from "@/lib/utils";
import type { CampaignAnalytics } from "@/lib/campaigns";

export default function CampaignKpiRow({ totals, currency }: { totals: CampaignAnalytics["totals"]; currency: string }) {
  const roiTone = totals.roiPercent == null ? undefined : totals.roiPercent >= 0 ? "up" : "down";
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <KpiCard label="Spend" value={formatCurrency(totals.spend, currency)} icon={<Wallet className="size-4" />} accent />
      <KpiCard label="Attributed Leads" value={totals.leadsAttributed} icon={<Users className="size-4" />} />
      <KpiCard label="Cost / Lead" value={totals.cpl == null ? "—" : formatCurrency(totals.cpl, currency)} icon={<Tag className="size-4" />} />
      <KpiCard label="Qualified" value={totals.qualified} icon={<CheckCircle2 className="size-4" />} />
      <KpiCard label="Won" value={totals.completed} icon={<Trophy className="size-4" />} />
      <KpiCard label="Revenue" value={totals.revenue > 0 ? formatCurrency(totals.revenue, currency) : "—"} icon={<TrendingUp className="size-4" />} />
      <KpiCard label="ROI" value={totals.roiPercent == null ? "—" : formatPercent(totals.roiPercent)} icon={<Percent className="size-4" />} tone={roiTone} />
    </div>
  );
}
