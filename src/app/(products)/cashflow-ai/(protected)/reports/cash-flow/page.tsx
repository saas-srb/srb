import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { ArrowDownCircle, ArrowUpCircle, Wallet, CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getCashFlow } from "@/lib/products/cashflow-ai/reports/cash-flow";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const dateFromStr = sp.dateFrom ?? monthStart();
  const dateToStr = sp.dateTo ?? new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(`${dateFromStr}T00:00:00`);
  const dateTo = new Date(`${dateToStr}T23:59:59`);

  const result = await getCashFlow(dateFrom, dateTo);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Cash Flow" }]}
        title={<>Cash Flow</>}
        description={<>Direct method — cash in and out of real bank/cash accounts for the selected range. No operating/investing/financing
          categorization yet.</>}
      />

      <PanelListFilters>
<div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarRange className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Cash Flow Period</h3>
            <p className="text-xs text-muted-foreground">Select the date range to compute cash in vs. cash out</p>
          </div>
        </div>
        <form className="mt-4 flex flex-wrap items-end gap-3" method="get">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">From</label>
            <Input type="date" name="dateFrom" defaultValue={dateFromStr} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">To</label>
            <Input type="date" name="dateTo" defaultValue={dateToStr} className="h-9 rounded-xl border-border/50 bg-background focus-visible:border-primary focus-visible:ring-primary/40" />
          </div>
          <Button type="submit" size="sm" variant="secondary">Apply</Button>
        </form>
      </div>

      <KpiGrid>
        <KpiCard label="Opening Balance" value={<span>{formatMoney(result.openingBalance)}</span>} icon={<Wallet className="size-4" />} />
        <KpiCard label="Cash In" value={<span>{formatMoney(result.cashIn)}</span>} tone="up" icon={<ArrowUpCircle className="size-4" />} />
        <KpiCard label="Cash Out" value={<span>{formatMoney(result.cashOut)}</span>} tone="down" icon={<ArrowDownCircle className="size-4" />} />
        <KpiCard label="Closing Balance" value={<span>{formatMoney(result.closingBalance)}</span>} accent icon={<Wallet className="size-4" />} />
      </KpiGrid>

      <GlassCard interactive={false}>
        <CardContent className="space-y-3 py-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Opening Balance</span>
            <span className="tabular-nums font-medium">{formatMoney(result.openingBalance)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">+ Cash In</span>
            <span className="tabular-nums font-medium text-green-600 dark:text-green-400">{formatMoney(result.cashIn)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">− Cash Out</span>
            <span className="tabular-nums font-medium text-destructive">{formatMoney(result.cashOut)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-border/40 pt-3">
            <span className="font-medium text-foreground">Net Cash Flow</span>
            <span className="tabular-nums font-bold">{formatMoney(result.netCashFlow)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">Closing Balance</span>
            <span className="tabular-nums font-bold">{formatMoney(result.closingBalance)}</span>
          </div>
        </CardContent>
      </GlassCard>
</PanelListFilters>
    </div>
  );
}
