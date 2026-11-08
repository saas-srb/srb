import PanelListFilters from "@/components/platform/panel/PanelListFilters";
import PanelPageHeader from "@/components/platform/panel/PanelPageHeader";
import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import GlassCard from "@/components/products/dealflow-ai/GlassCard";
import KpiCard from "@/components/products/dealflow-ai/KpiCard";
import KpiGrid from "@/components/products/dealflow-ai/KpiGrid";
import Breadcrumbs from "@/components/products/dealflow-ai/Breadcrumbs";
import { getProfitAndLoss } from "@/lib/products/cashflow-ai/reports/profit-and-loss";
import { formatMoney } from "@/lib/products/cashflow-ai/constants";

function monthStart(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

export default async function ProfitAndLossPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const dateFromStr = sp.dateFrom ?? monthStart();
  const dateToStr = sp.dateTo ?? new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(`${dateFromStr}T00:00:00`);
  const dateTo = new Date(`${dateToStr}T23:59:59`);

  const result = await getProfitAndLoss({ dateFrom, dateTo });

  return (
    <div className="space-y-4">
      <PanelPageHeader
        breadcrumbs={[{ label: "CashFlow", href: "/cashflow-ai" }, { label: "Reports" }, { label: "Profit & Loss" }]}
        title={<>Profit &amp; Loss</>}
        description={<>Income and expense account totals for the selected range, computed from posted journal entries.</>}
      />

      <PanelListFilters>
<div className="rounded-2xl border border-border/40 bg-card/90 p-5 shadow-sm backdrop-blur-md">
        <div className="flex items-center gap-3 border-b border-border/40 pb-4">
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <CalendarRange className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-foreground">Reporting Period</h3>
            <p className="text-xs text-muted-foreground">Select the date range for income and expense totals</p>
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
        <KpiCard label="Total Income" value={<span>{formatMoney(result.totalIncome)}</span>} accent />
        <KpiCard label="Total Expenses" value={<span>{formatMoney(result.totalExpenses)}</span>} />
        <KpiCard
          label="Net Profit"
          value={<span>{formatMoney(result.netProfit)}</span>}
          tone={result.netProfit >= 0 ? "up" : "down"}
        />
      </KpiGrid>

      <div className="grid gap-4 md:grid-cols-2">
        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Income</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.income.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">No income posted in this range.</TableCell>
                  </TableRow>
                )}
                {result.income.map((l) => (
                  <TableRow key={l.accountId}>
                    <TableCell><Badge variant="secondary" className="mr-2">{l.accountCode}</Badge>{l.accountName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {result.income.length > 0 && (
                <tfoot>
                  <TableRow>
                    <TableCell className="font-bold text-foreground">Total Income</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{formatMoney(result.totalIncome)}</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </CardContent>
        </GlassCard>

        <GlassCard interactive={false}>
          <CardHeader><CardTitle>Expenses</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {result.expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-muted-foreground">No expenses posted in this range.</TableCell>
                  </TableRow>
                )}
                {result.expenses.map((l) => (
                  <TableRow key={l.accountId}>
                    <TableCell><Badge variant="secondary" className="mr-2">{l.accountCode}</Badge>{l.accountName}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(l.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {result.expenses.length > 0 && (
                <tfoot>
                  <TableRow>
                    <TableCell className="font-bold text-foreground">Total Expenses</TableCell>
                    <TableCell className="text-right tabular-nums font-bold">{formatMoney(result.totalExpenses)}</TableCell>
                  </TableRow>
                </tfoot>
              )}
            </Table>
          </CardContent>
        </GlassCard>
      </div>
</PanelListFilters>
    </div>
  );
}
