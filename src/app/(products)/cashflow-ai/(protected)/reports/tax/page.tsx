import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CalendarRange } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getTaxSummary } from "@/lib/products/cashflow-ai/reports/tax";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function TaxReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const dateFromStr = sp.dateFrom ?? monthStart();
  const dateToStr = sp.dateTo ?? new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(`${dateFromStr}T00:00:00`);
  const dateTo = new Date(`${dateToStr}T23:59:59`);

  const result = await getTaxSummary({ dateFrom, dateTo });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Tax" }]}
        title={<>Tax Report</>}
        description={<>Tax collected on income vs. tax paid on expenses, from settled transactions&apos; <code>taxAmount</code>.
          A single flat figure per transaction, not a CGST/SGST/IGST breakdown.</>}
      />

      <PanelListFilters>
<div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarRange className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Tax Period</h3>
            <p className="text-xs text-muted-foreground">Filter tax collected and paid by date range</p>
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
          <div className="ml-auto flex items-center gap-3 text-sm">
            {(["csv", "xlsx", "pdf"] as const).map((fmt) => (
              <a
                key={fmt}
                href={`/api/cashflow-ai/reports/tax?format=${fmt}&dateFrom=${dateFromStr}&dateTo=${dateToStr}`}
                className="text-primary hover:underline"
              >
                Export {fmt.toUpperCase()}
              </a>
            ))}
          </div>
        </form>
      </div>

      <KpiGrid>
        <KpiCard label="Tax Collected" value={<span>{formatMoney(result.taxCollected)}</span>} tone="up" />
        <KpiCard label="Tax Paid" value={<span>{formatMoney(result.taxPaid)}</span>} tone="down" />
        <KpiCard label="Net Payable" value={<span>{formatMoney(result.netPayable)}</span>} accent />
      </KpiGrid>
</PanelListFilters>
    </div>
  );
}
